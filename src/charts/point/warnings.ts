import type { ChartWarningInspector } from '../../types/index.js';
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
  if (size?.field && rows.some(row => row[size.field!] != null && Number(row[size.field!]) < 0)) result.push(warning('point.negative-size',
    'Negative values cannot be faithfully represented as bubble areas.',
    'Use position for signed quantities, or select a non-negative size measure.', {}, size.field));
  return result;
};
