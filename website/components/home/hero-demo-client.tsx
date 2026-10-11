'use client';

import { useState, type ReactNode } from 'react';
import { ExampleErrorBoundary } from '@/components/live/error-boundary';
import { TransitionPlayer } from '@/components/live/transition-player';
import { cn } from '@/lib/cn';

export interface HeroDemo {
  id: string;
  chart: string;
  caption: string;
}

/** Chart-type tabs choose the demonstration; the selected demo then auto-plays. */
export function HeroDemoClient({ demos, sources }: { demos: HeroDemo[]; sources: Record<string, ReactNode> }) {
  const [active, setActive] = useState(demos[0].id);
  const demo = demos.find((entry) => entry.id === active) ?? demos[0];

  return (
    // Reading order on every width: source data and chart code, then the chart.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="min-w-0">
        <div role="group" aria-label="Chart type" className="mb-2 flex flex-wrap gap-1">
          {demos.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === active}
              onClick={() => setActive(entry.id)}
              className={cn(
                'rounded-md px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors',
                entry.id === active
                  ? 'bg-fd-foreground text-fd-background'
                  : 'text-fd-muted-foreground hover:text-fd-foreground',
              )}
            >
              {entry.chart}
            </button>
          ))}
        </div>
        <div className="[&_figure]:my-0 [&_pre]:max-h-64 lg:[&_pre]:max-h-[22rem]">{sources[demo.id]}</div>
      </div>
      <div className="min-w-0">
        <ExampleErrorBoundary key={demo.id} name={demo.chart}>
          <TransitionPlayer
            key={demo.id}
            example={demo.id}
            height={300}
            autoplay
            label={demo.caption}
            className="my-0 lg:mt-9"
          />
        </ExampleErrorBoundary>
        <p className="mt-2 text-sm text-fd-muted-foreground">{demo.caption}</p>
      </div>
    </div>
  );
}
