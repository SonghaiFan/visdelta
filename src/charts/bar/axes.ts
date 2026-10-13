import { responsiveTickCount } from '../style.js';
import type { ChartPresentation } from '../style.js';
import type { ChartGridStyle } from '../style.js';
import type { ChartRuntime } from '../../runtime/chart-runtime.js';
import { timedTransition } from '../../runtime/axis-motion.js';
import type { RuntimeScale } from '../../runtime/render-types.js';
import type { MotionTiming } from '../../runtime/recorder.js';
import type { ChartContext, EncodingSpec } from '../../types/index.js';

export interface BarAxisOptions {
  xTransition?: MotionTiming;
  yTransition?: MotionTiming;
}

type Scale = RuntimeScale | null;

/** Bar-owned presentation: open quantitative axis, categorical baseline, no grid. */
export function drawBarAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  runtime: ChartRuntime,
  presentation: ChartPresentation,
  horizontal: boolean,
  options: BarAxisOptions = {}
): void {
  const transition = chart.transition.base;
  const { theme: style, plot: rule } = presentation;
  const xTransition = options.xTransition || transition;
  const yTransition = options.yTransition || transition;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);

  const edgeTitleInset = rule.edgeTitles ? style.edgeTitleInset : undefined;
  drawStyledGrid(rule.grid, chart, x, y, runtime, transition, xTickCount, yTickCount);
  // The category axis line is the bars' zero baseline. Keep it inside the
  // plot, and when zero is not the plot edge (negative values, or an authored
  // domain above zero) keep the category labels at the edge, clear of bars.
  const measureLength = horizontal ? chart.innerWidth : chart.innerHeight;
  const zero = horizontal ? x(0) : y(0);
  const baseline = Number.isFinite(zero) ? Math.max(0, Math.min(measureLength, zero as number)) : undefined;
  runtime.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), xTransition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    position: horizontal ? undefined : baseline,
    edgeTitleInset
  });
  runtime.drawYAxis(chart, y, horizontal ? enc.y?.label : style.axisTitle(enc.y, 'up'), yTransition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format,
    position: horizontal ? baseline : undefined,
    edgeTitleInset
  });
  // Record the offset on the axis transition so every frame interpolates it
  // with the axis position, keeping labels pinned to the edge while scrubbing.
  const categoryAxis = horizontal ? chart.scene.yAxis : chart.scene.xAxis;
  const labelShift = baseline == null ? 0 : horizontal ? -baseline : measureLength - baseline;
  timedTransition(categoryAxis.selectAll('.tick text'), horizontal ? yTransition : xTransition, undefined)
    .attr('transform', horizontal ? `translate(${labelShift},0)` : `translate(0,${labelShift})`);

  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);
}

function drawStyledGrid(
  grid: ChartGridStyle,
  chart: ChartContext,
  x: Scale,
  y: Scale,
  runtime: ChartRuntime,
  transition: MotionTiming,
  xTickCount: number,
  yTickCount: number
): void {
  if (grid === 'both') return runtime.drawGrid(chart, y, transition, { x, xTickCount, yTickCount });
  if (grid === 'vertical') return runtime.drawGrid(chart, null, transition, { x, xTickCount });
  if (grid === 'horizontal') return runtime.drawGrid(chart, y, transition, { yTickCount });
  return runtime.updateGrid(chart, null, transition);
}
