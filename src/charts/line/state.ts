import type { CanonicalTransitionPair, ChannelSpec, IntermediateSpec, SelectionSpec, ViewSpec } from '../../types/index.js';
import { hasRowFilter, matchesFilter, normalizeFilter } from '../../data/filter.js';
import { cloneState } from '../../grammar/view-state.js';
import { specState, withSpecMeta } from '../../spec-meta.js';
import { connectedStretches } from '../continuity.js';
import { linePointKeyAccessor } from './keys.js';
import { viewHighlight, viewSelection } from '../../focus.js';

interface LineState {
  selection: SelectionSpec | null;
  highlight: SelectionSpec | null;
  filtersRows: boolean;
  seriesField: string | null;
  detailMode: string | null;
  detailStage: string | null;
  detailPosition: string | null;
  detailParentOp: string;
  flipped: boolean;
  connect: 'adjacent' | 'across';
}

interface LineSeries {
  key: string;
  rows: Record<string, unknown>[];
}

export function lineState(spec: ViewSpec = {}, enc: Record<string, ChannelSpec> = {}): LineState {
  const state = specState(spec);
  const detail = (state.sceneState as Record<string, unknown> | undefined)?.['detail'] as Record<string, unknown> | undefined ?? {};
  const axis = (state.sceneState as Record<string, unknown> | undefined)?.['axis'] as Record<string, unknown> | undefined ?? {};
  return {
    selection: viewSelection(spec),
    highlight: viewHighlight(spec),
    filtersRows: hasRowFilter(spec),
    seriesField: (detail['seriesField'] as string) || enc['color']?.field || null,
    detailMode: (detail['mode'] as string) || null,
    detailStage: (detail['stage'] as string) || null,
    detailPosition: (detail['position'] as string) || null,
    detailParentOp: (detail['parentOp'] as string) || (detail['op'] as string) || 'sum',
    flipped: axis['flip'] === true,
    connect: spec.connect === 'across' ? 'across' : 'adjacent'
  };
}

/** Use one canonical direction for detail, flip, and observation membership changes. */
export function canonicalLineTransitionPair<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): CanonicalTransitionPair<S> {
  const previous = lineState(previousSpec, previousSpec.encoding as Record<string, ChannelSpec>);
  const next = lineState(nextSpec, nextSpec.encoding as Record<string, ChannelSpec>);
  const previousSeries = previous.detailMode === 'series' ||
    (previous.detailMode !== 'single' && Boolean(previous.seriesField));
  const nextSeries = next.detailMode === 'series' ||
    (next.detailMode !== 'single' && Boolean(next.seriesField));

  if (previousSeries !== nextSeries && previousSeries) {
    return { from: nextSpec, to: previousSpec, reverse: true };
  }
  if (previous.flipped && !next.flipped) {
    return { from: nextSpec, to: previousSpec, reverse: true };
  }

  const observation = lineObservationChange(previousSpec, nextSpec);
  if (observation?.mode === 'remove') {
    // Observation membership has one canonical direction: fewer -> more.
    // Removing or filtering observations therefore reads the exact same
    // compiled frames backward instead of running a separate exit animation.
    return { from: nextSpec, to: previousSpec, reverse: true };
  }
  return { from: previousSpec, to: nextSpec, reverse: false };
}

export interface LineObservationChange {
  mode: 'add' | 'remove' | 'add-and-remove';
  addedKeys: string[];
  removedKeys: string[];
}

/** Compare the visible keyed observations without confusing a filter with data deletion. */
export function lineObservationChange(
  previousSpec: ViewSpec,
  nextSpec: ViewSpec
): LineObservationChange | null {
  const previousKeys = visibleLineKeys(previousSpec);
  const nextKeys = visibleLineKeys(nextSpec);
  if (!previousKeys || !nextKeys) return null;

  const addedKeys = [...nextKeys].filter((key) => !previousKeys.has(key));
  const removedKeys = [...previousKeys].filter((key) => !nextKeys.has(key));
  if (addedKeys.length && !removedKeys.length) {
    return { mode: 'add', addedKeys, removedKeys: [] };
  }
  if (removedKeys.length && !addedKeys.length) {
    return { mode: 'remove', addedKeys: [], removedKeys };
  }
  if (addedKeys.length && removedKeys.length) {
    return { mode: 'add-and-remove', addedKeys, removedKeys };
  }
  return null;
}

function visibleLineKeys(spec: ViewSpec): Set<string> | null {
  const data = spec.data as { values?: unknown[] } | unknown[] | undefined;
  const source = Array.isArray(data) ? data : data?.values;
  if (!Array.isArray(source)) return null;

  // Membership canonicalisation is deliberately limited to row-preserving
  // pipelines. Aggregate/fold/bin change what an observation means.
  const transforms = spec.transform || [];
  if (transforms.some((transform) => {
    const value = transform as Record<string, unknown>;
    return 'aggregate' in value || 'fold' in value || 'bin' in value || 'timeUnit' in value;
  })) return null;

  let rows = source.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  for (const transform of transforms) {
    const filter = (transform as Record<string, unknown>)['filter'];
    if (filter != null) {
      const normalized = normalizeFilter(filter);
      rows = rows.filter((row) => matchesFilter(row, normalized));
    }
  }

  const key = linePointKeyAccessor(spec, spec.encoding?.x?.field || 'id');
  return new Set(rows.map((row, index) => String(key(row, index))));
}

/** Change the authored first axis, then the second, instead of replacing both at once. */
export function lineIntermediateSpecs<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): IntermediateSpec<S>[] {
  const detail = lineDetailIntermediateSpecs(previousSpec, nextSpec);
  if (detail.length) return detail;

  const next = lineState(nextSpec, nextSpec.encoding as Record<string, ChannelSpec>);
  if (!next.flipped) return [];
  const previousEncoding = previousSpec.encoding || {};
  const nextEncoding = nextSpec.encoding || {};
  const changed = ['x', 'y'].filter((part) =>
    JSON.stringify(previousEncoding[part]) !== JSON.stringify(nextEncoding[part]));
  if (changed.length < 2) return [];

  const state = specState(nextSpec);
  const axis = (state.sceneState as Record<string, unknown> | undefined)?.['axis'] as Record<string, unknown> | undefined ?? {};
  const order = normalizeAxisOrder(axis['order']);
  const first = order.find((part) => changed.includes(part)) || changed[0];
  const second = changed.find((part) => part !== first);
  if (!second) return [];

  const intermediate = cloneState(nextSpec);
  intermediate.encoding = {
    ...cloneState(nextEncoding),
    [second]: cloneState(previousEncoding[second])
  };
  return [{ spec: intermediate, scene: 'axis' }];
}

/**
 * A total-to-series change has two semantic waypoints:
 * total line -> complete series at the total positions -> reference preview
 * with series in their own positions -> series lines. Merge reuses those exact
 * frames backward, so the reference appears before either series starts to
 * move, the solid lines zip onto it, and the coincident paths collapse cleanly.
 */
function lineDetailIntermediateSpecs<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): IntermediateSpec<S>[] {
  const previous = lineState(previousSpec, previousSpec.encoding as Record<string, ChannelSpec>);
  const next = lineState(nextSpec, nextSpec.encoding as Record<string, ChannelSpec>);
  if (previous.detailMode !== 'single' || next.detailMode !== 'series') return [];

  return [
    {
      spec: withLineDetailStage(nextSpec, {
        stage: 'zipper-attractor',
        position: 'total',
        parentOp: previous.detailParentOp
      }),
      scene: 'detail'
    },
    {
      spec: withLineDetailStage(nextSpec, {
        stage: 'zipper-preview',
        position: 'series',
        parentOp: previous.detailParentOp
      }),
      scene: 'detail'
    }
  ];
}

function withLineDetailStage<S extends ViewSpec>(
  spec: S,
  patch: {
    stage: 'zipper-attractor' | 'zipper-preview';
    position: 'total' | 'series';
    parentOp: string;
  }
): S {
  return withSpecMeta(cloneState(spec), {
    state: { sceneState: { detail: patch } }
  }) as S;
}

/** Put every future series on its parent total without losing row identity. */
export function lineRowsAtTotal(
  rows: Record<string, unknown>[],
  xField: string | undefined,
  yField: string | undefined,
  op = 'sum'
): Record<string, unknown>[] {
  if (!xField || !yField) return rows;
  const groups = new Map<unknown, number[]>();
  rows.forEach((row) => {
    const value = Number(row[yField]);
    const values = groups.get(row[xField]) || [];
    if (Number.isFinite(value)) values.push(value);
    groups.set(row[xField], values);
  });
  return rows.map((row) => ({
    ...row,
    [yField]: aggregateLineValues(groups.get(row[xField]) || [], op),
    __row: row
  }));
}

function aggregateLineValues(values: number[], op: string): number {
  if (op === 'count') return values.length;
  if (!values.length) return 0;
  if (op === 'mean') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (op === 'min') return Math.min(...values);
  if (op === 'max') return Math.max(...values);
  if (op === 'median') {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

export function lineSeries(rows: Record<string, unknown>[], seriesField: string | null): LineSeries[] {
  if (!seriesField) return [{ key: '__line', rows }];

  const grouped = new Map<string, Record<string, unknown>[]>();
  rows.forEach((row) => {
    const key = String(row[seriesField] ?? '__missing');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  });

  return Array.from(grouped, ([key, values]) => ({ key, rows: values }));
}

/**
 * Preserve gaps created by `.where()` unless the author explicitly asks to
 * connect across removed observations. The first run keeps the series key so
 * it updates the existing path; later runs enter as additional path pieces.
 */
export function connectedLineStretches(
  rows: Record<string, unknown>[],
  lineageRows: Record<string, unknown>[],
  seriesField: string | null,
  pointKey: (row: Record<string, unknown>, index: number) => string | number,
  selection: SelectionSpec | null,
  connect: 'adjacent' | 'across' = 'adjacent',
  filtersRows = Boolean(selection?.filter) && selection?.mode !== 'focus' && selection?.mode !== 'highlight'
): LineSeries[] {
  const series = lineSeries(rows, seriesField);
  const lineageBySeries = new Map(
    lineSeries(lineageRows, seriesField).map((entry) => [entry.key, entry.rows])
  );

  return series.flatMap((entry) => {
    const preserveLineage = connect === 'adjacent' && filtersRows && rows.length !== lineageRows.length;
    const lineage = preserveLineage
      ? lineageBySeries.get(entry.key) || entry.rows
      : entry.rows;
    const stretches = connectedStretches(
      entry.rows,
      lineage,
      (row, index) => String(pointKey(row, index))
    );

    return stretches.map((stretch, index) => ({
      // A filtered run is a new visible piece of the original path. Keeping it
      // separate lets the intact source path fade while the honest gaps appear,
      // instead of folding the source geometry into the first surviving run.
      key: preserveLineage
        ? `${entry.key}::filtered-stretch:${index}:${String(pointKey(stretch[0], 0))}`
        : entry.key,
      rows: stretch
    }));
  });
}

function normalizeAxisOrder(value: unknown): string[] {
  const order = Array.isArray(value) ? value.map(String) : [];
  return [...new Set([...order, 'x', 'y'])].filter((part) => part === 'x' || part === 'y');
}
