'use client';

import { PictureInPicture2, PanelRight, Maximize2, Square, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SizeMode = 'fit' | 'fixed';

/** Bounds for a fixed canvas, in pixels. */
export const SIZE_LIMITS = { min: 120, max: 4000 };

interface SizeControlsProps {
  mode: SizeMode;
  width: number;
  height: number;
  onMode: (mode: SizeMode) => void;
  onSize: (size: { width?: number; height?: number }) => void;
  floating: boolean;
  /** Floating needs room beside the editor. */
  canFloat: boolean;
  onFloat: () => void;
}

const MODES: { id: SizeMode; label: string; hint: string }[] = [
  { id: 'fit', label: 'Fit', hint: 'Scale the fixed canvas proportionally to the available space' },
  { id: 'fixed', label: 'Fixed', hint: 'The chart keeps this width and height; a smaller container scrolls' },
];

/**
 * How the fixed canvas is displayed: scale it into its container, or show it
 * at its original size with scrolling. Also where the preview lives: docked
 * beside the editor, or floating over it.
 */
export function SizeControls({ mode, width, height, onMode, onSize, floating, canFloat, onFloat }: SizeControlsProps) {
  const field = (label: string, value: number, key: 'width' | 'height') => (
    <label className="flex items-center gap-1 text-fd-muted-foreground">
      <span aria-hidden="true">{key === 'width' ? 'W' : 'H'}</span>
      <input
        type="number"
        inputMode="numeric"
        min={SIZE_LIMITS.min}
        max={SIZE_LIMITS.max}
        step={10}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next) && next >= SIZE_LIMITS.min && next <= SIZE_LIMITS.max) onSize({ [key]: next });
        }}
        className="h-6 w-[4.25rem] rounded-sm border bg-transparent px-1.5 font-mono text-xs tabular-nums text-fd-foreground"
      />
    </label>
  );

  return (
    <div className="pg-size-controls flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <div role="group" aria-label="Chart size" className="flex overflow-hidden rounded-sm border">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={mode === option.id}
            title={option.hint}
            onClick={() => onMode(option.id)}
            className={cn(
              'px-2 py-0.5 transition-colors',
              mode === option.id ? 'bg-fd-foreground text-fd-background' : 'text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground',
            )}
          >
            <span className="pg-size-mode-label">{option.label}</span>
            {option.id === 'fit' ? <Maximize2 aria-hidden="true" className="pg-size-mode-icon size-3" /> : <Square aria-hidden="true" className="pg-size-mode-icon size-3" />}
          </button>
        ))}
      </div>
      {floating && <details className="pg-size-menu">
        <summary aria-label="Canvas dimensions" title="Edit canvas width and height"><SlidersHorizontal aria-hidden="true" className="size-3" /><span className="pg-size-readout">{width} × {height}</span></summary>
        <div className="pg-size-popover">{field('Chart width in pixels', width, 'width')}{field('Chart height in pixels', height, 'height')}</div>
      </details>}
      {mode === 'fixed' && !floating && (
        <>
          {field('Chart width in pixels', width, 'width')}
          {field('Chart height in pixels', height, 'height')}
        </>
      )}
      {canFloat && (
        <button
          type="button"
          aria-pressed={floating}
          onClick={onFloat}
          title={floating ? 'Dock the chart beside the editor' : 'Float the chart over the editor'}
          className="pg-tool ml-auto"
        >
          {floating ? <PanelRight aria-hidden="true" className="size-3.5" /> : <PictureInPicture2 aria-hidden="true" className="size-3.5" />}
          <span className={floating ? 'sr-only' : undefined}>{floating ? 'Dock' : 'Float'}</span>
        </button>
      )}
    </div>
  );
}
