import { specObjectKey } from '../spec-meta.js';
import type { DataRow, ViewSpec } from '../types/index.js';

export type MarkKeySpec = string | string[];

export interface MarkIdentity {
  fields: string[];
  source: 'explicit' | 'chart-default';
}

export interface MarkMatch {
  key: string;
  fromIndex: number;
  toIndex: number;
}

export interface MarkEndpoint {
  key: string;
  index: number;
}

/** One-to-one visual-object correspondence. Structural lineage is separate. */
export interface MarkCorrespondence {
  identity: MarkIdentity | null;
  updates: MarkMatch[];
  enter: MarkEndpoint[];
  exit: MarkEndpoint[];
  stable: boolean;
  reasons: string[];
}

/** Explicit `.key()` overrides the chart's declared default object identity. */
export function resolveMarkIdentity(
  spec: ViewSpec,
  chartDefault: MarkKeySpec | null | undefined = null
): MarkIdentity | null {
  const explicit = specObjectKey(spec);
  const key = explicit ?? chartDefault;
  if (key == null) return null;
  const fields = (Array.isArray(key) ? key : [key]).map(String).filter(Boolean);
  return fields.length ? { fields, source: explicit == null ? 'chart-default' : 'explicit' } : null;
}

/** Collision-safe key used by Core and ordinary keyed joins. */
export function markKeyValue(
  row: DataRow,
  identity: MarkIdentity,
  index = 0
): string {
  const values = identity.fields.map((field) => row[field]);
  if (values.some((value) => value == null)) return `__missing__:${index}`;
  return values.length === 1 ? String(values[0]) : JSON.stringify(values);
}

export function correspondMarks(
  fromRows: DataRow[],
  toRows: DataRow[],
  fromIdentity: MarkIdentity | null,
  toIdentity: MarkIdentity | null
): MarkCorrespondence {
  if (!sameFields(fromIdentity, toIdentity)) {
    return unsupported(null, 'mark identity differs between endpoints');
  }
  if (!fromIdentity || !toIdentity) {
    return unsupported(null, 'mark identity is not declared or resolved');
  }

  const from = endpointMap(fromRows, fromIdentity);
  const to = endpointMap(toRows, toIdentity);
  const reasons = [...from.reasons, ...to.reasons];
  if (reasons.length) return unsupported(fromIdentity, ...reasons);

  const updates: MarkMatch[] = [];
  const exit: MarkEndpoint[] = [];
  const enter: MarkEndpoint[] = [];
  for (const [key, fromIndex] of from.indexes) {
    const toIndex = to.indexes.get(key);
    if (toIndex == null) exit.push({ key, index: fromIndex });
    else updates.push({ key, fromIndex, toIndex });
  }
  for (const [key, index] of to.indexes) {
    if (!from.indexes.has(key)) enter.push({ key, index });
  }
  return { identity: fromIdentity, updates, enter, exit, stable: true, reasons: [] };
}

function endpointMap(rows: DataRow[], identity: MarkIdentity) {
  const indexes = new Map<string, number>();
  const reasons: string[] = [];
  rows.forEach((row, index) => {
    const missing = identity.fields.filter((field) => row[field] == null);
    if (missing.length) {
      reasons.push(`mark key is missing ${missing.join(', ')} at row ${index}`);
      return;
    }
    const key = markKeyValue(row, identity, index);
    if (indexes.has(key)) reasons.push(`duplicate mark key: ${key}`);
    else indexes.set(key, index);
  });
  return { indexes, reasons: [...new Set(reasons)] };
}

function sameFields(from: MarkIdentity | null, to: MarkIdentity | null): boolean {
  return Boolean(from && to && JSON.stringify(from.fields) === JSON.stringify(to.fields));
}

function unsupported(
  identity: MarkIdentity | null,
  ...reasons: string[]
): MarkCorrespondence {
  return {
    identity,
    updates: [],
    exit: [],
    enter: [],
    stable: false,
    reasons
  };
}
