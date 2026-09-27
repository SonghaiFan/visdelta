// A separately bundleable chart: only public VisDelta exports are used.
import { ChartState, defineChartModule, defineChartType } from 'visdelta/plugins';

import { resolvePlotStyle } from 'visdelta/toolkit';

export const plugin = defineChartType({
  key: 'orbit',
  transitionEvaluation: 'cached',
  defaults: { margin: (_spec, runtime) => resolvePlotStyle({ margin: { top: 20, right: 20, bottom: 20, left: 20 } }, runtime.chartStyle).margin },
  createRenderer(runtime) {
    return (chart, rows, spec, tooltip) => {
      const radius = Math.min(chart.innerWidth, chart.innerHeight) / 3;
      const field = spec.encoding?.size?.field;
      const color = runtime.colorScale(rows, spec.encoding?.color);
      const marks = chart.g.selectAll('circle.orbit-mark').data(rows, row => row.id);
      runtime.motion(marks.exit(), chart.transition.exit || chart.transition.base)
        .style('opacity', 0).remove();
      const joined = marks.enter().append('circle').attr('class', 'orbit-mark')
        .attr('r', 0).style('opacity', 0).merge(marks);
      runtime.motion(joined, chart.transition.base)
        .attr('cx', (_, i) => chart.innerWidth / 2 + radius * Math.cos(i * 2 * Math.PI / rows.length))
        .attr('cy', (_, i) => chart.innerHeight / 2 + radius * Math.sin(i * 2 * Math.PI / rows.length))
        .attr('r', row => Math.sqrt(Math.max(0, Number(row[field]) || 0)))
        .attr('fill', color).style('opacity', 1);
      runtime.bindTooltip(joined, spec, tooltip);
    };
  }
});

export const orbitModule = defineChartModule({
  key: 'orbit',
  load: async () => ({ plugin })
});

class OrbitState extends ChartState {
  chartModule() { return orbitModule; }
}

/** Each source row owns one circle; size is its area-proportional measure. */
export function orbit(data) {
  return new OrbitState({ mark: 'orbit', data, key: 'id', encoding: {} });
}
