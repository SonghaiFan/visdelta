import { orderedAxisWarnings } from '../ordered-warnings.js';
import type { ChartWarningInspector } from '../../types/index.js';
import { lineSeriesKey, lineState } from './state.js';
import { categoryCount, colorWarnings, warning } from '../warnings.js';

export const chartWarnings: ChartWarningInspector = (spec, rows) => {
  if (!rows.length) return [];
  const result = [...colorWarnings(spec, rows), ...orderedAxisWarnings(spec.encoding?.x)];
  const field = lineSeriesKey(lineState(spec, spec.encoding));
  const count = categoryCount(rows, field);
  if (count > 10) result.push(warning('line.too-many-series',
    `${count} lines can obscure trends and crossovers.`,
    'Filter or highlight relevant series, or use small multiples.', { count, threshold: 10 }, field ?? undefined));
  return result;
};
