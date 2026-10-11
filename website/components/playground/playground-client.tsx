'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ExampleMeta, StateChangeCategory } from '@/examples/registry';
import { ExampleErrorBoundary } from '@/components/live/error-boundary';
import { TransitionPlayer, type ChartStyleName } from '@/components/live/transition-player';
import { cn } from '@/lib/cn';

interface Props {
  examples: ExampleMeta[];
  categories: { id: StateChangeCategory; label: string; summary: string }[];
  sources: Record<string, ReactNode>;
}

const STYLES: { id: ChartStyleName; label: string }[] = [
  { id: 'd3', label: 'Default' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'paper', label: 'Paper' },
];

const DURATIONS = [400, 800, 1600];

export function PlaygroundClient({ examples, categories, sources }: Props) {
  const [selected, setSelected] = useState(examples[0].id);
  const [chartStyle, setChartStyle] = useState<ChartStyleName>('d3');
  const [duration, setDuration] = useState(800);
  const example = examples.find((entry) => entry.id === selected) ?? examples[0];
  const [category, setCategory] = useState<StateChangeCategory>(example.category);

  // Deep links: /docs/examples/playground#bar-split
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      const match = examples.find((entry) => entry.id === id);
      if (match) {
        setSelected(match.id);
        setCategory(match.category);
      }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [examples]);

  const select = (id: string) => {
    setSelected(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  const counts = useMemo(() => {
    const result = new Map<StateChangeCategory, number>();
    for (const entry of examples) result.set(entry.category, (result.get(entry.category) ?? 0) + 1);
    return result;
  }, [examples]);

  const inCategory = examples.filter((entry) => entry.category === category);
  const active = categories.find((entry) => entry.id === category);

  return (
    <section className="not-prose my-6" aria-label="Transition playground">
      <div role="group" aria-label="State-change category" className="flex flex-wrap gap-1 border-b pb-2">
        {categories.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === category}
            data-category={entry.id}
            onClick={() => {
              setCategory(entry.id);
              const first = examples.find((candidate) => candidate.category === entry.id);
              if (first) select(first.id);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              entry.id === category
                ? 'bg-fd-accent text-fd-accent-foreground'
                : 'text-fd-muted-foreground hover:text-fd-foreground',
            )}
          >
            <span className="vd-category-dot" aria-hidden="true" />
            {entry.label}
            <span className="font-mono text-xs text-fd-muted-foreground">{counts.get(entry.id) ?? 0}</span>
          </button>
        ))}
      </div>
      {active && <p className="mt-3 text-sm text-fd-muted-foreground">{active.summary}</p>}

      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Examples">
        {inCategory.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              aria-current={entry.id === selected ? 'true' : undefined}
              onClick={() => select(entry.id)}
              className={cn(
                'inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                entry.id === selected
                  ? 'border-fd-foreground/40 bg-fd-card text-fd-foreground'
                  : 'text-fd-muted-foreground hover:bg-fd-accent/60 hover:text-fd-foreground',
              )}
            >
              <span className="font-medium">{entry.title}</span>
              <span className="font-mono text-[0.7rem] uppercase tracking-wider text-fd-muted-foreground">
                {entry.chart}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">{example.description}</p>

      {/* Reading order on every width: source data and chart code, then the chart. */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 [&_figure]:my-0 [&_pre]:max-h-72 xl:[&_pre]:max-h-[34rem]">{sources[example.id]}</div>
        <div className="min-w-0">
          <ExampleErrorBoundary key={example.id} name={example.title}>
            <TransitionPlayer
              key={example.id}
              example={example.id}
              height={example.height ?? 340}
              chartStyle={chartStyle}
              duration={duration}
              label={`${example.title}: ${example.description}`}
              className="my-0"
              toolbar={
                <>
                  <select
                    aria-label="Chart style"
                    value={chartStyle}
                    onChange={(event) => setChartStyle(event.currentTarget.value as ChartStyleName)}
                    className="h-7 rounded-sm border bg-transparent px-1.5 text-xs"
                  >
                    {STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label} style
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Duration per route stage"
                    value={duration}
                    onChange={(event) => setDuration(Number(event.currentTarget.value))}
                    className="h-7 rounded-sm border bg-transparent px-1.5 font-mono text-xs"
                  >
                    {DURATIONS.map((value) => (
                      <option key={value} value={value}>
                        {value} ms/stage
                      </option>
                    ))}
                  </select>
                </>
              }
            />
          </ExampleErrorBoundary>
        </div>
      </div>
    </section>
  );
}
