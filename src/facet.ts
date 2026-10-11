import { ChartState } from './charts/authoring.js';
import type { ChartModule } from './charts/module.js';
import type { ViewSpec } from './types/index.js';
export { validateFacetLayout } from './charts/facet-layout.js';

export interface FacetLayout { columns?: number; gap?: number; minWidth?: number; direction?: 'x' | 'y' | 'grid'; scales?: 'shared' | 'independent'; autoHeight?: boolean; minHeight?: number }
export interface FacetedViewState extends ViewSpec { facetLayout?: FacetLayout }

/** Compatibility helper; prefer the chart's fluent .repeat(field, layout). */
export function smallMultiples(chart: { toSpec(): ViewSpec; chartModule(): ChartModule<any> }, field: string, layout: FacetLayout = {}): ChartState<FacetedViewState> & { chartModule(): ChartModule<any> } {
  if ('repeat' in chart && typeof chart.repeat === 'function') {
    if (chart.toSpec().encoding?.facet) throw new Error('Nested small multiples are unsupported.');
    return chart.repeat(field, layout);
  }
  const child = chart.toSpec();
  if (child.encoding?.facet) throw new Error('Nested small multiples are unsupported.');
  const module = chart.chartModule();
  class CarriedState extends ChartState { chartModule() { return module; } }
  return new CarriedState(child).repeat(field, layout);
}
