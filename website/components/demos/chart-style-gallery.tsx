'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from 'visdelta/react';
import type { Visualization } from 'visdelta/transition';
import { CodeView } from '@/components/interactive/code-view';
import { errorMessage } from '@/components/interactive/runtime';
import { cn } from '@/lib/cn';

type PresetKey = 'd3' | 'paper' | 'dark' | 'editorial';
const presets: { key: PresetKey; name: string; note: string; importName: string }[] = [
  { key: 'd3', name: 'D3', note: 'Familiar categorical colours, open axes and responsive spacing.', importName: 'd3ChartStyle' },
  { key: 'paper', name: 'Paper', note: 'Centred axis titles and a legend that adapts to the available space.', importName: 'paperChartStyle' },
  { key: 'dark', name: 'Dark', note: 'Compact mono labels, a blueprint surface and a monochrome blue scale.', importName: 'darkChartStyle' },
  { key: 'editorial', name: 'Editorial', note: 'Warm neutral ink, hairline grids, a flat figure and the default palette.', importName: 'editorialChartStyle' },
];

const pointRows = [
  { place: 'Albany', region: 'North', income: 42, health: 66, access: 63 },
  { place: 'Brighton', region: 'South', income: 51, health: 73, access: 76 },
  { place: 'Carlton', region: 'North', income: 68, health: 78, access: 81 },
  { place: 'Docklands', region: 'South', income: 76, health: 70, access: 74 },
  { place: 'Elwood', region: 'North', income: 84, health: 86, access: 89 },
  { place: 'Fitzroy', region: 'South', income: 57, health: 61, access: 69 },
];
const barRows = [
  { category: 'A', region: 'North', value: 28, next: 34 },
  { category: 'B', region: 'South', value: 47, next: 41 },
  { category: 'C', region: 'North', value: 39, next: 52 },
  { category: 'D', region: 'South', value: 66, next: 61 },
  { category: 'E', region: 'North', value: 58, next: 72 },
];
const seriesRows = [
  { id: 'Q1', period: 'Q1', sales: 28, next: 34 },
  { id: 'Q2', period: 'Q2', sales: 47, next: 43 },
  { id: 'Q3', period: 'Q3', sales: 39, next: 51 },
  { id: 'Q4', period: 'Q4', sales: 66, next: 62 },
  { id: 'Q5', period: 'Q5', sales: 58, next: 70 },
  { id: 'Q6', period: 'Q6', sales: 79, next: 74 },
];
const unitRows = [
  { id: 'A', team: 'Alpha', count: 10 },
  { id: 'B', team: 'Beta', count: 8 },
  { id: 'C', team: 'Gamma', count: 12 },
];

type Api = typeof import('visdelta');
const demos: { key: string; name: string; note: string; states: (api: Api) => [Visualization, Visualization] }[] = [
  {
    key: 'bar',
    name: 'Bar',
    note: 'length and category',
    states: (api) => {
      const from = api.bar(barRows).x('category', { label: 'Category' }).y('value', { label: 'Value' }).color('region');
      return [from, from.y('next', { label: 'Next value' })];
    },
  },
  {
    key: 'point',
    name: 'Point',
    note: 'position and colour',
    states: (api) => {
      const from = api.point(pointRows).x('income', { label: 'Income' }).y('health', { label: 'Health' }).key('place').color('region');
      return [from, from.y('access', { label: 'Access' })];
    },
  },
  {
    key: 'line',
    name: 'Line',
    note: 'sequence and change',
    states: (api) => {
      const from = api.line(seriesRows).x('period', { label: 'Period' }).y('sales', { label: 'Sales' });
      return [from, from.y('next', { label: 'Forecast' })];
    },
  },
  {
    key: 'area',
    name: 'Area',
    note: 'magnitude over sequence',
    states: (api) => {
      const from = api.area(seriesRows).x('period', { label: 'Period' }).y('sales', { label: 'Sales' });
      return [from, from.y('next', { label: 'Forecast' })];
    },
  },
  {
    key: 'unit',
    name: 'Unit',
    note: 'individual counts',
    states: (api) => {
      const from = api.unit(unitRows).value('count', { maxUnits: 60 }).key('id').layout('grid', { columns: 10, radius: 5 });
      return [from, from.group('team').layout('bar', { columns: 4, radius: 5 }).color('team')];
    },
  },
];

/** One structural style applied to five chart types, all driven by one progress value. */
export function ChartStyleGallery() {
  const [api, setApi] = useState<Api | null>(null);
  const [selected, setSelected] = useState<PresetKey>('d3');
  const [progress, setProgress] = useState(0.5);
  const [status, setStatus] = useState('Loading');
  const completed = useRef(new Set<string>());
  const scenes = useMemo(() => api ? demos.map((demo) => ({ ...demo, states: demo.states(api) })) : [], [api]);

  useEffect(() => {
    let cancelled = false;
    void import('visdelta').then((module) => { if (!cancelled) setApi(module); })
      .catch((cause) => { if (!cancelled) setStatus(errorMessage(cause)); });
    return () => { cancelled = true; };
  }, []);

  const preset = presets.find((item) => item.key === selected)!;
  const snippet = `import { ${preset.importName} } from "visdelta/chart-style";

await transition(from, to, {
  target: "#chart",
  chartStyle: ${preset.importName}
});`;

  return (
    <section className="not-prose my-6 rounded-lg border bg-fd-card p-4 sm:p-5" aria-labelledby="style-gallery-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 id="style-gallery-title" className="text-lg font-semibold tracking-tight">
            Switch the whole chart style
          </h3>
          <p className="text-sm text-fd-muted-foreground">One preset updates Bar, Point, Line, Area and Unit without changing their data or transition.</p>
        </div>
        <span aria-live="polite" className="font-mono text-xs text-fd-muted-foreground">
          {status}
        </span>
      </div>
      <div role="group" aria-label="Chart style preset" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {presets.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected === item.key}
            onClick={() => {
              if (item.key === selected) return;
              completed.current.clear();
              setStatus('Applying style');
              setSelected(item.key);
            }}
            className={cn('rounded-md border p-3 text-left transition-colors', selected === item.key ? 'border-fd-primary bg-fd-primary/8' : 'hover:bg-fd-accent/50')}
          >
            <strong className="block text-sm">{item.name}</strong>
            <span className="mt-0.5 block text-xs text-fd-muted-foreground">{item.note}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Live previews for all chart types">
        {scenes.map((demo) => (
          <section key={demo.key} className="overflow-hidden rounded-md border">
            <header className="flex items-baseline justify-between border-b px-3 py-2 text-xs">
              <strong>{demo.name}</strong>
              <span className="text-fd-muted-foreground">{demo.note}</span>
            </header>
            <Chart
              state={demo.states} height={240} progress={progress}
              chartStyle={api!.chartStylePresets[selected]}
              onReady={() => {
                completed.current.add(demo.key);
                if (completed.current.size === demos.length) setStatus(`${preset.name} active · ${demos.length} charts`);
              }}
              onError={(error) => setStatus(error.message)}
              className="vd-docs-chart relative min-h-[248px]"
              aria-label={`${demo.name} style preview`}
            />
          </section>
        ))}
        <div className="vd-code-surface overflow-hidden rounded-md">
          <CodeView code={snippet} lineNumbers={false} className="px-4" />
        </div>
      </div>
      <label className="mt-4 flex items-center gap-3 text-xs">
        <span className="font-mono uppercase tracking-wider text-fd-muted-foreground">Shared transition</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={progress}
          aria-label="Style preview transition progress"
          onChange={(event) => setProgress(event.currentTarget.valueAsNumber)}
          className="vd-scrubber flex-1"
          style={{ ['--fill' as string]: `${progress * 100}%` }}
        />
        <output className="w-10 text-right font-mono tabular-nums">{progress.toFixed(2)}</output>
      </label>
    </section>
  );
}
