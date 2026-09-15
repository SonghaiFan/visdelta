import type { SemanticKey, ViewSpec } from '../types/index.js';
import { specObjectKey, specSemanticKey } from '../spec-meta.js';

type KeyFn = (d: Record<string, unknown>, i: number) => string | number;

export function keyAccessor(spec: ViewSpec, fallbackField: string | string[] = 'id'): KeyFn {
  const key = specObjectKey(spec) || fallbackField;
  if (Array.isArray(key)) {
    return (d: Record<string, unknown>, i: number) =>
      (key as string[]).map((field) => d[field]).join('|') || String(i);
  }
  if (typeof key === 'function') return key as KeyFn;
  return (d: Record<string, unknown>, i: number) =>
    (d[key as string] ?? d['__unitKey'] ?? i) as string | number;
}

export function semanticKeyForDatum(datum: Record<string, unknown> | null, spec: ViewSpec = {}): string | null {
  const semanticKey = specSemanticKey(spec);
  if (!semanticKey || !datum) return null;

  const parts = [
    ...semanticKeyParts(semanticKey.entity ?? (semanticKey as Record<string, unknown>)['entities'], datum, 'field'),
    ...semanticKeyParts(semanticKey.measure ?? (semanticKey as Record<string, unknown>)['measures'], datum, 'value')
  ];

  if (!parts.length || parts.some((part) => part == null || part === '')) return null;
  return parts.map((part) => String(part)).join('|');
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
