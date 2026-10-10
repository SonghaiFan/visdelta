import type { VisualizationWarning, ViewSpec } from '../types/index.js';

export const warning = (code: string, message: string, suggestion: string,
  evidence: VisualizationWarning['evidence'], field?: string): VisualizationWarning =>
  ({ code, severity: 'warning', message, suggestion, evidence, field });

export function categoryCount(rows: readonly Record<string, unknown>[], field?: string | null): number {
  return field ? new Set(rows.map(row => row[field]).filter(value => value != null)).size : 0;
}

export function colorWarnings(spec: ViewSpec, rows: readonly Record<string, unknown>[]): VisualizationWarning[] {
  const color = spec.encoding?.color;
  if (!color?.field || !['nominal', 'ordinal'].includes(color.type ?? '')) return [];
  const count = categoryCount(rows, color.field);
  return count > 5 ? [warning('color.too-many-categories',
    `${count} color categories can be difficult to distinguish.`,
    'Consider grouping categories, filtering, or using small multiples. Colors and legend entries are preserved.',
    { count, threshold: 5 }, color.field)] : [];
}

