import { createMarkHelpers } from './marks.js';
import type { RenderContext } from './marks.js';
import { escapeHtml } from './utils.js';

export type ChartRuntimeDeps = ReturnType<typeof createChartRuntimeDeps>;

export function createChartRuntimeDeps(context: RenderContext = {}) {
  const { bandOrLinear, bindTooltip, channelDomain, colorScale, drawGrid, drawLegend, drawXAxis, drawYAxis, easeFor, fadeNonBarShapes, fadeNonLineShapes, fadeNonPointShapes, fadeNonUnitShapes, hideTooltip, moveTooltip, niceExtent, position, quantitativeDomain, quantitativeScale, showTooltip, staggerDelay, themeValue, updateGrid } = createMarkHelpers(context);
  return {
    bandOrLinear,
    bindTooltip,
    chartStyle: context.chartStyle,
    channelDomain,
    colorScale,
    drawGrid,
    drawLegend,
    drawXAxis,
    drawYAxis,
    easeFor,
    escapeHtml,
    fadeNonBarShapes,
    fadeNonLineShapes,
    fadeNonPointShapes,
    fadeNonUnitShapes,
    hideTooltip,
    moveTooltip,
    niceExtent,
    position,
    quantitativeDomain,
    quantitativeScale,
    showTooltip,
    staggerDelay,
    themeValue,
    updateGrid
  };
}

export const CHART_RUNTIME_DEPS = createChartRuntimeDeps();
