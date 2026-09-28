import { responsiveTickCount } from '../style.js';
import type { ChartPresentation } from '../style.js';
import type { ChartGridStyle } from '../style.js';
import type { ChartRuntime } from '../../runtime/chart-runtime.js';
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
  runtime.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), xTransition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    position: horizontal ? undefined : y(0),
    edgeTitleInset
  });
  runtime.drawYAxis(chart, y, horizontal ? enc.y?.title : style.axisTitle(enc.y, 'up'), yTransition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format,
    position: horizontal ? x(0) : undefined,
    edgeTitleInset
  });

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
