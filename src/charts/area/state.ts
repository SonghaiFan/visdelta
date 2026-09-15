import type { CanonicalTransitionPair, ChannelSpec, SelectionSpec, ViewSpec } from '../../types/index.js';
import { hasRowFilter, matchesFilter, normalizeFilter } from '../../data/filter.js';
import { specState } from '../../spec-meta.js';
import { specObjectKey } from '../../spec-meta.js';
import { connectedStretches } from '../continuity.js';
import { matchesSelection, viewHighlight, viewSelection } from '../../focus.js';
import type { AreaStackOffset, AreaStackOrder } from './authoring.js';

export interface AreaSceneState {
  selection: SelectionSpec | null;
  highlight: SelectionSpec | null;
  filtersRows: boolean;
  mode: 'single' | 'stacked';
  layout: 'stacked' | 'stream';
  stackOffset: AreaStackOffset;
  stackOrder: AreaStackOrder;
  seriesField: string | null;
  baseline: number;
  connect: 'adjacent' | 'across';
}

export interface AreaPoint {
  key: string;
  row: Record<string, unknown>;
  x: unknown;
  y0: number;
  y1: number;
}

export interface AreaLayer {
  key: string;
  value: unknown;
  rows: Record<string, unknown>[];
  points: AreaPoint[];
}

export interface AreaCell {
  key: string;
  observationKey: string;
  layerKey: string;
  value: unknown;
  row: Record<string, unknown>;
  layer: AreaLayer;
  left: AreaPoint | null;
  center: AreaPoint;
  right: AreaPoint | null;
}

export function areaState(spec: ViewSpec, enc: Record<string, ChannelSpec> = {}): AreaSceneState {
  const state = specState(spec);
  const scene = state.sceneState as Record<string, unknown> | undefined;
  const detail = scene?.['detail'] as Record<string, unknown> | undefined;
  const mode = detail?.['mode'] === 'stacked' ? 'stacked' : 'single';
  const baseline = Number(spec.baseline ?? 0);
  return {
    selection: viewSelection(spec),
    highlight: viewHighlight(spec),
    filtersRows: hasRowFilter(spec),
    mode,
    layout: mode === 'stacked' && detail?.['layout'] === 'stream' ? 'stream' : 'stacked',
    stackOffset: streamOffset(detail?.['offset']),
    stackOrder: streamOrder(detail?.['order']),
    seriesField: mode === 'stacked'
      ? String(detail?.['seriesField'] || enc['color']?.field || '') || null
      : null,
    baseline: Number.isFinite(baseline) ? baseline : 0,
    connect: spec.connect === 'across' ? 'across' : 'adjacent'
  };
}

function streamOffset(value: unknown): AreaStackOffset {
  return value === 'none' || value === 'expand' || value === 'diverging' || value === 'silhouette'
    ? value
    : 'wiggle';
}

function streamOrder(value: unknown): AreaStackOrder {
  return value === 'none' || value === 'reverse' || value === 'appearance' ||
    value === 'ascending' || value === 'descending'
    ? value
    : 'insideOut';
}

/** Turn rows into explicit lower/upper boundaries owned by the Area module. */
export function areaLayers(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  state: AreaSceneState,
  key: (row: Record<string, unknown>, index: number) => string = (row, index) => pointKey(row[xField], index)
): AreaLayer[] {
  if (state.mode !== 'stacked' || !state.seriesField) {
    return [{
      key: '__area__',
      value: null,
      rows,
      points: rows.map((row, index) => ({
        key: key(row, index), row, x: row[xField],
        y0: state.baseline, y1: number(row[yField])
      }))
    }];
  }

  if (state.layout === 'stream') {
    return streamAreaLayers(
      rows, xField, yField, state.seriesField,
      state.stackOffset ?? 'wiggle', state.stackOrder ?? 'insideOut', key
    );
  }

  const xValues = unique(rows.map((row) => row[xField]));
  const seriesValues = unique(rows.map((row) => row[state.seriesField!]));
  const byCell = new Map(rows.map((row) => [cellKey(row[xField], row[state.seriesField!]), row]));
  const positive = new Map(xValues.map((value) => [String(value), state.baseline]));
  const negative = new Map(xValues.map((value) => [String(value), state.baseline]));

  return seriesValues.map((seriesValue) => {
    const points = xValues.map((xValue, index) => {
      const original = byCell.get(cellKey(xValue, seriesValue));
      const row = original || { [xField]: xValue, [state.seriesField!]: seriesValue, [yField]: 0 };
      const value = number(row[yField]);
      const xKey = String(xValue);
      const y0 = value >= 0 ? positive.get(xKey)! : negative.get(xKey)!;
      const y1 = y0 + value;
      if (value >= 0) positive.set(xKey, y1);
      else negative.set(xKey, y1);
      return { key: key(row, index), row, x: xValue, y0, y1 };
    });
    return {
      key: String(seriesValue),
      value: seriesValue,
      rows: points.map((point) => point.row),
      points
    };
  });
}

/** D3-compatible stack geometry for the Area stream layout. */
function streamAreaLayers(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  seriesField: string,
  offset: AreaStackOffset,
  orderName: AreaStackOrder,
  key: (row: Record<string, unknown>, index: number) => string
): AreaLayer[] {
  const xValues = unique(rows.map((row) => row[xField]));
  const seriesValues = unique(rows.map((row) => row[seriesField]));
  const byCell = new Map(rows.map((row) => [cellKey(row[xField], row[seriesField]), row]));
  const stack = seriesValues.map((seriesValue) => xValues.map((xValue) => {
    const row = byCell.get(cellKey(xValue, seriesValue));
    return [0, number(row?.[yField])];
  }));
  const order = stackOrder(stack, orderName);
  stackOffset(stack, order, offset);

  return seriesValues.map((seriesValue, seriesIndex) => {
    const points = xValues.map((xValue, xIndex) => {
      const original = byCell.get(cellKey(xValue, seriesValue));
      const row = original || { [xField]: xValue, [seriesField]: seriesValue, [yField]: 0 };
      return {
        key: key(row, xIndex),
        row,
        x: xValue,
        y0: stack[seriesIndex][xIndex][0],
        y1: stack[seriesIndex][xIndex][1]
      };
    });
    return {
      key: String(seriesValue),
      value: seriesValue,
      rows: points.map((point) => point.row),
      points
    };
  });
}

function stackOrder(series: number[][][], order: AreaStackOrder): number[] {
  const indexes = series.map((_values, index) => index);
  if (order === 'none') return indexes;
  if (order === 'reverse') return indexes.reverse();
  if (order === 'appearance' || order === 'insideOut') {
    const appearance = appearanceOrder(series);
    if (order === 'appearance') return appearance;
    return insideOutOrder(series, appearance);
  }
  const sums = series.map(seriesSum);
  const ascending = indexes.sort((a, b) => sums[a] - sums[b]);
  return order === 'ascending' ? ascending : ascending.reverse();
}

function appearanceOrder(series: number[][][]): number[] {
  return series.map((values, index) => ({
    index,
    peak: values.reduce(
      (best, point, pointIndex) => point[1] > best.value ? { value: point[1], index: pointIndex } : best,
      { value: -Infinity, index: 0 }
    ).index
  })).sort((a, b) => a.peak - b.peak).map(({ index }) => index);
}

function seriesSum(values: number[][]): number {
  return values.reduce((sum, point) => point[1] ? sum + point[1] : sum, 0);
}

function insideOutOrder(series: number[][][], appearance = appearanceOrder(series)): number[] {
  const sums = series.map((values) => values.reduce((sum, point) => sum + point[1], 0));
  let top = 0;
  let bottom = 0;
  const tops: number[] = [];
  const bottoms: number[] = [];
  appearance.forEach((index) => {
    if (top < bottom) {
      top += sums[index];
      tops.push(index);
    } else {
      bottom += sums[index];
      bottoms.push(index);
    }
  });
  return bottoms.reverse().concat(tops);
}

function stackOffset(series: number[][][], order: number[], offset: AreaStackOffset): void {
  if (offset === 'none') return stackOffsetNone(series, order);
  if (offset === 'expand') return stackOffsetExpand(series, order);
  if (offset === 'diverging') return stackOffsetDiverging(series, order);
  if (offset === 'silhouette') return stackOffsetSilhouette(series, order);
  stackOffsetWiggle(series, order);
}

function stackOffsetNone(series: number[][][], order: number[]): void {
  if (series.length < 2 || !order.length) return;
  for (let orderIndex = 1; orderIndex < order.length; orderIndex += 1) {
    const lower = series[order[orderIndex - 1]];
    const current = series[order[orderIndex]];
    current.forEach((point, xIndex) => {
      point[0] = Number.isNaN(lower[xIndex][1]) ? lower[xIndex][0] : lower[xIndex][1];
      point[1] += point[0];
    });
  }
}

function stackOffsetExpand(series: number[][][], order: number[]): void {
  if (!series.length) return;
  const width = series[0].length;
  for (let xIndex = 0; xIndex < width; xIndex += 1) {
    const total = series.reduce((sum, values) => sum + (values[xIndex][1] || 0), 0);
    if (total) series.forEach((values) => { values[xIndex][1] /= total; });
  }
  stackOffsetNone(series, order);
}

function stackOffsetDiverging(series: number[][][], order: number[]): void {
  if (!series.length || !order.length) return;
  const width = series[order[0]].length;
  for (let xIndex = 0; xIndex < width; xIndex += 1) {
    let positive = 0;
    let negative = 0;
    order.forEach((seriesIndex) => {
      const point = series[seriesIndex][xIndex];
      const value = point[1] - point[0];
      if (value > 0) {
        point[0] = positive;
        point[1] = positive += value;
      } else if (value < 0) {
        point[1] = negative;
        point[0] = negative += value;
      } else {
        point[0] = 0;
        point[1] = value;
      }
    });
  }
}

function stackOffsetSilhouette(series: number[][][], order: number[]): void {
  if (!series.length || !order.length) return;
  const first = series[order[0]];
  first.forEach((point, xIndex) => {
    const total = series.reduce((sum, values) => sum + (values[xIndex][1] || 0), 0);
    point[0] = -total / 2;
    point[1] += point[0];
  });
  stackOffsetNone(series, order);
}

function stackOffsetWiggle(series: number[][][], order: number[]): void {
  const first = series[order[0]];
  if (!first?.length) return;
  let baseline = 0;
  for (let xIndex = 1; xIndex < first.length; xIndex += 1) {
    let total = 0;
    let weightedSlope = 0;
    order.forEach((seriesIndex, orderIndex) => {
      const current = series[seriesIndex][xIndex][1] || 0;
      const previous = series[seriesIndex][xIndex - 1][1] || 0;
      let slope = (current - previous) / 2;
      for (let lower = 0; lower < orderIndex; lower += 1) {
        const lowerSeries = series[order[lower]];
        slope += (lowerSeries[xIndex][1] || 0) - (lowerSeries[xIndex - 1][1] || 0);
      }
      total += current;
      weightedSlope += slope * current;
    });
    first[xIndex - 1][0] = baseline;
    first[xIndex - 1][1] += baseline;
    if (total) baseline -= weightedSlope / total;
  }
  first[first.length - 1][0] = baseline;
  first[first.length - 1][1] += baseline;

  stackOffsetNone(series, order);
}

/**
 * Give each observation its own Area cell. Interior cells own half of the
 * interval on either side; the first and last own only the available half.
 * A filtered chart can use the full lineage for honest gaps, while
 * `.connect("across")` passes the surviving layer as its own lineage.
 */
export function areaCells(layers: AreaLayer[], lineageLayers: AreaLayer[]): AreaCell[] {
  const lineageByLayer = new Map(lineageLayers.map((layer) => [layer.key, layer]));
  return layers.flatMap((layer) => {
    const lineage = lineageByLayer.get(layer.key)?.points || layer.points;
    // One isolated ordinal observation has no connected interval to fill.
    return connectedStretches(layer.points, lineage, (point) => point.key).flatMap((points) =>
      points.map((point, index) => ({
        // Run membership changes as observations enter or leave, but the
        // observation cell itself keeps the same identity across frames.
        key: `${layer.key}::cell:${point.key}`,
        observationKey: point.key,
        layerKey: layer.key,
        value: layer.value,
        row: point.row,
        layer,
        left: index > 0 ? points[index - 1] : null,
        center: point,
        right: index < points.length - 1 ? points[index + 1] : null
      }))
    );
  });
}

export function areaPointKeyAccessor(
  spec: ViewSpec,
  fallbackField: string
): (row: Record<string, unknown>, index: number) => string {
  const configured = (spec as ViewSpec & { key?: string | string[] }).key || specObjectKey(spec) || fallbackField;
  const fields = Array.isArray(configured) ? configured : [configured];
  return (row, index) => fields.length
    ? fields.map((field) => String(row[String(field)] ?? '')).join('\u0000')
    : String(index);
}

export function areaSelectionOpacity(
  layer: AreaLayer,
  selection: SelectionSpec | null,
  dimOpacity = 0.22
): number {
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return layer.rows.some((row) => matchesSelection(row, selection))
    ? 1
    : Number(selection.opacity ?? dimOpacity);
}

/** Detail and observation membership each have one canonical direction. */
export function canonicalAreaTransitionPair<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): CanonicalTransitionPair<S> {
  const previous = areaState(previousSpec, previousSpec.encoding as Record<string, ChannelSpec>);
  const next = areaState(nextSpec, nextSpec.encoding as Record<string, ChannelSpec>);
  if (previous.mode === 'stacked' && next.mode === 'stacked') {
    const previousStack = stackGeometrySignature(previous);
    const nextStack = stackGeometrySignature(next);
    if (previousStack !== nextStack) {
      return previousStack > nextStack
        ? { from: nextSpec, to: previousSpec, reverse: true }
        : { from: previousSpec, to: nextSpec, reverse: false };
    }
  }
  if (previous.mode === 'stacked' && next.mode === 'single') {
    return { from: nextSpec, to: previousSpec, reverse: true };
  }
  const observation = areaObservationChange(previousSpec, nextSpec);
  if (observation?.mode === 'remove') {
    // Filter/remove is the exact reverse of restore/add: fewer -> more.
    return { from: nextSpec, to: previousSpec, reverse: true };
  }
  return { from: previousSpec, to: nextSpec, reverse: false };
}

function stackGeometrySignature(state: AreaSceneState): string {
  return state.layout === 'stream'
    ? `stream:${state.stackOffset}:${state.stackOrder}`
    : 'stacked';
}

export interface AreaObservationChange {
  mode: 'add' | 'remove' | 'add-and-remove';
  addedKeys: string[];
  removedKeys: string[];
}

/** Compare visible keyed rows while leaving aggregate topology to detail. */
export function areaObservationChange(
  previousSpec: ViewSpec,
  nextSpec: ViewSpec
): AreaObservationChange | null {
  const previousKeys = visibleAreaKeys(previousSpec);
  const nextKeys = visibleAreaKeys(nextSpec);
  if (!previousKeys || !nextKeys) return null;

  const addedKeys = [...nextKeys].filter((key) => !previousKeys.has(key));
  const removedKeys = [...previousKeys].filter((key) => !nextKeys.has(key));
  if (addedKeys.length && !removedKeys.length) return { mode: 'add', addedKeys, removedKeys: [] };
  if (removedKeys.length && !addedKeys.length) return { mode: 'remove', addedKeys: [], removedKeys };
  if (addedKeys.length && removedKeys.length) return { mode: 'add-and-remove', addedKeys, removedKeys };
  return null;
}

function visibleAreaKeys(spec: ViewSpec): Set<string> | null {
  const data = spec.data as { values?: unknown[] } | unknown[] | undefined;
  const source = Array.isArray(data) ? data : data?.values;
  if (!Array.isArray(source)) return null;

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

  const key = areaPointKeyAccessor(spec, spec.encoding?.x?.field || 'id');
  return new Set(rows.map((row, index) => String(key(row, index))));
}

function number(value: unknown): number {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
}

function unique(values: unknown[]): unknown[] {
  return [...new Map(values.map((value) => [String(value), value])).values()];
}

function pointKey(value: unknown, index: number): string {
  return value == null ? String(index) : String(value);
}

function cellKey(x: unknown, series: unknown): string {
  return `${String(x)}\u0000${String(series)}`;
}
