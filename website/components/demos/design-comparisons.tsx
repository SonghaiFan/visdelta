'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualizationWarning } from 'visdelta';
import { CodeView } from '@/components/interactive/code-view';
import { errorMessage, evaluateChart, loadFactory, renderFrozen, yieldToBrowser, type ChartName, type Rows } from '@/components/interactive/runtime';
import { cn } from '@/lib/cn';

interface ComparisonSide {
  label?: string;
  caption: string;
  text?: string;
  unsupported?: string;
  detail?: string;
  compact?: boolean;
  height?: number;
  charts?: { mark: ChartName; code: string }[];
}
interface Comparison {
  id: string;
  guide: string;
  title: string;
  why: string;
  rows: Rows;
  story: { headline: string; description: string };
  before: ComparisonSide;
  after: ComparisonSide;
}
interface Guide {
  id: string;
  title: string;
  url: string;
}
interface Corpus {
  comparisonGuides: Guide[];
  designComparisons: Comparison[];
  guideExplanations: Record<string, { why: string; context: string; detection: string; additionalUrl?: string }>;
}

const key = (item: Comparison, side: 'before' | 'after', index: number) => `${item.id}/${side}/${index}`;

function ComparisonHost({ item, side, index, register }: {
  item: Comparison;
  side: 'before' | 'after';
  index: number;
  register: (item: Comparison, side: 'before' | 'after', index: number, element: HTMLDivElement | null) => void;
}) {
  const ref = useCallback((element: HTMLDivElement | null) => register(item, side, index, element), [item, side, index, register]);
  const view = item[side];
  return <div ref={ref} className="vd-docs-chart" style={{ minHeight: view.height ?? (view.charts!.length > 1 ? 180 : 280) }} />;
}

/** Paired "Not ideal → Better" charts, drawn live, with VisDelta's own design hints. */
export function DesignComparisons() {
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [selected, setSelected] = useState('all');
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [advice, setAdvice] = useState<Record<string, VisualizationWarning[]>>({});
  const hosts = useRef(new Map<string, { element: HTMLDivElement; item: Comparison; side: 'before' | 'after'; index: number }>());
  const sizes = useRef(new Map<string, number>());
  const pending = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const observer = useRef<IntersectionObserver | null>(null);
  const disposed = useRef(false);

  const render = useCallback(async (id: string) => {
    const info = hosts.current.get(id);
    if (!info || disposed.current) return;
    const { element, item, side, index } = info;
    setStatuses((current) => ({ ...current, [id]: 'Drawing…' }));
    const declaration = item[side].charts![index];
    let height = item[side].height ?? (item[side].charts!.length > 1 ? 180 : 280);
    try {
      const [factory, { visualizationWarnings }] = await Promise.all([loadFactory(declaration.mark), import('visdelta')]);
      const chart = await evaluateChart(declaration.code, { [declaration.mark]: factory }, item.rows, { withD3: false });
      const spec = chart.toSpec() as { encoding?: { facet?: { field: string } }; facetLayout?: { gap?: number; columns?: number; minWidth?: number } };
      if (spec.encoding?.facet) {
        const layout = spec.facetLayout ?? {};
        const gap = layout.gap ?? 24;
        const columns = Math.max(1, Math.min(layout.columns ?? 2, Math.floor((element.clientWidth - 24 + gap) / ((layout.minWidth ?? 240) + gap)) || 1));
        const count = new Set(chart.rows().map((row) => row[spec.encoding!.facet!.field])).size;
        const rowsOfPanels = Math.ceil(count / columns);
        height = Math.max(height, rowsOfPanels * 190 + Math.max(0, rowsOfPanels - 1) * gap);
      }
      const warnings = await visualizationWarnings(chart as never);
      if (disposed.current || hosts.current.get(id)?.element !== element) return;
      const frozen = await renderFrozen(chart, element, height);
      if (disposed.current || hosts.current.get(id)?.element !== element) return;
      element.replaceChildren(...frozen);
      sizes.current.set(id, element.clientWidth);
      setStatuses((current) => ({ ...current, [id]: '' }));
      setAdvice((current) => ({ ...current, [id]: warnings }));
    } catch (cause) {
      setStatuses((current) => ({ ...current, [id]: `Unable to draw: ${errorMessage(cause)}` }));
    }
  }, []);

  const schedule = useCallback(
    (id: string) => {
      if (disposed.current || pending.current.has(id) || sizes.current.has(id)) return;
      pending.current.add(id);
      queue.current = queue.current
        .then(() => render(id))
        .then(yieldToBrowser)
        .finally(() => pending.current.delete(id));
    },
    [render],
  );

  const register = useCallback((item: Comparison, side: 'before' | 'after', index: number, element: HTMLDivElement | null) => {
    const id = key(item, side, index);
    const previous = hosts.current.get(id);
    if (previous?.element === element) return;
    if (previous) observer.current?.unobserve(previous.element);
    hosts.current.delete(id);
    sizes.current.delete(id);
    if (!element) return;
    element.dataset.comparisonChart = id;
    hosts.current.set(id, { element, item, side, index });
    observer.current?.observe(element);
  }, []);

  useEffect(() => {
    disposed.current = false;
    observer.current = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && schedule((entry.target as HTMLElement).dataset.comparisonChart!)),
      { rootMargin: '400px' },
    );
    for (const { element } of hosts.current.values()) observer.current.observe(element);
    const resizer = new ResizeObserver(() => {
      for (const [id, { element }] of hosts.current) {
        if (sizes.current.has(id) && Math.abs(sizes.current.get(id)! - element.clientWidth) > 20) {
          sizes.current.delete(id);
          schedule(id);
        }
      }
    });
    resizer.observe(document.documentElement);
    import('@/components/interactive/design-comparisons.js').then((module) => {
      if (!disposed.current) setCorpus(module as unknown as Corpus);
    });
    return () => {
      disposed.current = true;
      observer.current?.disconnect();
      resizer.disconnect();
    };
  }, [schedule]);

  if (!corpus) return <p className="not-prose my-6 font-mono text-xs text-fd-muted-foreground">Loading comparisons…</p>;
  const visible = corpus.designComparisons.filter((item) => selected === 'all' || item.guide === selected);
  const groups = corpus.comparisonGuides
    .map((guide) => ({ ...guide, examples: visible.filter((item) => item.guide === guide.id) }))
    .filter((guide) => guide.examples.length);

  return (
    <div className="not-prose my-6">
      <nav aria-label="Design guide" className="flex flex-wrap gap-1.5">
        {[{ id: 'all', title: 'All guides' }, ...corpus.comparisonGuides].map((guide) => (
          <button
            key={guide.id}
            type="button"
            aria-pressed={selected === guide.id}
            onClick={() => setSelected(guide.id)}
            className={cn('rounded-md border px-2.5 py-1.5 text-xs font-medium', selected === guide.id ? 'border-fd-foreground bg-fd-foreground text-fd-background' : 'hover:bg-fd-accent/60')}
          >
            {guide.title}
          </button>
        ))}
      </nav>
      {groups.map((guide) => {
        const explanation = corpus.guideExplanations[guide.id];
        return (
          <section key={guide.id} aria-label={guide.title} className="mt-12">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`guide-${guide.id}`} className="text-2xl font-semibold tracking-tight">
                {guide.title}
              </h2>
              <a href={guide.url} target="_blank" rel="noopener" className="text-sm text-fd-primary hover:underline">
                Read the Datawrapper Academy guide ↗
              </a>
            </header>
            <aside aria-label={`${guide.title}: Datawrapper guidance`} className="mt-4 rounded-sm border-l-2 border-fd-primary bg-fd-card px-5 py-4 text-sm leading-relaxed">
              <span className="font-mono text-[0.62rem] uppercase tracking-wider text-fd-muted-foreground">Datawrapper guidance · paraphrased</span>
              <p className="mt-2">
                <strong>Why this can be less effective.</strong> {explanation.why}
              </p>
              <p className="mt-2">
                <strong>When to choose an alternative.</strong> {explanation.context}
              </p>
              <p className="mt-2">
                <strong>What VisDelta can detect.</strong> {explanation.detection}
              </p>
            </aside>
            {guide.examples.map((item) => (
              <article key={item.id} id={item.id} data-comparison={item.id} className="mt-8 scroll-mt-20">
                <header>
                  <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-1 text-sm text-fd-muted-foreground">{item.why}</p>
                </header>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {(['before', 'after'] as const).map((side) => {
                    const view = item[side];
                    return (
                      <figure key={side} data-side={side} className="min-w-0">
                        <figcaption className="mb-2 flex flex-wrap items-baseline gap-2 text-sm">
                          <span aria-hidden="true" className={cn('font-bold', side === 'before' ? 'text-fd-error' : 'text-fd-success')}>
                            {side === 'before' ? '✕' : '✓'}
                          </span>
                          <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider">
                            {view.label ?? (side === 'before' ? 'Not ideal for this goal' : 'Better for this goal')}
                          </span>
                          <span className="text-fd-muted-foreground">{view.caption}</span>
                        </figcaption>
                        <div className="rounded-lg border bg-fd-card p-4">
                          <p className="font-semibold">{item.story.headline}</p>
                          <p className="text-sm text-fd-muted-foreground">{item.story.description}</p>
                          {view.text && <div className="mt-4 text-3xl font-semibold tracking-tight">{view.text}</div>}
                          {view.unsupported && <p className="mt-3 text-sm text-fd-muted-foreground">{view.unsupported}</p>}
                          {view.charts && (
                            <div className={cn('mt-2 grid gap-2', view.charts.length > 1 && 'grid-cols-2')}>
                              {view.charts.map((_, index) => {
                                const id = key(item, side, index);
                                const status = statuses[id];
                                return (
                                  <div key={index} className="relative">
                                    <ComparisonHost item={item} side={side} index={index} register={register} />
                                    {status && (
                                      <p role={status.startsWith('Unable') ? 'alert' : 'status'} className="absolute inset-0 grid place-items-center font-mono text-xs text-fd-muted-foreground">
                                        {status}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <footer className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-fd-muted-foreground">
                            {view.detail && <span>Note: {view.detail}</span>}
                            <span>Source: Illustrative data · Chart: VisDelta</span>
                          </footer>
                        </div>
                        {view.charts?.map((chart, index) => {
                          const hints = advice[key(item, side, index)];
                          const panel = view.charts!.length > 1 ? ` · panel ${index + 1}` : '';
                          return (
                            <div key={index} className="mt-1.5 text-sm">
                              {hints?.length ? (
                                <details>
                                  <summary className="cursor-pointer py-1 text-fd-muted-foreground">
                                    {hints.length} design hint{hints.length === 1 ? '' : 's'}
                                    {panel}
                                  </summary>
                                  {hints.map((hint) => (
                                    <p key={`${hint.code}/${hint.message}`} className="py-1">
                                      {hint.message} {hint.suggestion}
                                    </p>
                                  ))}
                                </details>
                              ) : null}
                              <details>
                                <summary className="cursor-pointer py-1 text-fd-muted-foreground">Data &amp; runnable code{panel}</summary>
                                <div className="vd-code-surface overflow-hidden rounded-lg">
                                  <CodeView code={`const rows = ${JSON.stringify(item.rows, null, 2)};\n\n${chart.code}`} lineNumbers={false} className="max-h-80 px-4" />
                                </div>
                              </details>
                            </div>
                          );
                        })}
                      </figure>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
