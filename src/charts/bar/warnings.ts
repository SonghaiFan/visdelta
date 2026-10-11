import { quantitativeScale } from '../../toolkit/scales.js';
import type { ChartWarningInspector } from '../../types/index.js';
import { barMeasureChannel } from './layout/index.js';
import { semanticBarState } from './semantic.js';
import { categoryCount, colorWarnings, warning } from '../warnings.js';

export const chartWarnings: ChartWarningInspector = (spec, rows) => {
  const result = colorWarnings(spec, rows);
  if (spec.encoding?.facet && (spec.facetLayout as {scales?: string} | undefined)?.scales === 'independent') {
    result.push(warning('bar.independent-repeat-scales',
      'Repeated panels use independent numeric scales, so bar lengths cannot be compared across panels.',
      'Use shared scales when comparing component magnitudes.', {}, spec.encoding.facet.field));
  }
  const state = semanticBarState(spec);
  const count = categoryCount(rows, state.categoryField);
  if (state.layout === 'stacked' && state.orientation === 'vertical' && count > 10) {
    result.push(warning('bar.too-many-stacked-columns',
      `${count} stacked columns can crowd labels and components.`,
      'Consider horizontal bars, dots or a table.',
      { count, threshold: 10 }, state.categoryField ?? undefined));
  }
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
