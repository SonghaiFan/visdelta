import { chartStyle, responsiveTickCount } from '../style.js';
import { motion } from '../../runtime/recorder.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
import type { ChartContext, D3Lib, EncodingSpec } from '../../types/index.js';

export interface UnitAxisScales {
  x?: RuntimeScale | null;
  y?: RuntimeScale | null;
}

export interface UnitAxisOptions {
  /** Force layouts expose collection anchors: ticks without titles or domain lines. */
  anchorsOnly?: boolean;
  /** Pixel position of the x axis along y (defaults to the bottom edge). */
  position?: number;
}

/** Unit-owned axes for layouts that explicitly map force targets or horizontal position. */
export function drawUnitAxes(
  chart: ChartContext,
  scales: UnitAxisScales,
  channels: EncodingSpec,
  d3: D3Lib,
  deps: ChartRuntimeDeps,
  options: UnitAxisOptions = {}
): void {
  const transition = chart.transition.base;
  const style = chartStyle(deps);
  const rule = style.charts.unit;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);
  const { x = null, y = null } = scales;
  const anchorsOnly = Boolean(options.anchorsOnly);
  if (rule.grid === 'both') deps.drawGrid(chart, y, d3, transition, { x, xTickCount, yTickCount });
  else if (rule.grid === 'vertical') deps.drawGrid(chart, null, d3, transition, { x, xTickCount });
  else if (rule.grid === 'horizontal') deps.drawGrid(chart, y, d3, transition, { yTickCount });
  else deps.updateGrid(chart, null, d3, transition);
  deps.drawXAxis(
    chart,
    x,
    anchorsOnly ? undefined : style.axisTitle(channels.x, 'right'),
    d3,
    transition,
    {
      tickCount: xTickCount,
      tickFormat: channels.x?.format,
      position: options.position
    }
  );
  deps.drawYAxis(chart, y, anchorsOnly ? undefined : style.axisTitle(channels.y, 'up'), d3, transition, {
    tickCount: yTickCount,
    tickFormat: channels.y?.format
  });
  if (anchorsOnly) {
    // Force exposes collection anchors, not Cartesian continua. Keep the
    // observed-value ticks, but never connect them with a domain line.
    chart.scene.xAxis.select('.domain').style('opacity', 0);
    chart.scene.yAxis.select('.domain').style('opacity', 0);
  } else {
    chart.scene.xAxis.select('.domain').style('opacity', rule.openXDomain ? 0 : 1);
    chart.scene.yAxis.select('.domain').style('opacity', rule.openYDomain ? 0 : 1);
    if (rule.edgeTitles && channels.x?.title) {
      motion(chart.scene.xLabel.attr('text-anchor', 'end'), transition)
        .attr('text-anchor', 'end')
        .attr('x', chart.margin.left + chart.innerWidth - style.edgeTitleInset.right)
        .attr('y', chart.height - style.edgeTitleInset.bottom)
        .attr('transform', null);
    }
    if (rule.edgeTitles && channels.y?.title) {
      motion(chart.scene.yLabel.attr('text-anchor', 'start'), transition)
        .attr('text-anchor', 'start')
        .attr('x', chart.margin.left + style.edgeTitleInset.left)
        .attr('y', chart.margin.top - style.edgeTitleInset.top)
        .attr('transform', null);
    }
  }
}

export function clearUnitAxes(chart: ChartContext, d3: D3Lib, deps: ChartRuntimeDeps): void {
  const transition = chart.transition.base;
  deps.updateGrid(chart, null, d3, transition);
  deps.drawXAxis(chart, null, undefined, d3, transition);
  deps.drawYAxis(chart, null, undefined, d3, transition);
}
