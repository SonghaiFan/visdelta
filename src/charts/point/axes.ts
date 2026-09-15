import { chartStyle, responsiveTickCount } from '../style.js';
import { motion } from '../../runtime/recorder.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
import type { ChartContext, D3Lib, EncodingSpec } from '../../types/index.js';

/** Point-owned axis presentation for compact correlation plots. */
export function drawPointAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  d3: D3Lib,
  deps: ChartRuntimeDeps
): void {
  const transition = chart.transition.base;
  const style = chartStyle(deps);
  const rule = style.charts.point;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);

  if (rule.grid === 'both') deps.drawGrid(chart, y, d3, transition, { x, xTickCount, yTickCount });
  else if (rule.grid === 'vertical') deps.drawGrid(chart, null, d3, transition, { x, xTickCount });
  else if (rule.grid === 'horizontal') deps.drawGrid(chart, y, d3, transition, { yTickCount });
  else deps.updateGrid(chart, null, d3, transition);
  deps.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), d3, transition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format
  });
  deps.drawYAxis(chart, y, style.axisTitle(enc.y, 'up'), d3, transition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format
  });

  // A scatterplot reads as a field rather than a boxed coordinate frame.
  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);

  if (rule.edgeTitles && enc.x?.title) {
    motion(chart.scene.xLabel.attr('text-anchor', 'end'), transition)
      .attr('text-anchor', 'end')
      .attr('x', chart.margin.left + chart.innerWidth - style.edgeTitleInset.right)
      .attr('y', chart.height - style.edgeTitleInset.bottom)
      .attr('transform', null);
  }

  if (rule.edgeTitles && enc.y?.title) {
    motion(chart.scene.yLabel.attr('text-anchor', 'start'), transition)
      .attr('text-anchor', 'start')
      .attr('x', chart.margin.left + style.edgeTitleInset.left)
      .attr('y', chart.margin.top - style.edgeTitleInset.top)
      .attr('transform', null);
  }
}
