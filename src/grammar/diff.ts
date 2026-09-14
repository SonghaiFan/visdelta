import { specObjectKey, specSemanticKey, specState } from '../spec-meta.js';
import type {
  Delta,
  DeltaAction,
  DiffResult,
  EncodingSpec,
  FilterSpec,
  DetailSpec,
  ChartChangeState,
  SemanticDiffResult,
  SemanticViewState,
  ViewSpec
} from '../types/index.js';

export function diffViewStates(
  previous: ViewSpec | { toSpec(): ViewSpec } | null | undefined,
  next: ViewSpec | { toSpec(): ViewSpec } | null | undefined
): DiffResult {
  const prev = toComparableSpec(previous);
  const curr = toComparableSpec(next);
  const changed: string[] = [];

  if (!sameValue(prev.mark, curr.mark)) changed.push('mark');
  if (!sameValue(prev.data, curr.data)) changed.push('data');
  if (!sameValue(prev.key, curr.key)) changed.push('key');
  if (!sameValue(prev.transform, curr.transform)) changed.push('transform');
  if (!sameValue(prev.filter, curr.filter)) changed.push('filter');
  for (const channel of encodingChannels(prev, curr)) {
    if (!sameValue(prev.encoding?.[channel], curr.encoding?.[channel])) changed.push(`encoding.${channel}`);
  }
  if (!sameValue(prev.axis, curr.axis)) changed.push('axis');
  if (!sameValue(prev.detail, curr.detail)) changed.push('detail');

  const semantic = diffSemanticViewStates(prev, curr);

  return {
    changed,
    has: (key) => changed.includes(key),
    deltas: semantic.deltas,
    delta: <T = unknown>(type: string) =>
      (semantic.deltas.find((d) => d.type === type) ?? null) as Delta<T> | null,
    hasDelta: (type, action = null) =>
      semantic.deltas.some((d) => d.type === type && (action == null || d.action === action)),
    semantic,
    previous: semantic.previous,
    next: semantic.next
  };
}

function toComparableSpec(
  value: ViewSpec | { toSpec(): ViewSpec } | null | undefined
): ViewSpec {
  if (!value) return {};
  return typeof (value as { toSpec?(): ViewSpec }).toSpec === 'function'
    ? (value as { toSpec(): ViewSpec }).toSpec()
    : (value as ViewSpec);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));
}

function canonicalValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonicalValue(item)]));
}

function encodingChannels(a: ViewSpec, b: ViewSpec): string[] {
  return [...new Set([...Object.keys(a.encoding ?? {}), ...Object.keys(b.encoding ?? {})])].sort();
}

export function diffSemanticViewStates(
  previous: ViewSpec = {},
  next: ViewSpec = {}
): SemanticDiffResult {
  const prev = toSemanticState(previous);
  const curr = toSemanticState(next);
  const deltas: Delta[] = [];

  pushDelta(deltas, 'mark', prev.mark, curr.mark);
  pushDelta(deltas, 'data', previous.data, next.data);
  pushDelta(deltas, 'key', prev.key, curr.key);
  pushDelta(deltas, 'semantic-key', prev.semanticKey, curr.semanticKey);
  pushCollectionDelta(deltas, 'filter', prev.filters, curr.filters);
  pushDelta(deltas, 'transform', prev.nonFilterTransforms, curr.nonFilterTransforms);
  for (const channel of encodingChannels(previous, next)) {
    pushDelta(deltas, `encoding.${channel}`, prev.encoding[channel], curr.encoding[channel]);
  }
  pushStateDelta(deltas, 'selection', prev.selection, curr.selection);
  pushStateDelta(deltas, 'focus', prev.scopes.focus, curr.scopes.focus);
  pushStateDelta(deltas, 'highlight', prev.scopes.highlight, curr.scopes.highlight);
  pushStateDelta(deltas, 'axis', prev.axis, curr.axis);
  pushStateDelta(deltas, 'detail', prev.detail, curr.detail);

  return {
    previous: prev,
    next: curr,
    deltas,
    has: (type, action = null) =>
      deltas.some((d) => d.type === type && (action == null || d.action === action)),
    get: <T = unknown>(type: string) =>
      (deltas.find((d) => d.type === type) ?? null) as Delta<T> | null
  };
}

function toSemanticState(spec: ViewSpec): SemanticViewState {
  const stateFields = specState(spec);
  const sceneState: ChartChangeState = stateFields.sceneState ?? {};
  const transforms = (spec.transform ?? []) as Array<Record<string, unknown>>;

  const state: SemanticViewState = {
    mark: spec.mark ?? null,
    key: specObjectKey(spec),
    semanticKey: specSemanticKey(spec),
    encoding: (spec.encoding ?? {}) as EncodingSpec,
    filters: [
      ...(spec.filter ? [spec.filter as FilterSpec] : []),
      ...transforms.filter((t) => t.filter).map((t) => t.filter as FilterSpec)
    ],
    nonFilterTransforms: transforms.filter((t) => !t.filter),
    selection: sceneState.selection ?? stateFields.selection ?? null,
    scopes: stateFields.scopes ?? {},
    axis: sceneState.axis ?? stateFields.axis ?? null,
    detail: (sceneState.detail ?? stateFields.detail ?? null) as DetailSpec | null
  };

  return state;
}

export function pushStateDelta<T>(
  deltas: Delta[],
  type: string,
  previous: T | null | undefined,
  next: T | null | undefined
): void {
  if (sameValue(previous, next)) return;
  deltas.push({ type, action: deltaAction(previous, next), previous: previous ?? null, next: next ?? null });
}

export function pushDelta<T>(
  deltas: Delta[],
  type: string,
  previous: T | null | undefined,
  next: T | null | undefined
): void {
  if (sameValue(previous, next)) return;
  deltas.push({ type, action: 'change', previous: previous ?? null, next: next ?? null });
}

function pushCollectionDelta(
  deltas: Delta[],
  type: string,
  previous: unknown[] = [],
  next: unknown[] = []
): void {
  if (sameValue(previous, next)) return;
  deltas.push({ type, action: collectionDeltaAction(previous, next), previous, next });
}

function deltaAction(previous: unknown, next: unknown): DeltaAction {
  if (previous == null && next != null) return 'add';
  if (previous != null && next == null) return 'remove';
  return 'change';
}

function collectionDeltaAction(previous: unknown[], next: unknown[]): DeltaAction {
  if (!previous.length && next.length) return 'add';
  if (previous.length && !next.length) return 'remove';
  return 'change';
}
