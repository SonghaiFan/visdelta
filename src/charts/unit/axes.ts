import { chartStyle, responsiveTickCount } from '../style.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
import type { ChartContext, EncodingSpec } from '../../types/index.js';

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
  if (rule.grid === 'both') deps.drawGrid(chart, y, transition, { x, xTickCount, yTickCount });
  else if (rule.grid === 'vertical') deps.drawGrid(chart, null, transition, { x, xTickCount });
  else if (rule.grid === 'horizontal') deps.drawGrid(chart, y, transition, { yTickCount });
  else deps.updateGrid(chart, null, transition);
  const edgeTitleInset = rule.edgeTitles && !anchorsOnly ? style.edgeTitleInset : undefined;
  deps.drawXAxis(chart, x, anchorsOnly ? undefined : style.axisTitle(channels.x, 'right'), transition, {
    tickCount: xTickCount,
    tickFormat: channels.x?.format,
    position: options.position,
    edgeTitleInset
  });
  deps.drawYAxis(chart, y, anchorsOnly ? undefined : style.axisTitle(channels.y, 'up'), transition, {
    tickCount: yTickCount,
    tickFormat: channels.y?.format,
    edgeTitleInset
  });
  if (anchorsOnly) {
    // Force exposes collection anchors, not Cartesian continua. Keep the
    // observed-value ticks, but never connect them with a domain line.
    chart.scene.xAxis.select('.domain').style('opacity', 0);
    chart.scene.yAxis.select('.domain').style('opacity', 0);
  } else {
    chart.scene.xAxis.select('.domain').style('opacity', rule.openXDomain ? 0 : 1);
    chart.scene.yAxis.select('.domain').style('opacity', rule.openYDomain ? 0 : 1);
  }
}

export function clearUnitAxes(chart: ChartContext, deps: ChartRuntimeDeps): void {
  const transition = chart.transition.base;
  deps.updateGrid(chart, null, transition);
  deps.drawXAxis(chart, null, undefined, transition);
  deps.drawYAxis(chart, null, undefined, transition);
}
