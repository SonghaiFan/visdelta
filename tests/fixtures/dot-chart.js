import {
  ChartState,
  defineChartModule,
  defineChartType,
  motion
} from '/dist/plugins.js';

let loads = 0;

const plugin = defineChartType({
  key: 'dot',
  renderer(chart, rows, spec) {
    const field = spec.encoding.x.field;
    const dots = chart.g.selectAll('circle.dot')
      .data(rows, row => row.id)
      .join('circle')
      .attr('class', 'dot')
      .attr('cy', 40)
      .attr('r', 6);
    // Seekable motion: recorded as tracks, never scheduled through D3.
    motion(dots, chart.transition.base)
      .attr('cx', row => Number(row[field]) * 20);
  }
});

const dotModule = defineChartModule({
  key: 'dot',
  async load() {
    loads += 1;
    return { plugin };
  }
});

class DotState extends ChartState {
  chartModule() {
    return dotModule;
  }
}

export function dot(data = []) {
  return new DotState({ mark: 'dot', data, encoding: {} });
}

export function moduleLoads() {
  return loads;
}
