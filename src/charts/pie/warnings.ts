import type { ChartWarningInspector } from '../../types/index.js';
import { colorWarnings, warning } from '../warnings.js';
export const chartWarnings: ChartWarningInspector = (spec, rows) => {
  const result = colorWarnings(spec, rows);
  if (!rows.length) return result;
  if (rows.length > 4) result.push(warning('pie.too-many-slices',
    `${rows.length} slices make share comparison and labeling difficult.`,
    'Consider bars or an explicit aggregation of minor components.', { count: rows.length, threshold: 4 }));
  if (rows.length <= 2) result.push(warning('pie.simple-share',
    'This pie communicates a single share or its complement.',
    'Consider stating the percentage directly when a chart adds little context.', { count: rows.length }));
  return result;
};
