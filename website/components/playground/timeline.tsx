'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
export function timelineGeometry(keyframes: TimelineKey[], stageDuration: number) {
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
  const x = (time: number) => `calc(var(--pg-pad) + (100% - 2 * var(--pg-pad)) * ${total ? time / total : 0})`;
  const width = (duration: number) => `calc((100% - 2 * var(--pg-pad)) * ${total ? duration / total : 0})`;

  return { legs, times, total, timeOf, positionOf, x, width };
}

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
  heights,
  heightRange,
  onHeight,
  onResetHeight,
}: TimelineProps) {
  const [details, setDetails] = useState(false);
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
  const { legs, times, total, timeOf, positionOf, x, width } = timelineGeometry(keyframes, stageDuration);
  const stages = keyframes.reduce((sum, key) => sum + key.stages, 0);

  const now = replaying ? timeOf(value) : total;
  const current = replaying && Math.abs(value - Math.round(value)) < 0.002 ? Math.round(value) : -1;
  /** Guidance takes the track's place until there is something to scrub; a working timeline stays quiet. */
  const guide = count === 0 ? `Press ${mod}S to keep this chart as a keyframe.` : count === 1 ? `Edit the code, then ${mod}S again to add a second keyframe.` : '';
  const height = details ? heights.details : heights.compact;
  const clampHeight = (value: number) => Math.min(heightRange[1], Math.max(heightRange[0], Math.round(value)));
  /** Drag the top edge: moving up makes the panel taller. */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = height;
    let current = startHeight;
    const move = (moveEvent: globalThis.PointerEvent) => {
      current = clampHeight(startHeight + startY - moveEvent.clientY);
      onHeight(current, false, details);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onHeight(current, true, details);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
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
        onKeyDown={nudgeHeight}
        onDoubleClick={() => onResetHeight(details)}
      />
      <div className="pg-timeline-body">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
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
        <div className="w-[7.5rem] shrink-0 font-mono text-xs leading-8 tabular-nums" aria-live="off">
          <span className="text-fd-foreground">{seconds(now)}</span>
          <span className="text-fd-muted-foreground"> / {seconds(total)}</span>
        </div>
        <div className="pg-track" data-details={details || undefined} data-lanes={lanes || undefined} data-dense={count > 12 || undefined} data-single={count === 1 || undefined} hidden={count === 0}>
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
                return (
                  <span
                    key={`${key.id}-${stage}`}
                    aria-hidden="true"
                    className="pg-stage-block"
                    data-active={(local > stage && local < stage + 1) || undefined}
                    title={`Leg ${index + 1}, planned stage ${stage + 1} of ${Math.max(1, key.stages)}`}
                    style={{ left: x(times[index] + stage * stageDuration), width: width(stageDuration) }}
                  />
                );
              }),
            )}
            {count >= 2 && (
              <input
                type="range"
                min={0}
                max={total / 1000}
                step={0.01}
                value={now / 1000}
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
                {replaying && <span className="pg-category-head" aria-hidden="true" style={{ left: x(now) }} />}
              </div>
            </div>)}
          </div>}
          {replaying && <span className="pg-head" aria-hidden="true" style={{ left: x(now) }} />}
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
            title={details ? 'Hide details' : 'Show ruler, stages, categories and clear'}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            Details
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${details ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {details && count > 0 && <div id="pg-details" className="pg-category-help">
        <span>{count} {count === 1 ? 'key' : 'keys'} · {stages} {stages === 1 ? 'stage' : 'stages'}</span>
        <button type="button" onClick={onClear}>Clear keys</button>
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
      </div>
    </section>
  );
}
