'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { categories } from '@/examples/registry';
import type { KeyframePreview } from './keyframe-previews';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { StateChange } from 'visdelta/core';
import { formatChange } from '@/components/live/transition-player';

export interface TimelineKey {
  id: number;
  /** What changed since the previous keyframe; empty for the first. */
  changes: StateChange[];
  /** Serial route stages VisDelta planned for the leg into this keyframe; 0 for the first. */
  stages: number;
  stageLabels?: string[];
  stageDetails?: string[];
}

interface TimelineProps {
  keyframes: TimelineKey[];
  previews: Record<number, KeyframePreview>;
  onPreview: (id: number | null) => void;
  /** Playhead in keyframe units (the sequence's own position), shown while replaying. */
  value: number;
  /** Real playback time of one route stage, in milliseconds. */
  stageDuration: number;
  replaying: boolean;
  playing: boolean;
  /** A new playhead, in keyframe units. */
  onScrub: (value: number) => void;
  onSeek: (index: number) => void;
  onPlay: () => void;
  onKeep: () => void;
  onClear: () => void;
  canKeep: boolean;
  notice?: string;
  /** Shortcut prefix shown in hints, such as ⌘ or Ctrl+. */
  mod?: string;
  className?: string;
  children?: ReactNode;
  inspectorControl?: ReactNode;
  onInspectStage?: (position: number) => void;
  onPreviewStage?: (from: number, to: number) => void;
  /** Panel height in pixels; fixed, so toggling details never moves the chart. */
  height: number;
  /** Smallest and largest panel height, in pixels. */
  heightRange: readonly [number, number];
  /** The reader resizes the panel; `commit` is false while the drag is live. */
  onHeight: (height: number, commit: boolean) => void;
  /** Back to the default height. */
  onResetHeight: () => void;
}

const seconds = (ms: number, digits = 2) => `${(ms / 1000).toFixed(digits)}s`;
const describeLeg = (key: TimelineKey) => (key.changes.length ? key.changes.map(formatChange).join(' · ') : 'no change');
const describe = (key: TimelineKey, index: number, at: number) =>
  `Keyframe ${index + 1}${key.changes.length ? `: ${key.changes.map(formatChange).join(', ')}` : ''}`.concat(index ? ` (${seconds(at)})` : '');

/** Shared time geometry for overview, stage strip, category lanes and scrubbing. */
export function timelineGeometry(keyframes: TimelineKey[], stageDuration: number, zoom = 1, pan = 0) {
  const count = keyframes.length;
  const legs = keyframes.slice(1).map((key) => Math.max(1, key.stages) * stageDuration);
  /** When each keyframe is reached. */
  const times = keyframes.map((_, index) => legs.slice(0, index).reduce((sum, leg) => sum + leg, 0));
  const total = times.at(-1) ?? 0;

  const timeOf = (position: number) => {
    if (count < 2) return 0;
    const index = Math.min(count - 2, Math.max(0, Math.floor(position)));
    return times[index] + legs[index] * Math.min(1, Math.max(0, position - index));
  };
  const positionOf = (time: number) => {
    if (count < 2) return 0;
    const index = Math.max(0, Math.min(count - 2, times.findLastIndex((start) => start <= time)));
    return index + Math.min(1, Math.max(0, (time - times[index]) / legs[index]));
  };
  const span = total / zoom;
  const start = Math.min(pan, Math.max(0, total - span));
  const end = start + span;
  const x = (time: number) => `calc(var(--pg-pad) + (100% - 2 * var(--pg-pad)) * ${span ? (time - start) / span : 0})`;
  const width = (duration: number) => `calc((100% - 2 * var(--pg-pad)) * ${span ? duration / span : 0})`;

  return { legs, times, total, timeOf, positionOf, span, start, end, x, width };
}

/** Ruler steps, in milliseconds, from fine to coarse. */
const STEPS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10_000];

/**
 * Kept keyframes on a real-time track, like an editing timeline. Each leg
 * between two keyframes is a clip as long as it plays: VisDelta plans the leg
 * as one or more serial route stages, and `play()` gives every stage the same
 * duration, so the clip is cut into equal stage segments. Replaying runs a
 * real `sequence()` of the kept states; the playhead and the code follow it.
 */
export function Timeline({
  keyframes,
  previews,
  onPreview,
  value,
  stageDuration,
  replaying,
  playing,
  onScrub,
  onSeek,
  onPlay,
  onKeep,
  onClear,
  canKeep,
  notice,
  mod = '⌘',
  className,
  children,
  inspectorControl,
  onInspectStage,
  onPreviewStage,
  height,
  heightRange,
  onHeight,
  onResetHeight,
}: TimelineProps) {
  const resize = useRef<{ pointerId: number; startY: number; startHeight: number; current: number } | null>(null);
  const [details, setDetails] = useState(false);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [selection, setSelection] = useState<{ id: number; stage: number } | null>(null);
  const [snap, setSnap] = useState(true);
  const [hover, setHover] = useState<{ id: number; left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  const cancelTimer = () => { if (timer.current) clearTimeout(timer.current); };
  const close = () => { cancelTimer(); setHover(null); };
  const leave = () => { cancelTimer(); timer.current = setTimeout(() => { if (!pointerInside.current && !document.activeElement?.matches('.pg-key:focus-visible')) setHover(null); }, 120); };
  const open = (id: number, button: HTMLElement, immediate = false) => {
    cancelTimer();
    const rect = button.getBoundingClientRect();
    const show = () => setHover({ id, left: Math.max(8, Math.min(window.innerWidth - 328, rect.left + rect.width / 2 - 160)), top: rect.top >= 290 ? rect.top - 282 : Math.max(8, Math.min(window.innerHeight - 280, rect.bottom + 8)) });
    if (immediate) show(); else timer.current = setTimeout(show, 150);
  };
  useEffect(() => {
    onPreview(hover?.id ?? null);
  }, [hover, previews, onPreview]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (timer.current) clearTimeout(timer.current); setHover(null); } };
    const resize = () => setHover(null);
    window.addEventListener('keydown', dismiss);
    window.addEventListener('resize', resize);
    return () => { if (timer.current) clearTimeout(timer.current); window.removeEventListener('keydown', dismiss); window.removeEventListener('resize', resize); };
  }, []);
  const visibleCategories = categories.filter(category => keyframes.some(key => key.changes.some(change => change.category === category.id)));
  const previewIndex = hover ? keyframes.findIndex(key => key.id === hover.id) : -1;
  const count = keyframes.length;
  const { legs, times, total, timeOf, positionOf, span, start, end, x, width } = timelineGeometry(keyframes, stageDuration, zoom, pan);
  const selectedLeg = selection ? keyframes.findIndex(key => key.id === selection.id) - 1 : -1;
  const selectedKey = selectedLeg >= 0 ? keyframes[selectedLeg + 1] : undefined;
  const selectedStage = selection?.stage ?? 0;
  const selectedStart = selectedKey ? times[selectedLeg] + selectedStage * stageDuration : 0;
  const stageLabel = (key: TimelineKey, stage: number) => key.stageLabels?.[stage] === '' ? 'No additional semantic change' : key.stageLabels?.[stage] ?? 'Stage details unavailable';
  const boundaries = [0, ...keyframes.slice(1).flatMap((key, leg) => Array.from({ length: Math.max(1, key.stages) }, (_, stage) => times[leg] + (stage + 1) * stageDuration))];
  const seekTime = (time: number) => { if (!Number.isFinite(time)) return; close(); onScrub(positionOf(Math.max(0, Math.min(total, time)))); };
  const setView = (nextZoom: number, center: number) => {
    const next = Math.max(1, Math.min(32, nextZoom));
    setZoom(next); setPan(Math.max(0, Math.min(total - total / next, center - total / next / 2)));
  };
  const scrubRuler = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = start + Math.max(0, Math.min(1, (event.clientX - rect.left - 7) / Math.max(1, rect.width - 14))) * span;
    const nearest = boundaries.reduce((best, point) => Math.abs(point - time) < Math.abs(best - time) ? point : best, 0);
    seekTime(snap && span > 0 && Math.abs(nearest - time) / span * rect.width < 8 ? nearest : time);
  };
  const stages = keyframes.reduce((sum, key) => sum + key.stages, 0);

  const now = replaying ? timeOf(value) : total;
  const current = replaying && Math.abs(value - Math.round(value)) < 0.002 ? Math.round(value) : -1;
  const step = STEPS.find((candidate) => span / candidate <= 10) ?? STEPS.at(-1)!;
  const ticks = total ? Array.from({ length: Math.ceil(span / step) + 1 }, (_, index) => (Math.floor(start / step) + index) * step) : [0];
  /** Only say something when there is a next step; a working timeline stays quiet. */
  const hint = notice || (count === 0 ? `Press ${mod}S to keep this chart as a keyframe.` : count === 1 ? `Edit the code, then ${mod}S again to add a second keyframe.` : '');
  const clampHeight = (value: number) => Math.min(heightRange[1], Math.max(heightRange[0], Math.round(value)));
  /** Drag the top edge: moving up makes the panel taller. */
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || resize.current) return;
    event.preventDefault();
    const startHeight = event.currentTarget.parentElement!.getBoundingClientRect().height;
    resize.current = { pointerId: event.pointerId, startY: event.clientY, startHeight, current: startHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resize.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.current = clampHeight(drag.startHeight + drag.startY - event.clientY);
    onHeight(drag.current, false);
  };
  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resize.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resize.current = null;
    onHeight(drag.current, true);
  };
  const nudgeHeight = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = { ArrowUp: height + 16, ArrowDown: height - 16, Home: heightRange[0], End: heightRange[1] }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onHeight(clampHeight(next), true);
  };
  const lanes = details && visibleCategories.length > 0;

  return (
    <section aria-label="Keyframes" className={className} style={{ '--pg-time-h': `${height}px` } as CSSProperties}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        aria-valuemin={heightRange[0]}
        aria-valuemax={heightRange[1]}
        aria-valuenow={height}
        tabIndex={0}
        className="pg-timeline-grip"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
        onKeyDown={nudgeHeight}
        onDoubleClick={onResetHeight}
      />
      <div className="pg-timeline-body">
      {details && <div className="pg-time-tools" aria-label="Timeline navigation">
        <button type="button" disabled={!total || now <= 0} onClick={() => seekTime(boundaries.findLast(time => time < now - 0.01) ?? 0)}>Previous stage</button>
        <button type="button" disabled={!total || now >= total} onClick={() => seekTime(boundaries.find(time => time > now + 0.01) ?? total)}>Next stage</button>
        <label>Time <input aria-label="Playhead time in seconds" type="number" min="0" max={total / 1000} step="0.01"
          value={timeDraft ?? (now / 1000).toFixed(2)} onChange={event => setTimeDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          onBlur={event => {
            const time = event.currentTarget.valueAsNumber * 1000;
            setTimeDraft(null);
            if (Number.isFinite(time) && Math.abs(time - now) > 5) seekTime(time);
          }} /> s</label>
        <button type="button" aria-label="Zoom out timeline" disabled={zoom === 1} onClick={() => setView(zoom / 2, start + span / 2)}>−</button>
        <span>{zoom.toFixed(1)}×</span>
        <button type="button" aria-label="Zoom in timeline" disabled={!total || zoom === 32} onClick={() => setView(zoom * 2, now >= start && now <= end ? now : start + span / 2)}>+</button>
        <button type="button" onClick={() => setView(1, total / 2)}>Fit all</button>
        <button type="button" disabled={!selectedKey} onClick={() => setView(total / legs[selectedLeg], times[selectedLeg] + legs[selectedLeg] / 2)}>Fit transition</button>
        <label><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /> Snap</label>
        {zoom > 1 && <label className="pg-pan">Pan <input aria-label="Pan timeline" type="range" min="0" max={Math.max(0, total - span)} step="1" value={start} onChange={event => setPan(event.currentTarget.valueAsNumber)} /></label>}
      </div>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onPlay}
          disabled={count < 2}
          aria-label={playing ? 'Pause' : 'Play keyframes'}
          title={playing ? 'Pause' : 'Play keyframes'}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-fd-accent disabled:opacity-40"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
        </button>
        <div className="w-[7.5rem] shrink-0 font-mono text-xs tabular-nums" aria-live="off">
          <span className="text-fd-foreground">{seconds(now)}</span>
          <span className="text-fd-muted-foreground"> / {seconds(total)}</span>
        </div>
        <div className="pg-track" data-details={details || undefined} data-lanes={lanes || undefined} data-dense={count > 12 || undefined} hidden={count === 0}>
          {details && <div className="pg-ruler" onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scrubRuler(event);
          }} onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubRuler(event);
          }}>
            {ticks.map((tick) => (
              <span key={tick} className="pg-tick" style={{ left: x(tick) }}>
                {`${tick / 1000}s`}
              </span>
            ))}
          </div>}
          <div className="pg-clips">
            {keyframes.slice(1).map((key, index) => (
              <span
                key={key.id}
                aria-hidden="true"
                className="pg-clip"
                data-active={(replaying && value > index && value < index + 1) || undefined}
                title={`${describeLeg(key)} — ${key.stages} planned ${key.stages === 1 ? 'stage' : 'stages'}, ${seconds(legs[index])}`}
                style={{ left: x(times[index]), width: width(legs[index]) }}
              >
                <span className="pg-clip-label">
                  {describeLeg(key)}
                  {details && key.stages > 1 && <span className="pg-clip-stages">{key.stages} stages</span>}
                </span>
              </span>
            ))}
            {details && keyframes.slice(1).flatMap((key, index) =>
              Array.from({ length: Math.max(1, key.stages) }, (_, stage) => {
                const local = replaying ? (value - index) * Math.max(1, key.stages) : -1;
                const label = stageLabel(key, stage);
                const description = `Transition ${index + 1}, stage ${stage + 1} of ${Math.max(1, key.stages)}: ${label} (${seconds(times[index] + stage * stageDuration)}–${seconds(times[index] + (stage + 1) * stageDuration)})`;
                return (
                  <button
                    type="button"
                    key={`${key.id}-${stage}`}
                    aria-label={description}
                    className="pg-stage-block"
                    data-active={(local > stage && local < stage + 1) || undefined}
                    aria-pressed={selection?.id === key.id && selectedStage === stage}
                    title={description}
                    onClick={() => { close(); setSelection({ id: key.id, stage }); }}
                    onDoubleClick={() => onPreviewStage?.(index + stage / Math.max(1, key.stages), index + (stage + 1) / Math.max(1, key.stages))}
                    style={{ left: x(times[index] + stage * stageDuration), width: width(stageDuration) }}
                  ><span className="pg-stage-number">{stage + 1}</span><span className="pg-stage-name">{label}</span></button>
                );
              }),
            )}
            {count >= 2 && (
              <input
                type="range"
                min={start / 1000}
                max={end / 1000}
                step={0.01}
                value={Math.max(start, Math.min(end, now)) / 1000}
                aria-label="Keyframe timeline"
                aria-valuetext={`${seconds(now)} of ${seconds(total)}`}
                onChange={(event) => { close(); onScrub(positionOf(event.currentTarget.valueAsNumber * 1000)); }}
              />
            )}
            {keyframes.map((key, index) => (
              <button
                key={key.id}
                type="button"
                className="pg-key"
                data-current={index === current || undefined}
                data-time={times[index] / 1000}
                style={{ left: x(times[index]) }}
                aria-label={describe(key, index, times[index])}
                onPointerEnter={(event) => { if (event.pointerType !== 'touch') { pointerInside.current = true; open(key.id, event.currentTarget); } }}
                onPointerLeave={() => { pointerInside.current = false; leave(); }}
                onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) open(key.id, event.currentTarget, true); }}
                onBlur={leave}
                aria-describedby={hover?.id === key.id ? 'pg-key-preview' : undefined}
                onClick={() => { close(); onSeek(index); }}
              >
                <span className="pg-key-label" aria-hidden="true">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
          {lanes && <div className="pg-category-scroll">
            {visibleCategories.map(category => <div className="pg-category-row" key={category.id} data-category={category.id}>
              <span className="pg-category-name">{category.label}</span>
              <div className="pg-category-time">
                {keyframes.slice(1).map((key, index) => {
                  const changes = key.changes.filter(change => change.category === category.id);
                  if (!changes.length) return null;
                  const active = replaying && value > index && value < index + 1;
                  const label = changes.map(formatChange).join(' · ');
                  return <span key={key.id} className="pg-category-block" data-active={active || undefined} title={`${category.label}: ${label}${active ? ' — current transition' : ''}`} style={{ left: x(times[index]), width: width(legs[index]) }}>{label}</span>;
                })}
                {replaying && now >= start && now <= end && <span className="pg-category-head" aria-hidden="true" style={{ left: x(now) }} />}
              </div>
            </div>)}
          </div>}
          {replaying && now >= start && now <= end && <span className="pg-head" aria-hidden="true" style={{ left: x(now) }} />}
        </div>
        <button
          type="button"
          onClick={onKeep}
          disabled={!canKeep}
          className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors hover:bg-fd-accent disabled:opacity-40 ${count === 0 ? 'ml-auto' : 'ml-auto sm:ml-0'}`}
          title={`Keep this state as a keyframe (${mod}S)`}
        >
          <span aria-hidden="true" className="size-2 rotate-45 bg-[var(--color-delta)]" />
          Keep
        </button>
        {count > 0 && (
          <button
            type="button"
            aria-expanded={details}
            aria-controls="pg-details"
            onClick={() => setDetails(!details)}
            title={details ? 'Hide details' : 'Show ruler, stages, categories and clear'}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            Details
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${details ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {details && selectedKey && <div className="pg-stage-selection" aria-label="Selected stage">
        <strong>Transition {selectedLeg + 1} · Stage {selectedStage + 1}</strong>
        <span>{stageLabel(selectedKey, selectedStage)}</span>
        <span>{seconds(selectedStart)}–{seconds(selectedStart + stageDuration)} · {seconds(stageDuration)}</span>
        {selectedKey.stageDetails?.[selectedStage] && <details className="pg-stage-exact"><summary>Exact configuration</summary><code>{selectedKey.stageDetails[selectedStage]}</code></details>}
        <button type="button" onClick={() => seekTime(selectedStart)}>Go to start</button>
        <button type="button" onClick={() => onPreviewStage?.(selectedLeg + selectedStage / selectedKey.stages, selectedLeg + (selectedStage + 1) / selectedKey.stages)}>Preview stage</button>
        <button type="button" onClick={() => onInspectStage?.(selectedLeg + (selectedStage + 0.5) / selectedKey.stages)}>Inspect SVG tracks</button>
      </div>}
      {details && count > 0 && <div id="pg-details" className="pg-category-help">
        <span>{count} {count === 1 ? 'key' : 'keys'} · {stages} {stages === 1 ? 'stage' : 'stages'}</span>
        {lanes && <span>Lanes group changes by category; the strip under the clips shows planned stages.</span>}
        <button type="button" onClick={onClear}>Clear keys</button>
        {inspectorControl}
      </div>}
      {hover && previewIndex >= 0 && createPortal(<div id="pg-key-preview" role="tooltip" className="pg-key-preview" style={{ left: hover.left, top: hover.top }} onPointerEnter={() => { pointerInside.current = true; cancelTimer(); }} onPointerLeave={() => { pointerInside.current = false; leave(); }}>
        <strong>Keyframe {previewIndex + 1} <span>{seconds(times[previewIndex])}</span></strong>
        {previews[hover.id]?.image
          // Serialized local SVG, not a remote image for Next image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={previews[hover.id].image} alt={`Saved chart at keyframe ${previewIndex + 1}`} width={320} height={200} />
          : <div className="pg-preview-placeholder">{previews[hover.id]?.error ? 'Preview unavailable' : 'Loading preview…'}</div>}
        <p>{previewIndex ? describeLeg(keyframes[previewIndex]) : 'Initial state'}</p>
      </div>, document.body)}
      <p className="pg-hint" aria-live="polite">{hint}</p>
      {children}
      </div>
    </section>
  );
}
