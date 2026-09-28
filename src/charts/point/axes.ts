import { responsiveTickCount } from '../style.js';
import type { ChartPresentation } from '../style.js';
import type { ChartRuntime } from '../../runtime/chart-runtime.js';
import type { RuntimeScale } from '../../runtime/render-types.js';
import type { ChartContext, EncodingSpec } from '../../types/index.js';

/** Point-owned axis presentation for compact correlation plots. */
export function drawPointAxes(
  chart: ChartContext,
  x: RuntimeScale,
  y: RuntimeScale,
  enc: EncodingSpec,
  runtime: ChartRuntime,
  presentation: ChartPresentation
): void {
  const transition = chart.transition.base;
  const { theme: style, plot: rule } = presentation;
  const xTickCount = responsiveTickCount(chart.innerWidth, style.tickSpacing.x);
  const yTickCount = responsiveTickCount(chart.innerHeight, style.tickSpacing.y);

  if (rule.grid === 'both') runtime.drawGrid(chart, y, transition, { x, xTickCount, yTickCount });
  else if (rule.grid === 'vertical') runtime.drawGrid(chart, null, transition, { x, xTickCount });
  else if (rule.grid === 'horizontal') runtime.drawGrid(chart, y, transition, { yTickCount });
  else runtime.updateGrid(chart, null, transition);
  const edgeTitleInset = rule.edgeTitles ? style.edgeTitleInset : undefined;
  runtime.drawXAxis(chart, x, style.axisTitle(enc.x, 'right'), transition, {
    tickCount: xTickCount,
    tickFormat: enc.x?.format,
    edgeTitleInset
  });
  runtime.drawYAxis(chart, y, style.axisTitle(enc.y, 'up'), transition, {
    tickCount: yTickCount,
    tickFormat: enc.y?.format,
    edgeTitleInset
  });

  // A scatterplot reads as a field rather than a boxed coordinate frame.
  if (rule.openXDomain) chart.scene.xAxis.select('.domain').style('opacity', 0);
  if (rule.openYDomain) chart.scene.yAxis.select('.domain').style('opacity', 0);

}
