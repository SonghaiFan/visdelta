import type { VisualizationWarning, ViewSpec } from '../types/index.js';

const academy = 'https://www.datawrapper.de/academy/';
function guideSource(code: string): string | undefined {
  if (code.startsWith('pie.')) return academy + 'what-to-consider-when-creating-a-pie-chart';
  if (code.startsWith('area.')) return academy + 'what-to-consider-when-creating-area-charts';
  if (code.startsWith('line.') || code === 'connection.smoothing') return academy + 'what-to-consider-when-creating-line-charts';
  if (code === 'bar.truncated-baseline') return academy + 'why-our-column-and-bar-charts-start-at-zero';
  return undefined;
}

export const warning = (code: string, message: string, suggestion: string,
  evidence: VisualizationWarning['evidence'], field?: string): VisualizationWarning =>
  ({ code, severity: 'warning', message, suggestion, evidence, field, source: guideSource(code) });

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


/** Advisory about interpolation, shared by connected marks. */
export function smoothingWarnings(spec: ViewSpec, rows: readonly Record<string, unknown>[], seriesField?: string | null): VisualizationWarning[] {
  const curve = spec.curve;
  const x = spec.encoding?.x?.field;
  const observations = new Map<unknown, Set<unknown>>();
  for (const row of rows) {
    if (!x || row[x] == null) continue;
    const key = seriesField ? row[seriesField] : null;
    const values = observations.get(key) ?? new Set();
    values.add(String(row[x]));
    observations.set(key, values);
  }
  return [...observations.values()].some(values => values.size >= 3) && typeof curve === 'string' &&
    /^(curveNatural|curveCardinal(?:Open|Closed)?)$/.test(curve)
    ? [warning('connection.smoothing',
      'This interpolation can introduce extrema between observed values.',
      'Consider linear or monotone interpolation; inspect the curve against the observations.',
      { curve })] : [];
}
