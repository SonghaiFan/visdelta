import type { ViewSpec } from '../../types/index.js';
import { keyAccessor } from '../../identity/semantic-key.js';
import { specState } from '../../spec-meta.js';

type KeyFn = (d: Record<string, unknown>, i: number) => string | number;

export function pointKeyAccessor(spec: ViewSpec, fallbackField = 'id'): KeyFn {
  const rawKey = keyAccessor(spec, fallbackField);
  const mode = (specState(spec).sceneState as Record<string, unknown> | undefined)?.['detail'] as Record<string, unknown> | undefined;
  const detailMode = mode?.['mode'] as string | undefined;
  if (!detailMode) return rawKey;
  return (row: Record<string, unknown>, index: number) =>
    `${detailMode}:${rawKey(row, index)}`;
}

export function pointStoredKey(
  datum: Record<string, unknown>,
  index: number,
  key: KeyFn
): string | number {
  return (datum['__visDeltaPointJoinKey'] as string | number) || key(datum, index);
}

/** A selection whose datum-valued attrs and each() identify a point. */
interface IdentityTarget<D extends Record<string, unknown>> {
  each(fn: (this: Element, d: D, i: number) => void): this;
  attr(name: string, value: (this: Element, d: D, i: number) => string | number): this;
}

export function applyPointIdentity<D extends Record<string, unknown>, T extends IdentityTarget<D>>(
  selection: T,
  key: KeyFn
): T {
  return selection
    .each(function(d, i) {
      (d as Record<string, unknown>)['__visDeltaPointJoinKey'] = key(d, i);
    })
    .attr('data-key', (d, i) => key(d, i));
}
