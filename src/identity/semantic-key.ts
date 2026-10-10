import type { ViewSpec } from '../types/index.js';
import { specSemanticKey } from '../spec-meta.js';
import { markKeyValue, resolveMarkIdentity } from './mark-correspondence.js';

type KeyFn = (d: Record<string, unknown>, i: number) => string | number;

export function keyAccessor(spec: ViewSpec, fallbackField: string | string[] = 'id'): KeyFn {
  const identity = resolveMarkIdentity(spec, fallbackField)!;
  return (d: Record<string, unknown>, i: number) =>
    (d['__unitKey'] as string | number | null | undefined) ?? markKeyValue(d, identity, i);
}

export function semanticKeyForDatum(datum: Record<string, unknown> | null, spec: ViewSpec = {}): string | null {
  const semanticKey = specSemanticKey(spec);
  if (!semanticKey || !datum) return null;

  const parts = [
    ...semanticKeyParts(semanticKey.entity ?? (semanticKey as Record<string, unknown>)['entities'], datum, 'field'),
    ...semanticKeyParts(semanticKey.measure ?? (semanticKey as Record<string, unknown>)['measures'], datum, 'value')
  ];

  if (!parts.length || parts.some((part) => part == null || part === '')) return null;
  return parts.length === 1 ? String(parts[0]) : JSON.stringify(parts);
}

export function semanticMeasureForDatum(datum: Record<string, unknown> | null, spec: ViewSpec = {}): unknown {
  const semanticKey = specSemanticKey(spec);
  if (!semanticKey || !datum) return null;
  return semanticKeyParts(semanticKey.measure ?? (semanticKey as Record<string, unknown>)['measures'], datum, 'value')[0] ?? null;
}

function semanticKeyParts(parts: unknown, datum: Record<string, unknown>, stringRole: string): unknown[] {
  return arrayOf(parts)
    .map((part) => semanticPartValue(part, datum, stringRole))
    .filter((value) => value != null && value !== '');
}

function semanticPartValue(part: unknown, datum: Record<string, unknown>, stringRole: string): unknown {
  if (part == null) return null;
  if (typeof part === 'function') return (part as (d: Record<string, unknown>) => unknown)(datum);
  if (typeof part === 'string') {
    return stringRole === 'value' ? (datum[part] ?? part) : datum[part];
  }
  const p = part as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(p, 'value')) return p['value'];
  if (p['field']) return datum[p['field'] as string];
  return null;
}

function arrayOf(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
