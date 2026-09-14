import type { CanonicalTransitionPair, ChannelSpec, SelectionSpec, ViewSpec } from '../../types/index.js';
import { matchesFilter, normalizeFilter } from '../../data/filter.js';
import { specState } from '../../spec-meta.js';
import { specObjectKey } from '../../spec-meta.js';
import { connectedStretches } from '../continuity.js';
import { matchesSelection, viewHighlight, viewSelection } from '../../focus.js';

export interface AreaSceneState {
  selection: SelectionSpec | null;
  highlight: SelectionSpec | null;
  mode: 'single' | 'stacked';
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
    mode,
    seriesField: mode === 'stacked'
      ? String(detail?.['seriesField'] || enc['color']?.field || '') || null
      : null,
    baseline: Number.isFinite(baseline) ? baseline : 0,
    connect: spec.connect === 'across' ? 'across' : 'adjacent'
  };
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
