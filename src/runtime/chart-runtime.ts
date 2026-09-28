import type { RenderContext } from './render-types.js';
import { createThemeValue } from './theme.js';
import { createColors } from './colors.js';
import { createAxes } from './axes.js';
import { createGrid } from './grid.js';
import { createLegend } from './legend.js';
import { createPlotLayout } from './plot-layout.js';
import { bindTooltip } from './mark-tooltip.js';
import { motion } from './recorder.js';
import { showTooltip, moveTooltip, hideTooltip, svgTooltipPosition } from './tooltip.js';

export type ChartRuntime = ReturnType<typeof createChartRuntime>;

/** Assemble host-scoped services. Pure construction tools are imported directly. */
export function createChartRuntime(context: RenderContext = {}) {
  const themeValue = createThemeValue(context);
  const colors = createColors(context, themeValue);
  return {
    motion,
    theme: context.chartStyle,
    themeValue,
    tooltip: Object.freeze({ show: showTooltip, move: moveTooltip, hide: hideTooltip, svgPosition: svgTooltipPosition }),
    bindTooltip,
    colorScale: colors.colorScale,
    layoutMargins: createPlotLayout(context, themeValue, colors),
    drawLegend: createLegend(context, themeValue, colors),
    ...createAxes(themeValue),
    ...createGrid(themeValue)
  };
}

export const DEFAULT_CHART_RUNTIME = createChartRuntime();
