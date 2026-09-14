// @ts-nocheck - D3 axis rendering is provided through chart runtime deps.
import { chartStyle, responsiveTickCount } from '../style.js';

/** Unit-owned axes for layouts that explicitly map force targets or horizontal position. */
export function drawUnitAxes(chart, scales, channels, d3, deps, options = {}) {
  const transition = chart.transition.base;
  const style = chartStyle(deps);
  const rule = style.charts.unit;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);
  const { x = null, y = null } = scales;
  if (rule.grid === 'both') deps.drawGrid(chart, y, d3, transition, { x, xTickCount, yTickCount });
  else if (rule.grid === 'vertical') deps.drawGrid(chart, null, d3, transition, { x, xTickCount });
  else if (rule.grid === 'horizontal') deps.drawGrid(chart, y, d3, transition, { yTickCount });
  else deps.updateGrid(chart, null, d3, transition);
  deps.drawXAxis(
    chart,
    x,
    style.axisTitle(channels.x, 'right'),
    d3,
    transition,
    {
      tickCount: xTickCount,
      tickFormat: channels.x?.format,
      position: options.position
    }
  );
  deps.drawYAxis(chart, y, style.axisTitle(channels.y, 'up'), d3, transition, {
    tickCount: yTickCount,
    tickFormat: channels.y?.format
  });
  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);
  if (rule.edgeTitles && channels.x?.title) {
    chart.scene.xLabel.attr('text-anchor', 'end').transition(transition)
      .attr('text-anchor', 'end')
      .attr('x', chart.margin.left + chart.innerWidth - style.edgeTitleInset.right)
      .attr('y', chart.height - style.edgeTitleInset.bottom)
      .attr('transform', null);
  }
  if (rule.edgeTitles && channels.y?.title) {
    chart.scene.yLabel.attr('text-anchor', 'start').transition(transition)
      .attr('text-anchor', 'start')
      .attr('x', chart.margin.left + style.edgeTitleInset.left)
      .attr('y', chart.margin.top - style.edgeTitleInset.top)
      .attr('transform', null);
  }
}

export function clearUnitAxes(chart, d3, deps) {
  const transition = chart.transition.base;
  deps.updateGrid(chart, null, d3, transition);
  deps.drawXAxis(chart, null, null, d3, transition);
  deps.drawYAxis(chart, null, null, d3, transition);
}
