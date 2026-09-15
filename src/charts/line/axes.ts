import { chartStyle, responsiveTickCount } from '../style.js';
import { motion } from '../../runtime/recorder.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
import type { MotionTiming } from '../../runtime/recorder.js';
import type { ChartContext, D3Lib, EncodingSpec } from '../../types/index.js';

export interface LineAxisOptions {
  duration?: number;
}

/** Line-owned presentation: baseline x-axis and a light horizontal reading grid. */
export function drawLineAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  d3: D3Lib,
  deps: ChartRuntimeDeps,
  options: LineAxisOptions = {}
): void {
  drawSeriesAxes(chart, x, y, enc, d3, deps, options);
}

function drawSeriesAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  d3: D3Lib,
  deps: ChartRuntimeDeps,
  options: LineAxisOptions
): void {
  const transition = chart.transition.base;
  const axisDuration = options.duration;
  const style = chartStyle(deps);
  const rule = style.charts.line;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);
  if (rule.grid === 'both') deps.drawGrid(chart, y, d3, transition, { x, xTickCount, yTickCount, duration: axisDuration });
  else if (rule.grid === 'vertical') deps.drawGrid(chart, null, d3, transition, { x, xTickCount, duration: axisDuration });
  else if (rule.grid === 'horizontal') deps.drawGrid(chart, y, d3, transition, { yTickCount, duration: axisDuration });
  else deps.updateGrid(chart, null, d3, transition);
  deps.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), d3, transition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    duration: axisDuration
  });
  deps.drawYAxis(chart, y, style.axisTitle(enc.y, 'up'), d3, transition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format,
    duration: axisDuration
  });
  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);
  if (rule.edgeTitles) placeEdgeTitles(chart, enc, transition, axisDuration, style.edgeTitleInset);
}

function placeEdgeTitles(
  chart: ChartContext,
  enc: EncodingSpec,
  transition: MotionTiming,
  duration: number | undefined,
  inset: Readonly<{ top: number; right: number; bottom: number; left: number }>
): void {
  if (enc.x?.title) {
    motion(chart.scene.xLabel.attr('text-anchor', 'end'), duration == null ? transition : { ...transition, duration })
      .attr('text-anchor', 'end')
      .attr('x', chart.margin.left + chart.innerWidth - inset.right)
      .attr('y', chart.height - inset.bottom)
      .attr('transform', null);
  }
  if (enc.y?.title) {
    motion(chart.scene.yLabel.attr('text-anchor', 'start'), duration == null ? transition : { ...transition, duration })
      .attr('text-anchor', 'start')
      .attr('x', chart.margin.left + inset.left)
      .attr('y', chart.margin.top - inset.top)
      .attr('transform', null);
  }
}
