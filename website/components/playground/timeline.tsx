'use client';

import { Pause, Play } from 'lucide-react';
import type { StateChange } from 'visdelta/core';
import { formatChange } from '@/components/live/transition-player';
import { cn } from '@/lib/cn';

export interface TimelineKey {
  id: number;
  /** What changed since the previous keyframe; empty for the first. */
  changes: StateChange[];
}

interface TimelineProps {
  keyframes: TimelineKey[];
  /** Playhead in keyframe units, shown while replaying. */
  value: number;
  replaying: boolean;
  playing: boolean;
  onScrub: (value: number) => void;
  onSeek: (index: number) => void;
  onPlay: () => void;
  onKeep: () => void;
  onClear: () => void;
  canKeep: boolean;
  notice?: string;
}

const describe = (key: TimelineKey, index: number) =>
  `Keyframe ${index + 1}${key.changes.length ? `: ${key.changes.map(formatChange).join(', ')}` : ''}`;

/**
 * Kept keyframes on one track. Replaying them runs a real `sequence()` of the
 * kept states; the playhead and the code follow it.
 */
export function Timeline({ keyframes, value, replaying, playing, onScrub, onSeek, onPlay, onKeep, onClear, canKeep, notice }: TimelineProps) {
  const count = keyframes.length;
  const max = Math.max(1, count - 1);
  const fraction = Math.min(1, Math.max(0, value / max));
  const at = (position: number) => `calc(7px + (100% - 14px) * ${position})`;
  const current = replaying && Math.abs(value - Math.round(value)) < 0.002 ? Math.round(value) : -1;
  const hint =
    notice ||
    (count === 0
      ? 'Keep the chart on screen as a keyframe with ⌘S.'
      : count === 1
        ? 'Edit the code, then keep another keyframe to make a timeline.'
        : replaying
          ? `Replaying ${count} keyframes. Edit the code to go live again.`
          : `Live. Play or scrub to replay ${count} keyframes.`);

  return (
    <section aria-label="Keyframes" className="mt-5">
      <div className="flex items-center gap-3">
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
        <div className="pg-track" data-dense={count > 12 || undefined}>
          <span className="pg-track-line" aria-hidden="true" />
          {replaying && <span className="pg-track-fill" aria-hidden="true" style={{ width: `calc((100% - 14px) * ${fraction})` }} />}
          {count >= 2 && (
            <input
              type="range"
              min={0}
              max={max}
              step={0.001}
              value={replaying ? value : max}
              aria-label="Keyframe timeline"
              onChange={(event) => onScrub(event.currentTarget.valueAsNumber)}
            />
          )}
          {keyframes.map((key, index) => (
            <button
              key={key.id}
              type="button"
              className="pg-key"
              data-current={index === current || undefined}
              style={{ left: at(count < 2 ? 0 : index / (count - 1)) }}
              aria-label={describe(key, index)}
              title={describe(key, index)}
              onClick={() => onSeek(index)}
            >
              <span className="pg-key-label" aria-hidden="true">
                {index + 1}
              </span>
            </button>
          ))}
          {replaying && <span className="pg-head" aria-hidden="true" style={{ left: at(fraction) }} />}
        </div>
        <button
          type="button"
          onClick={onKeep}
          disabled={!canKeep}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors hover:bg-fd-accent disabled:opacity-40"
          title="Keep this state as a keyframe (⌘S)"
        >
          <span aria-hidden="true" className="size-2 rotate-45 bg-[var(--color-delta)]" />
          Keep
        </button>
      </div>
      <p className={cn('mt-2 flex items-baseline gap-3 pl-11 text-xs text-fd-muted-foreground')} aria-live="polite">
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
