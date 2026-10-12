'use client';

import { Pause, Play } from 'lucide-react';
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
}

const seconds = (ms: number, digits = 2) => `${(ms / 1000).toFixed(digits)}s`;
const describeLeg = (key: TimelineKey) => (key.changes.length ? key.changes.map(formatChange).join(' · ') : 'no change');
const describe = (key: TimelineKey, index: number, at: number) =>
  `Keyframe ${index + 1}${key.changes.length ? `: ${key.changes.map(formatChange).join(', ')}` : ''}`.concat(index ? ` (${seconds(at)})` : '');

/** Ruler steps, in milliseconds, from fine to coarse. */
const STEPS = [250, 500, 1000, 2000, 5000, 10_000];

/**
 * Kept keyframes on a real-time track, like an editing timeline. Each leg
 * between two keyframes is a clip as long as it plays: VisDelta plans the leg
 * as one or more serial route stages, and `play()` gives every stage the same
 * duration, so the clip is cut into equal stage segments. Replaying runs a
 * real `sequence()` of the kept states; the playhead and the code follow it.
 */
export function Timeline({
  keyframes,
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
}: TimelineProps) {
  const count = keyframes.length;
  const legs = keyframes.slice(1).map((key) => Math.max(1, key.stages) * stageDuration);
  /** When each keyframe is reached. */
  const times = keyframes.map((_, index) => legs.slice(0, index).reduce((sum, leg) => sum + leg, 0));
  const total = times.at(-1) ?? 0;
  const stages = keyframes.reduce((sum, key) => sum + key.stages, 0);

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

  const now = replaying ? timeOf(value) : total;
  const current = replaying && Math.abs(value - Math.round(value)) < 0.002 ? Math.round(value) : -1;
  const step = STEPS.find((candidate) => total / candidate <= 10) ?? STEPS.at(-1)!;
  const ticks = total ? Array.from({ length: Math.floor(total / step + 1e-6) + 1 }, (_, index) => index * step) : [0];
  const hint =
    notice ||
    (count === 0
      ? `Keep the chart on screen as a keyframe with ${mod}S.`
      : count === 1
        ? 'Edit the code, then keep another keyframe to make a timeline.'
        : replaying
          ? `Replaying ${count} keyframes. Edit the code to go live again.`
          : `Live. Play or scrub to replay ${count} keyframes.`);

  return (
    <section aria-label="Keyframes" className={className}>
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
        <div className="w-[8.5rem] shrink-0 font-mono text-xs tabular-nums" aria-live="off">
          <span className="text-fd-foreground">{seconds(now)}</span>
          <span className="text-fd-muted-foreground"> / {seconds(total)}</span>
          <span className="block text-[0.65rem] text-fd-muted-foreground">
            {count} {count === 1 ? 'key' : 'keys'} · {stages} {stages === 1 ? 'stage' : 'stages'}
          </span>
        </div>
        <div className="pg-track" data-dense={count > 12 || undefined}>
          <div className="pg-ruler" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className="pg-tick" style={{ left: x(tick) }}>
                {tick % 1000 === 0 ? `${tick / 1000}s` : ''}
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
                  {key.stages > 1 && <span className="pg-clip-stages">{key.stages} stages</span>}
                </span>
              </span>
            ))}
            {keyframes.slice(1).flatMap((key, index) =>
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
                onChange={(event) => onScrub(positionOf(event.currentTarget.valueAsNumber * 1000))}
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
                title={describe(key, index, times[index])}
                onClick={() => onSeek(index)}
              >
                <span className="pg-key-label" aria-hidden="true">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
          {replaying && <span className="pg-head" aria-hidden="true" style={{ left: x(now) }} />}
        </div>
        <button
          type="button"
          onClick={onKeep}
          disabled={!canKeep}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors hover:bg-fd-accent disabled:opacity-40 sm:ml-0"
          title={`Keep this state as a keyframe (${mod}S)`}
        >
          <span aria-hidden="true" className="size-2 rotate-45 bg-[var(--color-delta)]" />
          Keep
        </button>
      </div>
      <p className="mt-0.5 flex items-baseline gap-3 pl-11 text-xs text-fd-muted-foreground" aria-live="polite">
        <span>{hint}</span>
        {count > 0 && (
          <button type="button" onClick={onClear} className="ml-auto underline-offset-4 hover:text-fd-foreground hover:underline">
            clear
          </button>
        )}
      </p>
    </section>
  );
}
