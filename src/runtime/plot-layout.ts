import type { MarginSpec, EncodingSpec, ChartViewport } from '../types/index.js';
import type { RenderContext } from './render-types.js';
import type { ThemeValue } from './theme.js';
import type { createColors } from './colors.js';
import { legendDomain, legendLabel, legendLayout } from './legend-layout.js';
import type { ChartStyleRule } from '../charts/style.js';
import { format } from 'd3-format';
import { createTextMeasure } from './text-measure.js';

export function createPlotLayout(context: RenderContext, themeValue: ThemeValue, colors: ReturnType<typeof createColors>) {
  return (channels: EncodingSpec, viewport: ChartViewport, plot: Readonly<ChartStyleRule>): MarginSpec => {
    const measure = createTextMeasure(context, themeValue);
    const measureTick = createTextMeasure(context, themeValue, '--vd-axis-font-size');
    const { width, height, rows } = viewport;
    const preferred = plot.margin;
    const margin = { ...preferred };
    // Compress decorative whitespace, not type. Horizontal and vertical budgets
    // respond independently; a short wide chart must not lose its y-label space.
    const font = themeValue('--vd-axis-font-size', 10);
    const title = themeValue('--vd-axis-title-font-size', 11);
    const padding = font * 1.2;
    const { x, y } = channels;
    const tickLabel = y?.type === 'quantitative' ? format(y.format || '~g') : String;
    const tickWidth = y?.field ? rows.reduce((max, row) => Math.max(max, measureTick(tickLabel(row[y.field!] as number))), 0) : 0;
    const floors = {
      left: y ? Math.max(font * 2, tickWidth + padding) + (!plot.edgeTitles && y.title ? title * 2 : 0) : padding,
      right: padding,
      top: plot.edgeTitles && y?.title ? title * 2 + padding : padding,
      bottom: x ? font * 2 + (x.title ? title + padding : padding) : padding
    };
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const length = side === 'left' || side === 'right' ? width : height;
      const pair = side === 'left' || side === 'right'
        ? preferred.left + preferred.right : preferred.top + preferred.bottom;
      // Default empty space has a 20% budget per dimension. Text has priority.
      margin[side] = Math.max(floors[side], preferred[side] * Math.min(1, length * 0.2 / Math.max(1, pair)));
    }
    const active = colors.resolveColorChannel(rows, channels.color);
    if (!active || active.value) return margin;
    const channel = active.hue?.field ? active.hue : active.luminance?.field ? active.luminance : active;
    if (!channel.field) return margin;
    const labels = legendDomain(rows, channel).map(value => legendLabel(value, channel));
    const swatch = themeValue('--vd-legend-swatch-size', 9);
    const inset = context.chartStyle?.legendInset ?? { top: 8, left: 8 };
    const side = legendLayout(labels, 1, swatch, measure);
    const right = Math.max(margin.right, side.width + inset.left);
    // A side legend is optional chrome; keep at least 60% of the width for data.
    if (context.chartStyle?.legendPosition === 'right' && width - margin.left - right >= width * 0.6) {
      margin.right = right;
    } else {
      const top = legendLayout(labels, Math.max(1, width - margin.left - margin.right - inset.left), swatch, measure);
      // Preserve the space between the plot and its title below the legend.
      margin.top = Math.max(margin.top, inset.top + top.height + 28);
    }
    return margin;
  };
}
