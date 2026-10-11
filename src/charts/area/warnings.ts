import { orderedAxisWarnings } from '../ordered-warnings.js';
import type { ChartWarningInspector } from '../../types/index.js';
import { areaState } from './state.js';
import { categoryCount, colorWarnings, smoothingWarnings, warning } from '../warnings.js';

export const chartWarnings: ChartWarningInspector = (spec, rows) => {
  if (!rows.length) return [];
  const result = [...colorWarnings(spec, rows), ...orderedAxisWarnings(spec.encoding?.x)];
  const state = areaState(spec, spec.encoding);
  result.push(...smoothingWarnings(spec, rows, state.seriesField));
  if (state.mode === 'single' && state.baseline !== 0) result.push(warning('area.nonzero-baseline',
    'The filled band measures distance from a nonzero baseline, not the full value.',
    'Use a line for the trend, or explicitly explain the threshold and excess represented by the band.',
    { baseline: state.baseline }, spec.encoding?.y?.field));
  const count = categoryCount(rows, state.seriesField);
  if (count > 6) result.push(warning('area.too-many-series',
    `${count} filled layers make individual components difficult to compare.`,
    'Consider fewer layers, small multiples, or lines.', { count, threshold: 6 }, state.seriesField ?? undefined));
  const field = spec.encoding?.y?.field;
  const negativeCount = field ? rows.filter(row => row[field] != null && Number(row[field]) < 0).length : 0;
  if (count > 1 && negativeCount) result.push(warning('area.negative-components',
    'Negative components make layered part-to-whole area comparisons difficult to interpret.',
    'Consider lines or diverging bars for positive and negative components.', { negativeCount }, field));
  return result;
};
