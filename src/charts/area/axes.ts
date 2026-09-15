import { chartStyle, responsiveTickCount } from '../style.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../runtime/marks.js';
import type { ChartContext, EncodingSpec } from '../../types/index.js';

/** Area-owned presentation: Line-like axes with a quiet horizontal reading grid. */
export function drawAreaAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  deps: ChartRuntimeDeps
): void {
  const transition = chart.transition.base;
  const style = chartStyle(deps);
  const rule = style.charts.area;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);
  if (rule.grid === 'both') deps.drawGrid(chart, y, transition, { x, xTickCount, yTickCount });
  else if (rule.grid === 'vertical') deps.drawGrid(chart, null, transition, { x, xTickCount });
  else if (rule.grid === 'horizontal') deps.drawGrid(chart, y, transition, { yTickCount });
  else deps.updateGrid(chart, null, transition);
  const edgeTitleInset = rule.edgeTitles ? style.edgeTitleInset : undefined;
  deps.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), transition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    edgeTitleInset
  });
  deps.drawYAxis(chart, y, style.axisTitle(enc.y, 'up'), transition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format,
    edgeTitleInset
  });
  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);

}
