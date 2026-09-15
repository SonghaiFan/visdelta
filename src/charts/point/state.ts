import type { CanonicalTransitionPair, ChannelSpec, D3Lib, EncodingSpec, IntermediateSpec, ViewSpec } from '../../types/index.js';
import { cloneState } from '../../grammar/view-state.js';
import { specState, withSpecMeta } from '../../spec-meta.js';
import { colorField } from './encoding.js';

export interface PointState {
  parentField: string | string[] | null;
  detailMode: string | null;
  effect: string | null;
  view: PointScaleView | null;
}

export interface PointScaleView {
  encoding?: EncodingSpec;
  transform?: ViewSpec['transform'];
}

interface ParentAnchor {
  x: number;
  y: number;
}

interface DodgeCircle {
  x: number;
  y: number;
  data: Record<string, unknown>;
  next?: DodgeCircle;
}

export function pointState(spec: ViewSpec = {}, enc: EncodingSpec = {}): PointState {
  const state = specState(spec);
  const detail = ((state.sceneState as Record<string, unknown> | undefined)?.['detail'] as Record<string, unknown> | undefined)
    || (state.detail as Record<string, unknown> | undefined)
    || {};
  return {
    parentField: parentFromGroupby(detail['groupby'] as string[] | null) || (detail['parentField'] as string | null) || colorField(enc),
    detailMode: (detail['mode'] as string) || null,
    effect: (detail['effect'] as string) || null,
    view: (detail['view'] as PointScaleView | undefined) || null
  };
}

/** Compile summary/detail as one reversible path: summary -> detail. */
export function canonicalPointTransitionPair<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): CanonicalTransitionPair<S> {
  const previousGroup = aggregateGroup(previousSpec);
  const nextGroup = aggregateGroup(nextSpec);
  const previousIsSummary = previousGroup.length > 0;
  const nextIsSummary = nextGroup.length > 0;

  if (previousIsSummary !== nextIsSummary && previousIsSummary) {
    return {
      from: previousSpec,
      to: withParentField(nextSpec, previousGroup),
      reverse: false
    };
  }

  if (previousIsSummary !== nextIsSummary) {
    return {
      from: nextSpec,
      to: withParentField(previousSpec, nextGroup),
      reverse: true
    };
  }

  // A state produced by flip() is the canonical destination. Re-authoring the
  // same pair in the opposite direction therefore evaluates that path at 1-p.
  const previousFlip = pointAxisState(previousSpec)?.['flip'] === true;
  const nextFlip = pointAxisState(nextSpec)?.['flip'] === true;
  if (previousFlip && !nextFlip) {
    return { from: nextSpec, to: previousSpec, reverse: true };
  }

  return { from: previousSpec, to: nextSpec, reverse: false };
}

/** Split a point flip into the authored first axis and then the second axis. */
export function pointIntermediateSpecs<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): IntermediateSpec<S>[] {
  const previousIsSummary = aggregateGroup(previousSpec).length > 0;
  const nextIsSummary = aggregateGroup(nextSpec).length > 0;
  if (previousIsSummary && !nextIsSummary) {
    return [{ spec: pointSummaryAtDetailView(previousSpec, nextSpec), scene: 'detail' }];
  }

  const axis = pointAxisState(nextSpec);
  if (!axis?.['flip']) return [];
  const previousEncoding = previousSpec.encoding || {};
  const nextEncoding = nextSpec.encoding || {};
  const changed = ['x', 'y'].filter((part) =>
    JSON.stringify(previousEncoding[part]) !== JSON.stringify(nextEncoding[part]));
  if (changed.length < 2) return [];

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

/** Keep summary marks, but set their axes and scale to the detail view. */
function pointSummaryAtDetailView<S extends ViewSpec>(summarySpec: S, detailSpec: S): S {
  return withSpecMeta(cloneState(summarySpec), {
    state: {
      sceneState: {
        detail: {
          ...pointDetailState(summarySpec),
          step: 'set-view',
          view: {
            encoding: cloneState(detailSpec.encoding || {}),
            transform: cloneState(detailSpec.transform || [])
          }
        }
      }
    }
  }) as S;
}

export function parentAnchors(
  rows: Record<string, unknown>[],
  parentField: string | string[] | null,
  positionForRow: (row: Record<string, unknown>) => { x: number; y: number }
): Map<string, ParentAnchor> {
  const grouped = new Map<string, { x: number; y: number; count: number }>();
  rows.forEach((row) => {
    const key = parentKey(row, parentField);
    const point = positionForRow(row);
    if (!grouped.has(key)) grouped.set(key, { x: 0, y: 0, count: 0 });
    const anchor = grouped.get(key)!;
    anchor.x += point.x;
    anchor.y += point.y;
    anchor.count += 1;
  });

  return new Map(
    Array.from(grouped, ([key, anchor]) => [
      key,
      { x: anchor.x / anchor.count, y: anchor.y / anchor.count }
    ])
  );
}

export function parentKey(row: Record<string, unknown>, parentField: string | string[] | null): string {
  if (!row || !parentField) return '__all';
  if (Array.isArray(parentField)) return parentField.map((field) => row[field]).join('|');
  return String(row[parentField] ?? '__all');
}

export function radiusScale(
  rows: Record<string, unknown>[],
  channel: ChannelSpec | null | undefined,
  fallback: number,
  d3: D3Lib,
  quantitativeDomain: (rows: Record<string, unknown>[], channel: ChannelSpec, floor?: number) => number[]
): (row: Record<string, unknown>) => number {
  const field = channel?.field;
  if (!field) return () => fallback;
  const range = (channel as Record<string, unknown>)['range'] as [number, number] || defaultRadiusRange(rows.length);
  const scale = d3.scaleSqrt().domain(quantitativeDomain(rows, channel, 0)).range(range);
  return (row: Record<string, unknown>) => scale(Number(row[field]) || 0);
}

export function defaultPointRadius(count: number): number {
  if (count <= 4) return 9;
  if (count <= 12) return 7;
  if (count <= 60) return 5.5;
  return 4.5;
}

function defaultRadiusRange(count: number): [number, number] {
  const radius = defaultPointRadius(count);
  return [Math.max(3, radius * 0.75), Math.max(7, radius * 2.4)];
}

function parentFromGroupby(groupby: string[] | null): string | string[] | null {
  if (!groupby) return null;
  if (Array.isArray(groupby)) return groupby.length === 1 ? groupby[0] : groupby;
  return groupby;
}

function aggregateGroup(spec: ViewSpec): string[] {
  const detail = pointDetailState(spec);
  if (detail?.['mode'] !== 'aggregate') return [];
  const groupby = detail['groupby'];
  if (Array.isArray(groupby)) return groupby.filter(Boolean).map(String);
  return groupby ? [String(groupby)] : [];
}

function withParentField<S extends ViewSpec>(spec: S, groupby: string[]): S {
  const parentField = groupby.length === 1 ? groupby[0] : groupby;
  return withSpecMeta(cloneState(spec), {
    state: {
      sceneState: {
        detail: {
          ...pointDetailState(spec),
          mode: 'detail',
          parentField
        }
      }
    }
  }) as S;
}

function pointAxisState(spec: ViewSpec): Record<string, unknown> | null {
  const state = specState(spec);
  return ((state.sceneState as Record<string, unknown> | undefined)?.['axis'] as Record<string, unknown> | undefined)
    || (state.axis as Record<string, unknown> | undefined)
    || null;
}

function pointDetailState(spec: ViewSpec): Record<string, unknown> {
  const state = specState(spec);
  return ((state.sceneState as Record<string, unknown> | undefined)?.['detail'] as Record<string, unknown> | undefined)
    || (state.detail as Record<string, unknown> | undefined)
    || {};
}

function normalizeAxisOrder(value: unknown): string[] {
  const order = Array.isArray(value) ? value.map(String) : [];
  return [...new Set([...order, 'x', 'y'])].filter((part) => part === 'x' || part === 'y');
}
