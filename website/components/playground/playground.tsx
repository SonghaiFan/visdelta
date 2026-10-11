'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { StateChange } from 'visdelta/core';
import type { VisualizationTransition } from 'visdelta/transition';
import { CodeEditor } from '@/components/interactive/code-editor';
import { loadIdioms } from '@/components/interactive/corpus';
import {
  errorMessage,
  loadCsv,
  loadD3,
  loadFactories,
  loadRuntime,
  prefersReducedMotion,
  type ChartName,
  type ChartState,
  type Rows,
} from '@/components/interactive/runtime';
import { Scrubber } from '@/components/interactive/scrubber';
import { formatChange } from '@/components/live/transition-player';
import { cn } from '@/lib/cn';
import { categories } from '@/examples/registry';
import { StateChangeIcon } from '@/components/interactive/state-change-icon';
import { playgroundDemos, type PlaygroundDemo as CuratedDemo } from './demos';

/** A curated demo, or gallery code opened as state A (no category). */
type PlaygroundDemo = Omit<CuratedDemo, 'category'> & { category?: CuratedDemo['category'] };

const CHARTS: ChartName[] = ['bar', 'line', 'area', 'point', 'unit'];
const HEIGHT = 420;
const EPSILON = 1e-4;
const DEFAULT_DEMO = 'sort';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

interface Dataset {
  name: string;
  rows: Rows;
}

type Errors = { a?: string; b?: string };

function datasetName(url?: string) {
  return url ? url.split('/').at(-1)! : 'inline data';
}

/**
 * Two states, A and B, and the transition between them. Edit either one: the
 * chart animates from what is on screen to your edit, then hands off to a
 * fresh A → B transition you can scrub.
 */
export function Playground() {
  const stageRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<VisualizationTransition | null>(null);
  const factoriesRef = useRef<Awaited<ReturnType<typeof loadFactories>> | null>(null);
  const statesRef = useRef<{ a: ChartState; b: ChartState } | null>(null);
  const versionRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const [direction, setDirectionState] = useState<1 | -1>(1);
  const setDirection = useCallback((next: 1 | -1) => {
    directionRef.current = next;
    setDirectionState(next);
  }, []);
  const datasetRef = useRef<Dataset>({ name: 'inline data', rows: [] });
  const codeRef = useRef({ a: '', b: '' });

  const [demo, setDemo] = useState<PlaygroundDemo | null>(null);
  const [code, setCode] = useState({ a: '', b: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [dataset, setDataset] = useState<Dataset>({ name: 'inline data', rows: [] });
  const [showRows, setShowRows] = useState(false);
  const [value, setValue] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [changes, setChanges] = useState<StateChange[]>([]);
  const [busy, setBusy] = useState(true);

  const stopTracking = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  /** Follow a controller's playback in the scrubber until it reaches `target`. */
  const track = useCallback(
    (controller: VisualizationTransition, target: number, request: number) =>
      new Promise<void>((resolve) => {
        stopTracking();
        const step = () => {
          if (request !== versionRef.current) return resolve();
          setValue(controller.value);
          if (Math.abs(controller.value - target) < EPSILON) {
            frameRef.current = null;
            return resolve();
          }
          frameRef.current = requestAnimationFrame(step);
        };
        frameRef.current = requestAnimationFrame(step);
      }),
    [stopTracking],
  );

  /** Build a transition in a hidden layer of the stage. */
  const prepare = useCallback(async (from: ChartState, to: ChartState) => {
    const stage = stageRef.current!;
    const { transition } = await loadRuntime();
    const layer = document.createElement('div');
    layer.className = 'pg-layer';
    layer.dataset.state = 'hidden';
    stage.append(layer);
    try {
      const controller = await transition(from as never, to as never, { target: layer, height: HEIGHT });
      return { layer, controller };
    } catch (cause) {
      layer.remove();
      throw cause;
    }
  }, []);

  /** Show a prepared layer in place of the current one, at one exact frame. */
  const swap = useCallback((next: { layer: HTMLElement; controller: VisualizationTransition }, at: number, fade = false) => {
    const stage = stageRef.current!;
    next.controller.progress(at);
    const previous = controllerRef.current;
    controllerRef.current = next.controller;
    const old = [...stage.children].filter((child) => child !== next.layer);
    next.layer.dataset.state = fade ? 'entering' : 'shown';
    if (fade) requestAnimationFrame(() => (next.layer.dataset.state = 'shown'));
    for (const child of old) {
      if (fade) {
        (child as HTMLElement).dataset.state = 'leaving';
        window.setTimeout(() => child.remove(), 220);
      } else {
        child.remove();
      }
    }
    if (previous) window.setTimeout(() => previous.destroy(), fade ? 220 : 0);
  }, []);

  /** Evaluate A, then A + B, so an error is reported against the editor that caused it. */
  const evaluate = useCallback(async (source: { a: string; b: string }, rows: Rows) => {
    const factories = factoriesRef.current!;
    const d3 = await loadD3();
    const names = Object.keys(factories);
    const values = names.map((name) => factories[name as ChartName]);
    const run = (body: string) => new AsyncFunction(...names, 'd3', 'rows', `"use strict";\n${body}`)(...values, d3, structuredClone(rows));
    let a: ChartState;
    try {
      a = (await run(`${source.a}\nreturn a;`)) as ChartState;
      if (typeof a?.toSpec !== 'function') throw new Error('Declare a VisDelta state as `const a`.');
    } catch (cause) {
      return { errors: { a: errorMessage(cause) } as Errors };
    }
    try {
      const [, b] = (await run(`${source.a}\n${source.b}\nreturn [a, b];`)) as [ChartState, ChartState];
      if (typeof b?.toSpec !== 'function') throw new Error('Declare a VisDelta state as `const b`.');
      if (b.toSpec().mark !== a.toSpec().mark) throw new Error('A and B must use the same chart type.');
      return { a, b, errors: {} as Errors };
    } catch (cause) {
      return { errors: { b: errorMessage(cause) } as Errors };
    }
  }, []);

  const updateChanges = useCallback(async (a: ChartState, b: ChartState) => {
    const { delta } = await import('visdelta/core');
    setChanges(delta(a as never, b as never).stateChanges);
  }, []);

  /** Open a demo: cross-fade to its A, then play to B once. */
  const open = useCallback(
    async (next: PlaygroundDemo, source = { a: next.a, b: next.b }) => {
      const request = ++versionRef.current;
      stopTracking();
      controllerRef.current?.pause();
      setPlaying(false);
      setBusy(true);
      setDemo(next);
      codeRef.current = source;
      setCode(source);
      setErrors({});
      setShowRows(false);
      try {
        factoriesRef.current ??= await loadFactories(CHARTS);
        const rows = next.data ? await loadCsv(next.data) : [];
        const data = { name: datasetName(next.data), rows };
        datasetRef.current = data;
        setDataset(data);
        const result = await evaluate(source, rows);
        if (request !== versionRef.current) return;
        if (!result.a || !result.b) return setErrors(result.errors);
        const prepared = await prepare(result.a, result.b);
        if (request !== versionRef.current) return prepared.controller.destroy();
        swap(prepared, 0, true);
        statesRef.current = { a: result.a, b: result.b };
        setValue(0);
        void updateChanges(result.a, result.b);
        setBusy(false);
        if (!prefersReducedMotion()) {
          await new Promise((resolve) => window.setTimeout(resolve, 450));
          if (request !== versionRef.current) return;
          setDirection(1);
          setPlaying(true);
          prepared.controller.play({ from: 0, to: 1, duration: 900 });
          await track(prepared.controller, 1, request);
          if (request === versionRef.current) setPlaying(false);
        }
      } catch (cause) {
        if (request === versionRef.current) setErrors({ b: errorMessage(cause) });
      } finally {
        if (request === versionRef.current) setBusy(false);
      }
    },
    [evaluate, prepare, setDirection, stopTracking, swap, track, updateChanges],
  );

  /**
   * Apply an edit. The chart moves from the frame on screen to the edited
   * state, then a fresh A → B transition takes over at that same frame.
   */
  const apply = useCallback(
    async (side: 'a' | 'b') => {
      const request = ++versionRef.current;
      const source = codeRef.current;
      const current = statesRef.current;
      const result = await evaluate(source, datasetRef.current.rows);
      if (request !== versionRef.current) return;
      setErrors(result.errors);
      if (!result.a || !result.b) return;
      stopTracking();
      const controller = controllerRef.current;
      controller?.pause();
      const shown = current && controller ? (controller.value >= 0.5 ? current.b : current.a) : null;
      const target = side === 'a' ? result.a : result.b;
      const end = side === 'a' ? 0 : 1;
      try {
        if (shown && shown.toSpec().mark === target.toSpec().mark && !prefersReducedMotion()) {
          const handoff = await prepare(shown, target);
          if (request !== versionRef.current) return handoff.controller.destroy();
          swap(handoff, 0);
          setPlaying(true);
          handoff.controller.play({ from: 0, to: 1, duration: 650 });
          setValue(controller?.value ?? 0);
          await track(handoff.controller, 1, request);
          if (request !== versionRef.current) return;
          setPlaying(false);
        }
        const final = await prepare(result.a, result.b);
        if (request !== versionRef.current) return final.controller.destroy();
        swap(final, end, !shown || shown.toSpec().mark !== target.toSpec().mark);
        statesRef.current = { a: result.a, b: result.b };
        setValue(end);
        setDirection(end === 1 ? -1 : 1);
        void updateChanges(result.a, result.b);
      } catch (cause) {
        if (request === versionRef.current) setErrors({ [side]: errorMessage(cause) });
      }
    },
    [evaluate, prepare, setDirection, stopTracking, swap, track, updateChanges],
  );

  const edit = useCallback(
    (side: 'a' | 'b', text: string) => {
      codeRef.current = { ...codeRef.current, [side]: text };
      setCode(codeRef.current);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void apply(side), 450);
    },
    [apply],
  );
  const editA = useCallback((text: string) => edit('a', text), [edit]);
  const editB = useCallback((text: string) => edit('b', text), [edit]);

  // Route: #sort, #zip … or #idiom=<gallery idiom id>.
  useEffect(() => {
    const route = async () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash.startsWith('idiom=')) {
        const { idioms } = await loadIdioms();
        const idiom = idioms.find((item) => item.id === hash.slice(6));
        if (idiom) {
          const fromGallery: PlaygroundDemo = {
            id: hash,
            title: idiom.title,
            chart: idiom.mark,
            line: 'From the gallery. Change B and watch the chart follow.',
            data: idiom.data,
            a: idiom.code.replace(/^const chart\b/m, 'const a'),
            b: 'const b = a;',
          };
          return void open(fromGallery);
        }
      }
      void open(playgroundDemos.find((item) => item.id === hash) ?? playgroundDemos.find((item) => item.id === DEFAULT_DEMO)!);
    };
    void route();
    window.addEventListener('hashchange', route);
    const stage = stageRef.current;
    const observer = new ResizeObserver(() => controllerRef.current?.resize());
    if (stage) observer.observe(stage);
    return () => {
      window.removeEventListener('hashchange', route);
      observer.disconnect();
      versionRef.current += 1;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [open]);

  const select = (next: PlaygroundDemo) => {
    window.history.replaceState(null, '', `#${next.id}`);
    void open(next);
  };

  const onPlay = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    versionRef.current += 1;
    const request = versionRef.current;
    if (playing) {
      stopTracking();
      controller.pause();
      setPlaying(false);
      setValue(controller.value);
      return;
    }
    const current = controller.value;
    const target = current >= 1 - EPSILON ? 0 : current <= EPSILON ? 1 : directionRef.current > 0 ? 1 : 0;
    setDirection(target > current ? 1 : -1);
    controller.play({ from: current, to: target, duration: 900 });
    setPlaying(true);
    void track(controller, target, request).then(() => {
      if (request === versionRef.current) setPlaying(false);
    });
  };

  const onScrub = (next: number) => {
    const controller = controllerRef.current;
    if (!controller) return;
    versionRef.current += 1;
    stopTracking();
    setDirection(next >= controller.value ? 1 : -1);
    controller.progress(next);
    setPlaying(false);
    setValue(next);
  };

  const replaceRows = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const d3 = await loadD3();
      const rows = /\.json$/i.test(file.name) ? JSON.parse(text) : d3.csvParse(text, d3.autoType);
      if (!Array.isArray(rows) || !rows.length) throw new Error('Use a non-empty CSV table or a JSON array of rows.');
      const data = { name: file.name, rows: rows as Rows };
      datasetRef.current = data;
      setDataset(data);
      void apply('b');
    } catch (cause) {
      setErrors({ a: errorMessage(cause) });
    }
  };

  const columns = useMemo(() => [...new Set(dataset.rows.slice(0, 50).flatMap((row) => Object.keys(row)))], [dataset]);
  const edited = demo && (code.a !== demo.a || code.b !== demo.b);
  const towardA = value >= 1 - EPSILON || (value > EPSILON && direction < 0);

  return (
    <div>
      <nav aria-label="Kinds of change" className="flex flex-wrap gap-x-5 gap-y-2 border-b pb-3">
        {categories.map((category) => {
          const active = demo?.category === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              title={category.summary}
              onClick={() => select(playgroundDemos.find((item) => item.category === category.id)!)}
              className={cn(
                'relative flex items-center gap-1.5 pb-1 text-[0.95rem] transition-colors',
                active ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
              )}
            >
              <StateChangeIcon category={category.id} className="size-3.5" />
              {category.label}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 -bottom-[3px] h-px md:-bottom-[13px] bg-fd-foreground transition-transform duration-300 ease-out-quint',
                  active ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </button>
          );
        })}
      </nav>
      {demo?.category && (
        <nav aria-label="Transitions" className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {playgroundDemos
            .filter((item) => item.category === demo.category)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={demo.id === item.id}
                onClick={() => select(item)}
                className={cn(
                  'font-mono text-sm transition-colors',
                  demo.id === item.id ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
                )}
              >
                {item.title}
              </button>
            ))}
        </nav>
      )}
      <p className="mt-3 min-h-6 text-fd-muted-foreground">
        {demo?.line}
        {demo && <span className="vd-label ml-3">{demo.chart}</span>}
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 space-y-5">
          <StateEditor side="a" value={code.a} error={errors.a} onChange={editA} onRun={() => void apply('a')} />
          <StateEditor side="b" value={code.b} error={errors.b} onChange={editB} onRun={() => void apply('b')} />

          <div className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-fd-muted-foreground">
              <span className="vd-label">rows</span>
              <span className="font-mono text-xs">
                {dataset.name} · {dataset.rows.length} records
              </span>
              {dataset.rows.length > 0 && (
                <button type="button" className="text-xs underline-offset-4 hover:text-fd-foreground hover:underline" onClick={() => setShowRows((shown) => !shown)}>
                  {showRows ? 'hide' : 'view'}
                </button>
              )}
              <label className="cursor-pointer text-xs underline-offset-4 hover:text-fd-foreground hover:underline">
                use your own
                <input type="file" accept=".csv,.json" className="sr-only" aria-label="Use your own CSV or JSON rows" onChange={(event) => void replaceRows(event.currentTarget)} />
              </label>
              {edited && (
                <button type="button" className="ml-auto text-xs underline-offset-4 hover:text-fd-foreground hover:underline" onClick={() => demo && void open(playgroundDemos.find((item) => item.id === demo.id) ?? demo)}>
                  reset
                </button>
              )}
            </div>
            {showRows && (
              <div className="mt-2 max-h-64 overflow-auto rounded-md border">
                <table className="w-full whitespace-nowrap text-left font-mono text-[0.7rem] tabular-nums">
                  <thead className="sticky top-0 bg-fd-background">
                    <tr>
                      {columns.map((field) => (
                        <th key={field} className="px-3 py-2 font-medium text-fd-muted-foreground">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.rows.slice(0, 200).map((row, index) => (
                      <tr key={index} className="border-t">
                        {columns.map((field) => (
                          <td key={field} className="px-3 py-1.5">
                            {row[field] instanceof Date ? (row[field] as Date).toISOString().slice(0, 10) : String(row[field] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-fd-muted-foreground">
              Edits apply as you type · <kbd className="font-mono">⌘↵</kbd> applies now · files stay in your browser
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div ref={stageRef} className="pg-stage vd-docs-chart" style={{ minHeight: HEIGHT }} aria-label="Chart" aria-busy={busy} />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              aria-label={playing ? 'Pause' : towardA ? 'Play back to A' : 'Play to B'}
              title={playing ? 'Pause' : towardA ? 'Play back to A' : 'Play to B'}
              onClick={onPlay}
              disabled={busy && value === 0 && !changes.length}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-fd-accent disabled:opacity-40"
            >
              {playing ? <Pause className="size-3.5" /> : <Play className={cn('size-3.5 transition-transform duration-300', towardA ? 'rotate-180' : 'translate-x-px')} />}
            </button>
            <Scrubber value={value} onChange={onScrub} className="flex-1" label="Progress from A to B" />
            <output className="w-10 text-right font-mono text-xs tabular-nums text-fd-muted-foreground">{value.toFixed(2)}</output>
          </div>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pl-11 font-mono text-xs text-fd-muted-foreground" aria-live="polite">
            <span className="font-sans font-semibold text-[var(--color-delta)]">Δ</span>
            {changes.length ? changes.map((change, index) => <span key={index} className="text-fd-foreground/80">{formatChange(change)}</span>) : <span>no state change yet</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

function StateEditor({
  side,
  value,
  error,
  onChange,
  onRun,
}: {
  side: 'a' | 'b';
  value: string;
  error?: string;
  onChange: (text: string) => void;
  onRun: () => void;
}) {
  return (
    <section aria-label={`State ${side.toUpperCase()}`}>
      <header className="mb-1.5 flex items-center gap-2">
        {side === 'a' ? (
          <span aria-hidden="true" className="size-2 rounded-full bg-[var(--color-state-a)]" />
        ) : (
          <span aria-hidden="true" className="size-0 border-x-[4.5px] border-b-[8px] border-x-transparent border-b-[var(--color-state-b)]" />
        )}
        <span className="vd-label text-fd-foreground">State {side.toUpperCase()}</span>
      </header>
      <div className={cn('vd-code-surface overflow-hidden rounded-md transition-shadow', error && 'shadow-[inset_2px_0_0_var(--color-fd-error)]')}>
        <CodeEditor value={value} onChange={onChange} onRun={onRun} ariaLabel={`Code for state ${side.toUpperCase()}`} />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 font-mono text-xs text-fd-error">
          {error}
        </p>
      )}
    </section>
  );
}
