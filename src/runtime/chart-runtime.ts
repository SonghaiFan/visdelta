import { createMarkHelpers } from './marks.js';
import type { RenderContext } from './marks.js';
import { motion } from './recorder.js';
import { svgTooltipPosition } from './tooltip.js';

export type ChartRuntime = ReturnType<typeof createChartRuntime>;

export function createChartRuntime(context: RenderContext = {}) {
  const { bandOrLinear, bindTooltip, channelDomain, colorScale, drawGrid, drawLegend, drawXAxis, drawYAxis, easeFor, hideTooltip, moveTooltip, niceExtent, position, quantitativeDomain, quantitativeScale, showTooltip, staggerDelay, themeValue, updateGrid } = createMarkHelpers(context);
  return {
    motion,
    tooltip: Object.freeze({ show: showTooltip, move: moveTooltip, hide: hideTooltip, svgPosition: svgTooltipPosition }),
    bandOrLinear,
    bindTooltip,
    theme: context.chartStyle,
    channelDomain,
    colorScale,
    drawGrid,
    drawLegend,
    drawXAxis,
    drawYAxis,
    easeFor,
    niceExtent,
    position,
    quantitativeDomain,
    quantitativeScale,
    staggerDelay,
    themeValue,
    updateGrid
  };
}

export const DEFAULT_CHART_RUNTIME = createChartRuntime();
