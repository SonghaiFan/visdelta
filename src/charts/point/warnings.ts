import type { ChartWarningInspector } from '../../types/index.js';
import { pointState } from './state.js';
import { colorWarnings, warning } from '../warnings.js';

export const chartWarnings: ChartWarningInspector = (spec, rows) => {
  const result = colorWarnings(spec, rows);
  const { x, y, size } = spec.encoding ?? {};
  if (x?.type === 'quantitative' && y?.type === 'quantitative' && x.field && y.field) {
    const valid = rows.filter(row => [row[x.field!], row[y.field!]].every(value => value != null && value !== '' && Number.isFinite(Number(value))));
    if (valid.length > 0 && valid.length < 5) result.push(warning('point.small-sample',
      'Fewer than five observations provide little evidence for a relationship pattern.',
      'Show the sample size and avoid strong trend conclusions.', { count: valid.length, threshold: 5 }));
    const positions = new Set(valid.map(row => JSON.stringify([Number(row[x.field!]), Number(row[y.field!])])));
    const hidden = valid.length - positions.size;
    if (hidden) result.push(warning('point.coincident-positions',
      'Multiple observations share exactly the same position and can hide one another.',
      'Consider transparency, aggregation, or filtering; inspect the underlying observations.', { duplicatePositions: hidden }));
  }
  // Summary/detail views can change positions and grain; do not guess their dots.
  const category = ['nominal', 'ordinal'].includes(y?.type ?? '') && x?.type === 'quantitative' ? y
    : ['nominal', 'ordinal'].includes(x?.type ?? '') && y?.type === 'quantitative' ? x : undefined;
  const measure = category === y ? x : y;
  if (category?.field && measure?.field && !pointState(spec, spec.encoding).view) {
    const counts = new Map<unknown, number>();
    for (const row of rows) {
      const value = row[measure.field];
      if (row[category.field] == null || value == null || value === '' || !Number.isFinite(Number(value))) continue;
      counts.set(row[category.field], (counts.get(row[category.field]) ?? 0) + 1);
    }
    const crowded = [...counts.values()].filter(count => count > 3);
    if (crowded.length) result.push(warning('point.too-many-dots-per-category',
      'Some categories contain more than three dots, increasing the effort needed to distinguish and compare them.',
      'Consider filtering or splitting the comparison. Four or five dots can still work with clear identification.',
      { categories: crowded.length, maximum: Math.max(...crowded), threshold: 3 }, category.field));
  }
  if (size?.field && rows.some(row => row[size.field!] != null && Number(row[size.field!]) < 0)) result.push(warning('point.negative-size',
    'Negative values cannot be faithfully represented as bubble areas.',
    'Use position for signed quantities, or select a non-negative size measure.', {}, size.field));
  return result;
};
