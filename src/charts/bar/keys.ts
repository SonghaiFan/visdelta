import { keyAccessor, semanticKeyForDatum, semanticMeasureForDatum } from '../../identity/semantic-key.js';
import { specSemanticKey } from '../../spec-meta.js';
import type { ChartContext, DataRow, ViewSpec } from '../../types/index.js';

type KeyFn = (this: Element, d: DataRow, i: number) => string | number;

export function barKeyAccessor(
  chart: ChartContext,
  spec: ViewSpec,
  fallbackField: string | string[] = 'id'
): KeyFn {
  const fallback = keyAccessor(spec, fallbackField) as KeyFn;
  const matchPlan = chart.transitionPlan?.match as
    | { mode?: string }
    | undefined;

  if (matchPlan?.mode !== 'semantic' || !specSemanticKey(spec)) {
    return fallback;
  }

  return function semanticJoinKey(this: Element, d: DataRow, i: number): string | number {
    const el = this as Element & { dataset?: DOMStringMap };
    if (el.dataset?.semanticKey) return el.dataset.semanticKey;
    return (semanticKeyForDatum(d, spec) as string | null) ?? fallback.call(this, d, i);
  };
}

/** A selection or recorded motion whose datum-valued attrs identify a bar. */
interface IdentityTarget<D extends DataRow> {
  attr(name: string, value: (this: Element, d: D, i: number) => string | number | null): this;
}

export function applyBarIdentity<D extends DataRow, T extends IdentityTarget<D>>(
  selection: T,
  spec: ViewSpec,
  key: KeyFn,
  categoryValue: (d: D) => unknown
): T {
  return selection
    .attr('data-key', function (this: Element, d: D, i: number) {
      return key.call(this, d, i);
    })
    .attr('data-category', (d) => attrText(categoryValue(d)))
    .attr('data-measure', (d) => attrText(semanticMeasureForDatum(d, spec)))
    .attr('data-semantic-key', (d) => semanticKeyForDatum(d, spec));
}

function attrText(value: unknown): string | null {
  return value == null ? null : String(value);
}
