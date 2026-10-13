'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { categories } from '@/examples/registry';
import type { KeyframePreview } from './keyframe-previews';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { StateChange } from 'visdelta/core';
import { stageDurationFor } from './timing';
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
  /** Panel heights in pixels: fixed for each view, so only the reader changes them. */
  heights: { compact: number; details: number };
  children?: ReactNode;
  inspecting?: boolean;
  onInspect?: (position: number | null) => void;
  onPreviewStage?: (from: number, to: number) => void;
  /** Smallest and largest panel height, in pixels. */
  heightRange: readonly [number, number];
  /** The reader resizes the panel; `commit` is false while the drag is live. */
  onHeight: (height: number, commit: boolean, details: boolean) => void;
  /** Back to the default height of one view. */
  onResetHeight: (details: boolean) => void;
}

const seconds = (ms: number, digits = 2) => `${(ms / 1000).toFixed(digits)}s`;
const describeLeg = (key: TimelineKey) => (key.changes.length ? key.changes.map(formatChange).join(' · ') : 'no change');
const describe = (key: TimelineKey, index: number, at: number) =>
  `Keyframe ${index + 1}${key.changes.length ? `: ${key.changes.map(formatChange).join(', ')}` : ''}`.concat(index ? ` (${seconds(at)})` : '');

/** Shared time geometry for overview, stage strip, category lanes and scrubbing. */
export const TIMELINE_PIXELS_PER_SECOND = 160;
const TRACK_PAD = 7;

export function timelineGeometry(keyframes: TimelineKey[], stageDuration: number, zoom = 1) {
  const count = keyframes.length;
  const durations = keyframes.slice(1).map(key => stageDurationFor(key.changes, stageDuration));
  const legs = keyframes.slice(1).map((key, index) => Math.max(1, key.stages) * durations[index]);
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
  const pixelsPerSecond = TIMELINE_PIXELS_PER_SECOND * zoom;
  const length = total / 1000 * pixelsPerSecond;
  const x = (time: number) => `${TRACK_PAD + time / 1000 * pixelsPerSecond}px`;
  const width = (duration: number) => `${duration / 1000 * pixelsPerSecond}px`;

  return { durations, legs, times, total, timeOf, positionOf, pixelsPerSecond, length, x, width };
}

/** Ruler steps, in milliseconds, from fine to coarse. */
const STEPS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10_000];

/**
 * Kept keyframes on a real-time track, like an editing timeline. Each leg
 * between two keyframes is a clip as long as it plays: VisDelta plans the leg
 * as one or more serial route stages. Each leg uses its live-edit duration
 * policy, and its stages divide that clip equally. Replaying runs a
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
  heights,
  children,
  inspecting = false,
  onInspect,
  onPreviewStage,
  heightRange,
  onHeight,
  onResetHeight,
}: TimelineProps) {
  const resize = useRef<{ pointerId: number; startY: number; startHeight: number; current: number } | null>(null);
  const [details, setDetails] = useState(false);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, left: 0 });
  const zoomAnchor = useRef<number | null>(null);
  const followedTime = useRef<number | null>(null);
  const [selection, setSelection] = useState<{ id: number; stage: number } | null>(null);
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
  const { durations, legs, times, total, timeOf, positionOf, pixelsPerSecond, length, x, width } = timelineGeometry(keyframes, stageDuration, zoom);
  const trackWidth = Math.max(viewport.width, length + 2 * TRACK_PAD);
  const start = Math.max(0, (viewport.left - TRACK_PAD) / pixelsPerSecond * 1000);
  const end = Math.min(total, (viewport.left + viewport.width - TRACK_PAD) / pixelsPerSecond * 1000);
  const picked = selection ? keyframes.findIndex(key => key.id === selection.id) - 1 : -1;
  const selectedLeg = picked >= 0 ? picked : Math.max(-1, Math.min(count - 2, Math.floor(replaying ? value : count - 2)));
  const selectedKey = selectedLeg >= 0 ? keyframes[selectedLeg + 1] : undefined;
  const selectedStages = Math.max(1, selectedKey?.stages ?? 1);
  const selectedStage = picked >= 0 ? Math.min(selection!.stage, selectedStages - 1) : Math.min(selectedStages - 1, Math.max(0, Math.floor((replaying ? value - selectedLeg : 1) * selectedStages - 1e-9)));
  const selectedDuration = durations[selectedLeg] ?? stageDuration;
  const selectedStart = selectedKey ? times[selectedLeg] + selectedStage * selectedDuration : 0;
  const stageLabel = (key: TimelineKey, stage: number) => key.stageLabels?.[stage] === '' ? 'No additional semantic change' : key.stageLabels?.[stage] ?? 'Stage details unavailable';
  const boundaries = [0, ...keyframes.slice(1).flatMap((key, leg) => Array.from({ length: Math.max(1, key.stages) }, (_, stage) => times[leg] + (stage + 1) * durations[leg]))];
  const seekTime = (time: number) => { if (!Number.isFinite(time)) return; close(); onScrub(positionOf(Math.max(0, Math.min(total, time)))); };
  const setView = (nextZoom: number, center: number) => {
    zoomAnchor.current = center;
    setZoom(Math.max(0.25, Math.min(8, nextZoom)));
  };
  const showTime = useCallback((time: number) => viewportRef.current?.scrollTo({ left: Math.max(0, TRACK_PAD + time / 1000 * pixelsPerSecond - viewport.width / 2) }), [pixelsPerSecond, viewport.width]);
  /** The track replaces the old button row: Shift+←/→ step between stages, +/−/0 zoom (arrows alone still scroll). */
  const trackKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const center = (start + end) / 2;
    if (event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      if (!total) return;
      event.preventDefault();
      seekTime(event.key === 'ArrowRight' ? boundaries.find(time => time > now + 0.01) ?? total : boundaries.findLast(time => time < now - 0.01) ?? 0);
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); setView(zoom * 2, center); }
    else if (event.key === '-') { event.preventDefault(); setView(zoom / 2, center); }
    else if (event.key === '0') { event.preventDefault(); setView(1, center); }
  };
  const scrubRuler = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(0, Math.min(total, (event.clientX - rect.left - TRACK_PAD) / pixelsPerSecond * 1000));
    const nearest = boundaries.reduce((best, point) => Math.abs(point - time) < Math.abs(best - time) ? point : best, 0);
    seekTime(!event.altKey && Math.abs(nearest - time) / 1000 * pixelsPerSecond < 8 ? nearest : time);
  };

  const now = replaying ? timeOf(value) : total;
  const current = replaying && Math.abs(value - Math.round(value)) < 0.002 ? Math.round(value) : -1;
  const step = STEPS.find(candidate => candidate / 1000 * pixelsPerSecond >= 64) ?? STEPS.at(-1)!;
  const ticks = total ? Array.from({ length: Math.max(0, Math.ceil((end - start) / step)) + 2 }, (_, index) => (Math.floor(start / step) + index) * step).filter(time => time <= total) : [0];
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setViewport(previous => previous.width === node.clientWidth && previous.left === node.scrollLeft ? previous : { width: node.clientWidth, left: node.scrollLeft });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (zoomAnchor.current === null) return;
    showTime(zoomAnchor.current);
    zoomAnchor.current = null;
  }, [showTime]); // Preserve the visible time when manually changing the scale.
  const initialKey = keyframes[0]?.id;
  useEffect(() => { viewportRef.current?.scrollTo({ left: 0 }); }, [initialKey]);
  useEffect(() => {
    const node = viewportRef.current;
    const moved = followedTime.current !== now;
    followedTime.current = now;
    if (!node || !replaying || (!moved && !playing)) return;
    const head = TRACK_PAD + now / 1000 * pixelsPerSecond;
    if (head < node.scrollLeft + TRACK_PAD) node.scrollLeft = Math.max(0, head - TRACK_PAD);
    else if (head > node.scrollLeft + node.clientWidth - TRACK_PAD) node.scrollLeft = head - node.clientWidth + TRACK_PAD;
  }, [now, playing, pixelsPerSecond, replaying]);
  /** Guidance takes the track's place until there is something to scrub; a working timeline stays quiet. */
  const guide = count === 0 ? `Press ${mod}S to keep this chart as a keyframe.` : count === 1 ? `Edit the code, then ${mod}S again to add a second keyframe.` : '';
  const height = details ? heights.details : heights.compact;
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
    onHeight(drag.current, false, details);
  };
  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = resize.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    resize.current = null;
    onHeight(drag.current, true, details);
  };
  const nudgeHeight = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = { ArrowUp: height + 16, ArrowDown: height - 16, Home: heightRange[0], End: heightRange[1] }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onHeight(clampHeight(next), true, details);
  };
  const lanes = details && visibleCategories.length > 0;

  return (
    <section aria-label="Keyframes" className={className} data-details={details || undefined} style={{ '--pg-time-h': `${height}px` } as CSSProperties}>
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
        onDoubleClick={() => onResetHeight(details)}
      />
      <div className="pg-timeline-body">
      <div className="pg-row flex flex-wrap items-start gap-x-3 gap-y-2">
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
        <div className="pg-readout" aria-live="off">
          <input aria-label="Playhead time in seconds" inputMode="decimal" size={4} disabled={!total}
            value={timeDraft ?? (now / 1000).toFixed(2)} onChange={event => setTimeDraft(event.target.value)}
            onFocus={event => event.currentTarget.select()}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setTimeDraft(null); event.currentTarget.blur(); } }}
            onBlur={event => {
              const time = Number(event.currentTarget.value) * 1000;
              setTimeDraft(null);
              if (event.currentTarget.value.trim() && Number.isFinite(time) && Math.abs(time - now) > 5) seekTime(time);
            }} />
          <span>s / {seconds(total)}</span>
        </div>
        <div className="pg-time-shell" hidden={count === 0}>
          {lanes && <div className="pg-lane-labels" aria-hidden="true">{visibleCategories.map(category => <span className="pg-category-name" key={category.id}>{category.label}</span>)}</div>}
          <div className="pg-time-viewport" ref={viewportRef} role="region" aria-label="Timeline tracks" tabIndex={0}
            onKeyDown={trackKey}
            onScroll={event => setViewport({ width: event.currentTarget.clientWidth, left: event.currentTarget.scrollLeft })}>
        <div className="pg-track" style={{ width: `${trackWidth}px` }} data-details={details || undefined} data-lanes={lanes || undefined} data-dense={count > 12 || undefined} data-single={count === 1 || undefined}>
          <div className="pg-ruler" onPointerDown={event => {
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
          </div>
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
                const description = `Transition ${index + 1}, stage ${stage + 1} of ${Math.max(1, key.stages)}: ${label} (${seconds(times[index] + stage * durations[index])}–${seconds(times[index] + (stage + 1) * durations[index])})`;
                return (
                  <button
                    type="button"
                    key={`${key.id}-${stage}`}
                    aria-label={description}
                    className="pg-stage-block"
                    data-active={(local > stage && local < stage + 1) || undefined}
                    aria-pressed={selection?.id === key.id && selectedStage === stage}
                    title={description}
                    onClick={() => { close(); setSelection({ id: key.id, stage }); if (inspecting) onInspect?.(index + (stage + 0.5) / Math.max(1, key.stages)); }}
                    onDoubleClick={() => onPreviewStage?.(index + stage / Math.max(1, key.stages), index + (stage + 1) / Math.max(1, key.stages))}
                    style={{ left: x(times[index] + stage * durations[index]), width: width(durations[index]) }}
                  ><span className="pg-stage-number">{stage + 1}</span><span className="pg-stage-name">{label}</span></button>
                );
              }),
            )}
            {count >= 2 && (
              <input
                type="range"
                min={0}
                max={total / 1000}
                step={0.01}
                value={Math.max(0, Math.min(total, now)) / 1000}
                style={{ width: `${length + 2 * TRACK_PAD}px` }}
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
              <div className="pg-category-time" role="group" aria-label={category.label}>
                {keyframes.slice(1).map((key, index) => {
                  const changes = key.changes.filter(change => change.category === category.id);
                  if (!changes.length) return null;
                  const active = replaying && value > index && value < index + 1;
                  const label = changes.map(formatChange).join(' · ');
                  return <span key={key.id} className="pg-category-block" data-active={active || undefined} title={`${category.label}: ${label}${active ? ' — current transition' : ''}`} style={{ left: x(times[index]), width: width(legs[index]) }}>{label}</span>;
                })}
                {replaying && <span className="pg-category-head" aria-hidden="true" style={{ left: x(now) }} />}
              </div>
            </div>)}
          </div>}
          {replaying && <span className="pg-head" aria-hidden="true" style={{ left: x(now) }} />}
        </div>
          </div>
        </div>
        {guide && <p className="pg-guide">{guide}</p>}
        <button
          type="button"
          onClick={onKeep}
          disabled={!canKeep}
          className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors hover:bg-fd-accent disabled:opacity-40 ml-auto sm:ml-0`}
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
            title={details ? 'Hide details' : 'Show stages, categories and navigation'}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            Details
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${details ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {details && count > 0 && <div id="pg-details" className="pg-stage-selection" aria-label="Selected stage">
        {selectedKey && <>
          <button type="button" className="pg-stage-range" aria-label="Go to start" title="Go to the start of this stage" onClick={() => seekTime(selectedStart)}>{seconds(selectedStart)}–{seconds(selectedStart + selectedDuration)}</button>
          <span className="pg-stage-title">
            <strong>{stageLabel(selectedKey, selectedStage).replace(/^Chart stage: /, '')}</strong>
            <span>{selectedLeg + 1}·{selectedStage + 1}</span>
          </span>
        </>}
        <span className="pg-stage-actions">
          {selectedKey && <button type="button" aria-expanded={inspecting} onClick={() => onInspect?.(inspecting ? null : selectedLeg + (selectedStage + 0.5) / selectedStages)}>{inspecting ? 'Hide inspector' : 'Inspect'}</button>}
          <button type="button" className="pg-clear" title="Remove every kept keyframe" onClick={onClear}>Clear keys</button>
        </span>
        {selectedKey?.stageDetails?.[selectedStage] && <details className="pg-stage-exact"><summary>Exact configuration</summary><code>{selectedKey.stageDetails[selectedStage]}</code></details>}
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
      <p className="pg-notice" role="status" hidden={!notice}>{notice}</p>
      {children}
      </div>
    </section>
  );
}
