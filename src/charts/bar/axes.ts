import { chartStyle, responsiveTickCount } from '../style.js';
import type { ChartGridStyle } from '../style.js';
import { motion } from '../../runtime/recorder.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
import type { MotionTiming } from '../../runtime/recorder.js';
import type { ChartContext, D3Lib, EncodingSpec } from '../../types/index.js';

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
  d3: D3Lib,
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

  drawStyledGrid(rule.grid, chart, x, y, d3, deps, transition, xTickCount, yTickCount);
  deps.drawXAxis(
    chart,
    x,
    style.axisTitle(enc.x, 'right'),
    d3,
    xTransition,
    {
      tickCount: xTickCount,
      tickFormat: enc.x?.format,
      position: horizontal ? undefined : y(0)
    }
  );
  deps.drawYAxis(
    chart,
    y,
    horizontal ? enc.y?.title : style.axisTitle(enc.y, 'up'),
    d3,
    yTransition,
    {
      tickCount: yTickCount,
      tickFormat: enc.y?.format,
      position: horizontal ? x(0) : undefined
    }
  );

  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);
  if (rule.edgeTitles) {
    placeEdgeTitles(chart, enc, horizontal, xTransition, yTransition, style.edgeTitleInset);
  }
}

function drawStyledGrid(
  grid: ChartGridStyle,
  chart: ChartContext,
  x: Scale,
  y: Scale,
  d3: D3Lib,
  deps: ChartRuntimeDeps,
  transition: MotionTiming,
  xTickCount: number,
  yTickCount: number
): void {
  if (grid === 'both') return deps.drawGrid(chart, y, d3, transition, { x, xTickCount, yTickCount });
  if (grid === 'vertical') return deps.drawGrid(chart, null, d3, transition, { x, xTickCount });
  if (grid === 'horizontal') return deps.drawGrid(chart, y, d3, transition, { yTickCount });
  return deps.updateGrid(chart, null, d3, transition);
}

function placeEdgeTitles(
  chart: ChartContext,
  enc: EncodingSpec,
  horizontal: boolean,
  xTransition: MotionTiming,
  yTransition: MotionTiming,
  inset: Readonly<{ top: number; right: number; bottom: number; left: number }>
): void {
  if (enc.x?.title) {
    motion(chart.scene.xLabel.attr('text-anchor', 'end'), xTransition)
      .attr('text-anchor', 'end')
      .attr('x', chart.margin.left + chart.innerWidth - inset.right)
      .attr('y', chart.height - inset.bottom)
      .attr('transform', null);
  }

  if (enc.y?.title) {
    motion(chart.scene.yLabel.attr('text-anchor', 'start'), yTransition)
      .attr('text-anchor', 'start')
      .attr('x', chart.margin.left + inset.left)
      .attr('y', chart.margin.top - inset.top)
      .attr('transform', null);
  }
}
