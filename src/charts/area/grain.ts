import { applyTransforms } from '../../data/transforms.js';
import type { ViewSpec } from '../../types/index.js';
import { areaState } from './state.js';

/** Return the renderer's single-Area grain error for already transformed rows. */
export function areaGrainError(spec: ViewSpec, rows: Record<string, unknown>[]): string | null {
  if (areaState(spec, spec.encoding).mode !== 'single') return null;
  const xField = spec.encoding?.x?.field;
  if (!xField) return null;

  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[xField];
    const token = value instanceof Date
      ? `date:${value.getTime()}`
      : `${typeof value}:${String(value)}`;
    if (seen.has(token)) {
      const display = value instanceof Date ? value.toISOString() : String(value);
      return `Area chart needs one value per ${xField}. Found more than one row for "${display}". Use .where(...), .breakdown(...), or .rollup(...) to make the grain explicit.`;
    }
    seen.add(token);
  }
  return null;
}

/** Validate a declaration using the same transformed rows that the renderer sees. */
export function areaDeclarationGrainError(spec: ViewSpec): string | null {
  if (areaState(spec, spec.encoding).mode !== 'single') return null;
  const data = spec.data;
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)['values'])
      ? (data as Record<string, unknown>)['values'] as unknown[]
      : null;
  if (!rows) {
    const xField = spec.encoding?.x?.field ?? 'x';
    return `Area single declarations need inline data to verify one value per ${xField}.`;
  }

  try {
    return areaGrainError(spec, applyTransforms(rows as Record<string, unknown>[], spec.transform ?? []));
  } catch (error) {
    return `Area grain could not be validated: ${error instanceof Error ? error.message : String(error)}`;
  }
}
