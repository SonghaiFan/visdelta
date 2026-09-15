import { chartStyle, responsiveTickCount } from '../style.js';
import type { ChartGridStyle } from '../style.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
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
  deps: ChartRuntimeDeps,
  horizontal: boolean,
  options: BarAxisOptions = {}
): void {
  const transition = chart.transition.base;
  const style = chartStyle(deps);
  const rule = style.charts.bar;
  const xTransition = options.xTransition || transition;
  const yTransition = options.yTransition || transition;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);

  const edgeTitleInset = rule.edgeTitles ? style.edgeTitleInset : undefined;
  drawStyledGrid(rule.grid, chart, x, y, deps, transition, xTickCount, yTickCount);
  deps.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), xTransition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    position: horizontal ? undefined : y(0),
    edgeTitleInset
  });
  deps.drawYAxis(chart, y, horizontal ? enc.y?.title : style.axisTitle(enc.y, 'up'), yTransition, {
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
  deps: ChartRuntimeDeps,
  transition: MotionTiming,
  xTickCount: number,
  yTickCount: number
): void {
  if (grid === 'both') return deps.drawGrid(chart, y, transition, { x, xTickCount, yTickCount });
  if (grid === 'vertical') return deps.drawGrid(chart, null, transition, { x, xTickCount });
  if (grid === 'horizontal') return deps.drawGrid(chart, y, transition, { yTickCount });
  return deps.updateGrid(chart, null, transition);
}
