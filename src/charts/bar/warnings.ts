import { quantitativeScale } from '../../toolkit/scales.js';
import type { ChartWarningInspector } from '../../types/index.js';
import { barMeasureChannel } from './layout/index.js';
import { colorWarnings, warning } from '../warnings.js';

export const chartWarnings: ChartWarningInspector = (spec, rows) => {
  const result = colorWarnings(spec, rows);
  const channel = barMeasureChannel(spec.encoding);
  const domain = channel.domain;
  if (rows.length && domain?.length === 2 && domain.every(value => Number.isFinite(Number(value)))) {
    const [a, b] = quantitativeScale([], { domain }, [0, 1]).domain().map(Number);
    if (Math.min(a, b) > 0 || Math.max(a, b) < 0) result.push(warning('bar.truncated-baseline',
      'The measure domain excludes zero, distorting comparison by bar length.',
      'Include zero or use a dot plot.',
      { start: a, end: b }, channel.field));
  }
  return result;
};
