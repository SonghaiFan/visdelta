'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VisualizationTransition } from 'visdelta/transition';
import type { VisualizationWarning } from 'visdelta';
import { CodeView } from '@/components/interactive/code-view';
import { loadIdioms, type Idiom, type IdiomGroup } from '@/components/interactive/corpus';
import {
  dataHref,
  errorMessage,
  evaluateChart,
  loadCsv,
  loadFactory,
  loadRuntime,
  prefersReducedMotion,
  renderFrozen,
  yieldToBrowser,
  type ChartState,
} from '@/components/interactive/runtime';
import { cn } from '@/lib/cn';

const designGuides: Partial<Record<Idiom['mark'], { url: string; text: string }>> = {
  bar: {
    url: 'https://www.datawrapper.de/academy/what-to-consider-when-creating-stacked-column-charts',
    text: 'Compare totals or the bottom segment in a stack. Use grouped bars or dots when comparing individual components is the goal.',
  },
  line: {
    url: 'https://www.datawrapper.de/academy/what-to-consider-when-creating-line-charts',
    text: 'Use connected observations for a meaningful order. Keep comparison series subdued and check smoothing against observed values.',
  },
  area: {
    url: 'https://www.datawrapper.de/academy/what-to-consider-when-creating-area-charts',
    text: 'Use stacks when the combined total and its parts both matter. Use lines for precise component comparisons; a moving baseline supports shape and thickness comparisons.',
  },
  point: {
    url: 'https://www.datawrapper.de/academy/examples-of-datawrapper-dot-charts',
    text: 'Position supports precise comparisons. Use a range or connector when the difference between paired values matters.',
  },
};

async function evaluateIdiom(idiom: Idiom): Promise<ChartState> {
  const [factory, rows] = await Promise.all([loadFactory(idiom.mark), loadCsv(idiom.data)]);
  return evaluateChart(idiom.code, { [idiom.mark]: factory }, rows);
}

/**
 * Every visual idiom VisDelta can express, drawn live from its code and a
 * bundled dataset. Tiles are frozen renders; the viewer is a live chart that
 * morphs between idioms of the same mark.
 */
export function IdiomGallery() {
  const [idioms, setIdioms] = useState<Idiom[]>([]);
  const [groups, setGroups] = useState<IdiomGroup[]>([]);
  const nameOfRef = useRef<(url: string) => string>((url) => url);
  const [query, setQuery] = useState('');
  const [tileStatus, setTileStatus] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewerStatus, setViewerStatus] = useState('');
  const [warnings, setWarnings] = useState<VisualizationWarning[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  const drawnWidths = useRef(new Map<string, number>());
  const pending = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const observer = useRef<IntersectionObserver | null>(null);
  const viewerChart = useRef<VisualizationTransition | null>(null);
  const viewerState = useRef<{ mark: string; state: ChartState } | null>(null);
  const viewerVersion = useRef(0);
  const disposed = useRef(false);
  const idiomsRef = useRef<Idiom[]>([]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return idioms.filter((idiom) =>
      terms.every((term) =>
        `${idiom.title} ${idiom.note} ${idiom.mark} ${nameOfRef.current(idiom.data)}`.toLowerCase().includes(term),
      ),
    );
  }, [idioms, query]);
  const visibleGroups = groups
    .map((group) => ({ ...group, idioms: filtered.filter((idiom) => idiom.mark === group.mark) }))
    .filter((group) => group.idioms.length);
  const current = idioms.find((idiom) => idiom.id === openId) ?? null;
  const currentIndex = filtered.findIndex((idiom) => idiom.id === openId);
  const currentGroup = groups.find((group) => group.mark === current?.mark);

  const drawTile = useCallback(async (id: string, target: HTMLElement) => {
    const idiom = idiomsRef.current.find((candidate) => candidate.id === id);
    if (!idiom) return;
    try {
      if (disposed.current || tiles.current.get(id) !== target) return;
      const state = await evaluateIdiom(idiom);
      if (disposed.current || tiles.current.get(id) !== target) return;
      const frozen = await renderFrozen(state, target, 220);
      if (disposed.current || tiles.current.get(id) !== target) return;
      target.replaceChildren(...frozen);
      drawnWidths.current.set(id, target.clientWidth);
      setTileStatus((status) => ({ ...status, [id]: 'ready' }));
    } catch (cause) {
      setTileStatus((status) => ({ ...status, [id]: `error:${errorMessage(cause)}` }));
    } finally {
      pending.current.delete(id);
    }
  }, []);

  const renderTile = useCallback(
    (id: string) => {
      const target = tiles.current.get(id);
      if (!target || drawnWidths.current.has(id) || pending.current.has(id) || disposed.current) return;
      pending.current.add(id);
      // One tile at a time keeps scrolling responsive while thumbnails arrive.
      queue.current = queue.current
        .then(() => drawTile(id, target))
        .then(yieldToBrowser)
        .catch(() => {});
    },
    [drawTile],
  );

  const registerTile = useCallback((id: string, element: HTMLElement | null) => {
    const previous = tiles.current.get(id);
    if (element === previous) return;
    if (previous) {
      observer.current?.unobserve(previous);
      drawnWidths.current.delete(id);
      pending.current.delete(id);
      tiles.current.delete(id);
    }
    if (!element) return;
    tiles.current.set(id, element);
    observer.current?.observe(element);
  }, []);

  const openIdiom = useCallback(async (idiom: Idiom) => {
    setOpenId(idiom.id);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    window.history.replaceState(null, '', `#${idiom.id}`);
    const version = ++viewerVersion.current;
    setViewerStatus('Rendering');
    setWarnings([]);
    try {
      const [state, { visualizationWarnings }, { transition }] = await Promise.all([
        evaluateIdiom(idiom),
        import('visdelta'),
        loadRuntime(),
      ]);
      const advice = await visualizationWarnings(state as never);
      if (version !== viewerVersion.current || disposed.current) return;
      setWarnings(advice);
      const stage = stageRef.current;
      if (!stage) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;';
      stage.append(host);
      // Moving between idioms of one mark morphs the previous chart; anything
      // VisDelta cannot route is simply redrawn.
      const previous = viewerState.current;
      const from = previous && previous.mark === idiom.mark ? previous.state : state;
      const height = Math.max(300, Math.min(560, Math.round(window.innerHeight * 0.58)));
      let chart: VisualizationTransition;
      try {
        chart = await transition(from as never, state as never, { target: host, height });
      } catch {
        chart = await transition(state as never, state as never, { target: host, height });
      }
      if (version !== viewerVersion.current || disposed.current) {
        chart.destroy();
        host.remove();
        return;
      }
      viewerChart.current?.destroy();
      stage.replaceChildren(host);
      host.style.cssText = '';
      viewerChart.current = chart;
      viewerState.current = { mark: idiom.mark, state };
      if (from !== state && !prefersReducedMotion()) {
        chart.progress(0);
        chart.play({ from: 0, to: 1, duration: 700 });
      } else {
        chart.progress(1);
      }
      setViewerStatus('');
    } catch (cause) {
      if (version === viewerVersion.current) setViewerStatus(errorMessage(cause));
    }
  }, []);

  const step = (direction: 1 | -1) => {
    if (!filtered.length) return;
    const index = currentIndex < 0 ? 0 : currentIndex;
    void openIdiom(filtered[(index + direction + filtered.length) % filtered.length]);
  };

  const onClose = () => {
    viewerVersion.current += 1;
    viewerChart.current?.destroy();
    viewerChart.current = null;
    viewerState.current = null;
    setOpenId(null);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  useEffect(() => {
    disposed.current = false;
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.current?.unobserve(entry.target);
          renderTile((entry.target as HTMLElement).dataset.idiom!);
        }
      },
      { rootMargin: '300px' },
    );
    for (const element of tiles.current.values()) observer.current.observe(element);
    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        for (const [id, target] of tiles.current) {
          const width = drawnWidths.current.get(id);
          if (width == null || Math.abs(target.clientWidth - width) < 24) continue;
          drawnWidths.current.delete(id);
          renderTile(id);
        }
      }, 300);
    });
    resizeObserver.observe(document.documentElement);
    loadIdioms()
      .then(({ idioms: list, idiomGroups, datasetName }) => {
        if (disposed.current) return;
        nameOfRef.current = datasetName;
        idiomsRef.current = list;
        setIdioms(list);
        setGroups(idiomGroups);
        const linked = list.find((idiom) => idiom.id === window.location.hash.slice(1));
        if (linked) void openIdiom(linked);
      })
      .catch(() => {});
    return () => {
      disposed.current = true;
      observer.current?.disconnect();
      resizeObserver.disconnect();
      window.clearTimeout(resizeTimer);
      viewerChart.current?.destroy();
    };
  }, [openIdiom, renderTile]);

  return (
    <section aria-label="Visual idioms">
      <nav aria-label="Idiom marks" className="sticky top-14 z-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-fd-background py-3">
        {groups.map((group) => (
          <a key={group.mark} href={`#marks-${group.mark}`} className="font-medium hover:text-fd-primary">
            {group.title}{' '}
            <sup className="font-mono text-[0.65rem] text-fd-muted-foreground">
              {filtered.filter((idiom) => idiom.mark === group.mark).length}
            </sup>
          </a>
        ))}
        <label className="ml-auto flex items-center gap-3">
          <span className="sr-only">Filter</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="stacked, scatter, iris…"
            aria-label="Filter idioms"
            className="h-8 w-56 max-w-[60vw] border-b bg-transparent px-1 text-sm outline-none focus:border-fd-foreground"
          />
        </label>
      </nav>

      {idioms.length > 0 && !visibleGroups.length && <p className="py-12 text-fd-muted-foreground">No idiom matches “{query}”.</p>}

      {visibleGroups.map((group) => (
        <section key={group.mark} id={`marks-${group.mark}`} className="scroll-mt-32 pt-12">
          <header className="mb-6">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">{group.title}</h2>
            <p className="mt-2 text-fd-muted-foreground">{group.summary}</p>
          </header>
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.idioms.map((idiom) => {
              const status = tileStatus[idiom.id];
              return (
                <button key={idiom.id} type="button" data-idiom-tile={idiom.id} aria-label={`Open ${idiom.title}`} onClick={() => void openIdiom(idiom)} className="group text-left focus-visible:outline-offset-4">
                  <span className="relative block h-56 overflow-hidden rounded-md bg-fd-card transition-[box-shadow] duration-300 group-hover:shadow-[0_0_0_1px_var(--color-fd-border)]">
                    <span ref={(element) => registerTile(idiom.id, element)} data-idiom={idiom.id} className="vd-docs-chart vd-gallery-thumb block h-full" />
                    {status?.startsWith('error:') ? (
                      <span role="alert" data-example-error="" className="absolute inset-0 grid place-items-center p-4 text-center font-mono text-xs text-fd-error">
                        {status.slice(6)}
                      </span>
                    ) : status !== 'ready' ? (
                      <span className="absolute inset-0 grid place-items-center font-mono text-xs text-fd-muted-foreground">Drawing…</span>
                    ) : null}
                  </span>
                  <span className="mt-3 block font-medium tracking-tight">{idiom.title}</span>
                  <span className="mt-0.5 block text-sm text-fd-muted-foreground">{idiom.note}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <dialog
        ref={dialogRef}
        aria-label={current ? current.title : 'Idiom'}
        onClose={onClose}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            step(1);
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            step(-1);
          }
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(1240px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-auto rounded-lg border bg-fd-background p-0 text-fd-foreground shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
      >
        {current && (
          <div className="p-5 sm:p-7">
            <header className="mb-5 grid grid-cols-[1fr_auto] gap-x-4">
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-fd-muted-foreground">
                {currentGroup?.title} · {currentIndex + 1} / {filtered.length}
              </span>
              <div className="row-span-3 flex gap-1.5">
                <button type="button" aria-label="Previous idiom" onClick={() => step(-1)} className="size-9 rounded-md border hover:bg-fd-accent">
                  ←
                </button>
                <button type="button" aria-label="Next idiom" onClick={() => step(1)} className="size-9 rounded-md border hover:bg-fd-accent">
                  →
                </button>
                <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="size-9 rounded-md border hover:bg-fd-accent">
                  ✕
                </button>
              </div>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">{current.title}</h2>
              <p className="text-fd-muted-foreground">{current.note}</p>
            </header>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="relative min-h-80 rounded-lg border bg-fd-card p-2">
                <div ref={stageRef} className="vd-docs-chart relative" aria-label="Live chart" />
                {viewerStatus && (
                  <p role={viewerStatus === 'Rendering' ? 'status' : 'alert'} className="absolute inset-0 grid place-items-center font-mono text-xs text-fd-muted-foreground">
                    {viewerStatus}
                  </p>
                )}
              </div>
              <aside className="flex min-w-0 flex-col gap-4">
                {warnings.length > 0 && (
                  <div aria-label="Design hints" className="rounded-lg border p-3.5 text-sm">
                    <p className="mb-2 font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-fd-muted-foreground">
                      Design hints · chart remains available
                    </p>
                    {warnings.map((hint) => (
                      <div key={hint.code} className="mb-2 last:mb-0">
                        <p>
                          {hint.message} {hint.suggestion}
                        </p>
                        {hint.source && (
                          <a href={hint.source} target="_blank" rel="noopener" className="text-xs text-fd-primary hover:underline">
                            Datawrapper guide ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {designGuides[current.mark] && (
                  <div className="rounded-lg border p-3.5 text-sm">
                    <p className="mb-2 font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-fd-muted-foreground">Choosing this chart</p>
                    <p>{designGuides[current.mark]!.text}</p>
                    <a href={designGuides[current.mark]!.url} target="_blank" rel="noopener" className="text-xs text-fd-primary hover:underline">
                      Datawrapper guide ↗
                    </a>
                  </div>
                )}
                <div className="vd-code-surface overflow-hidden rounded-lg">
                  <CodeView code={current.code} lineNumbers={false} className="max-h-72 px-4" />
                </div>
                <p className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-fd-muted-foreground">rows</span>
                  <a href={dataHref(current.data)} target="_blank" rel="noopener" className="font-mono text-xs text-fd-primary hover:underline">
                    {nameOfRef.current(current.data)}.csv
                  </a>
                </p>
                <Link
                  href={`/playground#idiom=${current.id}`}
                  className={cn('inline-flex h-10 items-center justify-center rounded-md bg-fd-foreground px-4 text-sm font-medium text-fd-background hover:opacity-85')}
                >
                  Edit in Playground →
                </Link>
              </aside>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
