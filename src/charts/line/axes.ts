import { responsiveTickCount } from '../style.js';
import type { ChartPresentation } from '../style.js';
import type { ChartRuntime } from '../../runtime/chart-runtime.js';
import type { RuntimeScale } from '../../runtime/render-types.js';
import type { ChartContext, EncodingSpec } from '../../types/index.js';

export interface LineAxisOptions {
  duration?: number;
}

/** Line-owned presentation: baseline x-axis and a light horizontal reading grid. */
export function drawLineAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  runtime: ChartRuntime,
  presentation: ChartPresentation,
  options: LineAxisOptions = {}
): void {
  drawSeriesAxes(chart, x, y, enc, runtime, presentation, options);
}

function drawSeriesAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  runtime: ChartRuntime,
  presentation: ChartPresentation,
  options: LineAxisOptions
): void {
  const transition = chart.transition.base;
  const axisDuration = options.duration;
  const { theme: style, plot: rule } = presentation;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);
  if (rule.grid === 'both') runtime.drawGrid(chart, y, transition, { x, xTickCount, yTickCount, duration: axisDuration });
  else if (rule.grid === 'vertical') runtime.drawGrid(chart, null, transition, { x, xTickCount, duration: axisDuration });
  else if (rule.grid === 'horizontal') runtime.drawGrid(chart, y, transition, { yTickCount, duration: axisDuration });
  else runtime.updateGrid(chart, null, transition);
  const edgeTitleInset = rule.edgeTitles ? style.edgeTitleInset : undefined;
  runtime.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), transition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    duration: axisDuration,
    edgeTitleInset
  });
  runtime.drawYAxis(chart, y, style.axisTitle(enc.y, 'up'), transition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format ?? (enc.y?.scale?.type === 'log' ? '~s' : undefined),
    duration: axisDuration,
    edgeTitleInset
  });
  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);
}
