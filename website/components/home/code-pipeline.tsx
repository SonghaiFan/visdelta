'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualizationTransition } from 'visdelta/transition';
import { CodeView } from '@/components/interactive/code-view';
import {
  errorMessage,
  evaluateChart,
  loadFactories,
  loadRuntime,
  prefersReducedMotion,
  type ChartName,
  type ChartState,
} from '@/components/interactive/runtime';
import { cn } from '@/lib/cn';

const rows = [
  { year: 2004, country: 'Norway', sites: 5 },
  { year: 2004, country: 'Denmark', sites: 4 },
  { year: 2004, country: 'Sweden', sites: 13 },
  { year: 2022, country: 'Norway', sites: 8 },
  { year: 2022, country: 'Denmark', sites: 10 },
  { year: 2022, country: 'Sweden', sites: 15 },
];

interface Operation {
  line: string;
  label: string;
}

const chartTypes: { key: Exclude<ChartName, 'pie'>; label: string; base: string[]; operations: Operation[] }[] = [
  {
    key: 'bar',
    label: 'Bar',
    base: ['const chart = bar(rows)', '  .x("year")', '  .y("sites")', '  .breakdown("country")'],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.layout("grouped")', label: '.layout()' },
      { line: '.flip()', label: '.flip()' },
    ],
  },
  {
    key: 'line',
    label: 'Line',
    base: ['const chart = line(rows)', '  .x("year")', '  .y("sites")', '  .breakdown("country")'],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.curve("curveBumpX")', label: '.curve()' },
      { line: '.flip()', label: '.flip()' },
    ],
  },
  {
    key: 'area',
    label: 'Area',
    base: ['const chart = area(rows)', '  .x("year")', '  .y("sites")', '  .breakdown("country")'],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.layout("stream")', label: '.layout()' },
      { line: '.curve("curveBumpX")', label: '.curve()' },
    ],
  },
  {
    key: 'point',
    label: 'Point',
    base: ['const chart = point(rows)', '  .x("sites")', '  .y("country")', '  .key(["year", "country"])'],
    operations: [
      { line: '.color("country")', label: '.color()' },
      { line: '.connector({ by: "country", orderBy: "year" })', label: '.connector()' },
      { line: '.flip()', label: '.flip()' },
    ],
  },
  {
    key: 'unit',
    label: 'Unit',
    base: ['const chart = unit(rows)', '  .x("year")', '  .key(["year", "country"])', '  .value("sites", { unitValue: 2 })'],
    operations: [
      { line: '.group("country")', label: '.group()' },
      { line: '.color("country")', label: '.color()' },
      { line: '.layout("force")', label: '.layout()' },
    ],
  },
];

type ChartKey = (typeof chartTypes)[number]['key'];

function sourceFor(type: ChartKey, active: boolean[]) {
  const config = chartTypes.find((chart) => chart.key === type)!;
  const lines = [...config.base, ...config.operations.filter((_, index) => active[index]).map(({ line }) => `  ${line}`)];
  lines[lines.length - 1] += ';';
  return lines.join('\n');
}

const START_DELAY = 1400;
const LINE_HOLD = 1300;
const STEP_GAP = 1200;

/**
 * Data → code → chart. The code edits itself one declaration at a time (or
 * the reader toggles lines), and every edit is rendered by the real
 * transition() from the previous chart state to the new one.
 */
export function CodePipeline() {
  const targetRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<VisualizationTransition | null>(null);
  const stateRef = useRef<ChartState | null>(null);
  const factoriesRef = useRef<Awaited<ReturnType<typeof loadFactories>> | null>(null);
  const versionRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const autoRef = useRef(true);
  const [type, setType] = useState<ChartKey>('bar');
  const [active, setActive] = useState<boolean[]>([false, false, false]);
  const [code, setCode] = useState(() => sourceFor('bar', [false, false, false]));
  const [changedLine, setChangedLine] = useState(-1);
  const [status, setStatus] = useState('Loading VisDelta');
  const [auto, setAuto] = useState(true);
  const [ready, setReady] = useState(false);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  /** Evaluate `nextCode`, transition to it from the chart on screen, then publish the code. */
  const commit = useCallback(
    async (chart: ChartKey, nextActive: boolean[], animate: boolean, operation?: { op: Operation; adding: boolean }) => {
      const target = targetRef.current;
      const factories = factoriesRef.current;
      if (!target || !factories) return false;
      const version = ++versionRef.current;
      const nextCode = sourceFor(chart, nextActive);
      const candidate = document.createElement('div');
      candidate.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;';
      target.append(candidate);
      let next: VisualizationTransition | null = null;
      try {
        const { transition } = await loadRuntime();
        const nextState = await evaluateChart(nextCode, factories, rows, { withD3: false });
        const previous = stateRef.current;
        const from = previous && previous.toSpec().mark === nextState.toSpec().mark ? previous : nextState;
        next = await transition(from as never, nextState as never, {
          target: candidate,
          height: window.innerWidth < 640 ? 280 : 340,
        });
        if (version !== versionRef.current) {
          next.destroy();
          return false;
        }
        next.progress(0);
        target.replaceChildren(...candidate.childNodes);
        controllerRef.current?.destroy();
        controllerRef.current = next;
        stateRef.current = nextState;
        setCode(nextCode);
        setType(chart);
        setActive(nextActive);
        setChangedLine(
          operation?.adding ? nextCode.split('\n').findIndex((line) => line.includes(operation.op.line)) : -1,
        );
        setStatus(
          operation
            ? `${operation.adding ? 'Adding' : 'Removing'} ${operation.op.label}`
            : `${chartTypes.find((entry) => entry.key === chart)!.label} code and chart are linked`,
        );
        if (animate && !prefersReducedMotion()) {
          next.progress(0.1);
          next.play({ from: 0.1, to: 1, duration: 950 });
        } else {
          next.progress(1);
        }
        return true;
      } catch (cause) {
        next?.destroy();
        if (version === versionRef.current) setStatus(errorMessage(cause));
        return false;
      } finally {
        candidate.remove();
      }
    },
    [],
  );

  /** Ping-pong through the operations: add each in order, then remove them. */
  const advanceRef = useRef<(chart: ChartKey, current: boolean[], direction: 1 | -1, delay: number) => void>(() => {});
  useEffect(() => {
    advanceRef.current = (chart, current, direction, delay) => {
      clearTimer();
      if (!autoRef.current || prefersReducedMotion()) return;
      timerRef.current = window.setTimeout(async () => {
        const config = chartTypes.find((entry) => entry.key === chart)!;
        const count = current.filter(Boolean).length;
        let dir = direction;
        if ((dir === 1 && count === config.operations.length) || (dir === -1 && count === 0)) dir = dir === 1 ? -1 : 1;
        const index = dir === 1 ? count : count - 1;
        const next = config.operations.map((_, i) => i < count + (dir === 1 ? 1 : -1));
        const committed = await commit(chart, next, true, { op: config.operations[index], adding: dir === 1 });
        if (!committed || !autoRef.current) return;
        timerRef.current = window.setTimeout(() => {
          setChangedLine(-1);
          setStatus(`${config.label} code and chart are linked`);
          advanceRef.current(chart, next, dir, STEP_GAP);
        }, LINE_HOLD);
      }, delay);
    };
  }, [commit]);
  const scheduleAdvance = useCallback(
    (chart: ChartKey, current: boolean[], direction: 1 | -1, delay: number) => advanceRef.current(chart, current, direction, delay),
    [],
  );

  const selectChart = useCallback(
    async (chart: ChartKey) => {
      clearTimer();
      const initial = [false, false, false];
      setType(chart);
      setCode(sourceFor(chart, initial));
      setChangedLine(-1);
      setStatus(`Rendering ${chartTypes.find((entry) => entry.key === chart)!.label}`);
      const committed = await commit(chart, initial, false);
      if (committed) scheduleAdvance(chart, initial, 1, START_DELAY);
    },
    [commit, scheduleAdvance],
  );

  useEffect(() => {
    let cancelled = false;
    loadFactories(['bar', 'line', 'area', 'point', 'unit'])
      .then((factories) => {
        if (cancelled) return;
        factoriesRef.current = factories;
        setReady(true);
        void selectChart('bar');
      })
      .catch((cause) => setStatus(errorMessage(cause)));
    const target = targetRef.current;
    const observer = new ResizeObserver(() => controllerRef.current?.resize());
    if (target) observer.observe(target);
    return () => {
      cancelled = true;
      versionRef.current += 1;
      clearTimer();
      observer.disconnect();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [selectChart]);

  /** A reader's edit stops the automatic editing until they resume it. */
  const toggleOperation = (index: number) => {
    autoRef.current = false;
    setAuto(false);
    clearTimer();
    const config = chartTypes.find((entry) => entry.key === type)!;
    const next = active.map((on, i) => (i === index ? !on : on));
    void commit(type, next, true, { op: config.operations[index], adding: next[index] });
  };

  const resume = () => {
    autoRef.current = true;
    setAuto(true);
    scheduleAdvance(type, active, 1, 400);
  };

  const pickChart = (chart: ChartKey) => {
    autoRef.current = auto;
    void selectChart(chart);
  };

  const operations = chartTypes.find((entry) => entry.key === type)!.operations;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      <section aria-label="Chart code" className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <span className="vd-label">state.js</span>
          {auto ? (
            <span className="vd-label">editing itself</span>
          ) : (
            <button type="button" onClick={resume} className="vd-label underline-offset-4 hover:text-fd-foreground hover:underline">
              resume
            </button>
          )}
        </div>
        <div className="vd-code-surface overflow-hidden rounded-md">
          <CodeView code={code} highlightedLine={changedLine} lineNumbers={false} className="min-h-[12.5rem]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Toggle declarations">
          {operations.map((operation, index) => (
            <button
              key={operation.line}
              type="button"
              aria-pressed={active[index]}
              disabled={!ready}
              onClick={() => toggleOperation(index)}
              className={cn(
                'font-mono text-xs transition-colors',
                active[index] ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground',
              )}
            >
              <span aria-hidden="true" className="inline-block w-3">
                {active[index] ? '−' : '+'}
              </span>
              {operation.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Chart driven by the code" className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <div role="group" aria-label="Chart type" className="flex gap-4">
            {chartTypes.map((chart) => (
              <button
                key={chart.key}
                type="button"
                aria-pressed={type === chart.key}
                onClick={() => pickChart(chart.key)}
                className={cn('vd-label transition-colors', type === chart.key ? 'text-fd-foreground!' : 'hover:text-fd-foreground')}
              >
                {chart.label}
              </button>
            ))}
          </div>
          <span role="status" className="sr-only">
            {status}
          </span>
        </div>
        <div ref={targetRef} className="vd-docs-chart relative min-h-[296px] sm:min-h-[356px]" />
      </section>
    </div>
  );
}
