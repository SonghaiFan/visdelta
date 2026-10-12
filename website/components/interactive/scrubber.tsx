'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

interface ScrubberProps {
  value: number;
  /** 1 for a pair; `states - 1` for a sequence. */
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/**
 * Progress from state A (blue circle) to state B (coral triangle), with the
 * current frame as an amber playhead. A native range input underneath keeps
 * keyboard, pointer and screen-reader behaviour.
 */
export function Scrubber({ value, max = 1, onChange, disabled, label = 'Transition progress', className }: ScrubberProps) {
  const id = useId();
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={cn('vd-scrub', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="vd-scrub-track" aria-hidden="true">
        <span className="vd-scrub-fill" style={{ width: `${fraction * 100}%` }} />
        <span className="vd-scrub-end" data-end="a" />
        {Array.from({ length: Math.max(0, Math.round(max) - 1) }, (_, index) => (
          <span key={index} className="vd-scrub-end" data-end="leg" style={{ left: `${((index + 1) / max) * 100}%` }} />
        ))}
        <span className="vd-scrub-end" data-end="b" />
      </div>
      <span className="vd-scrub-head" aria-hidden="true" style={{ left: `calc(7px + (100% - 14px) * ${fraction})` }} />
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={0.001}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}
