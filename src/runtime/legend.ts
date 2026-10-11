import { motion } from './recorder.js';
import { legendEntries, legendLayout } from './legend-layout.js';
import { createTextMeasure } from './text-measure.js';
import type { RenderContext, RenderChartContext, RenderDatum, RenderChannel } from './render-types.js';
import type { ThemeValue } from './theme.js';
import type { createColors } from './colors.js';
export function createLegend(context: RenderContext, themeValue: ThemeValue, colors: ReturnType<typeof createColors>) {
  const { resolveColorChannel, colorScale } = colors;
  function drawLegend(
    chart: RenderChartContext,
    rows: RenderDatum[],
    channel: RenderChannel | undefined
  ): void {
    const measure = createTextMeasure(context, themeValue);
    const colorRows = chart.domainRows?.length ? chart.domainRows : rows;
    const activeChannel = resolveColorChannel(colorRows, channel);
    if (!activeChannel || activeChannel.value || (!activeChannel.field && !activeChannel.hue && !activeChannel.luminance)) {
      motion(chart.scene.legend, chart.transition.base).style('opacity', 0);
      return;
    }
    const legendChannel = activeChannel.hue?.field
      ? activeChannel.hue
      : activeChannel.luminance?.field
        ? activeChannel.luminance
        : activeChannel;
    const legendField = legendChannel.field!;
    const entries = legendEntries(colorRows, legendChannel);
    const scale = colorScale(colorRows, activeChannel);
    const legendRow = (value: unknown): RenderDatum => ({ [legendField]: value });
    const swatchSize = themeValue('--vd-legend-swatch-size', 9);
    const swatchRadius = themeValue('--vd-legend-swatch-radius', 1.5);
    const legendInset = context.chartStyle?.legendInset ?? { top: 8, left: 8 };
    const labels = entries.map(entry => entry.label);
    const sideWidth = legendLayout(labels, 1, swatchSize, measure).width + legendInset.left;
    const atRight = context.chartStyle?.legendPosition === 'right' && chart.margin.right >= sideWidth;
    const layout = legendLayout(
      labels,
      atRight ? 1 : Math.max(1, chart.innerWidth - legendInset.left),
      swatchSize,
      measure
    );
    const legend = chart.scene.legend.style('opacity', 1)
      .attr('data-position', atRight ? 'right' : 'top')
      .attr('transform', `translate(${chart.margin.left + legendInset.left + (atRight ? chart.innerWidth : 0)},${legendInset.top + (atRight ? chart.margin.top : 0)})`);
    const items = legend.selectAll<SVGGElement, unknown>('g.vd-legend-item').data(entries.map(entry => entry.value), (value) => String(value));
    const entered = items.enter().append('g').attr('class', 'vd-legend-item').style('opacity', 0);
    entered.append('rect').attr('width', swatchSize).attr('height', swatchSize).attr('rx', swatchRadius);
    entered.append('text').attr('x', swatchSize + 6).attr('y', swatchSize - 0.5);
    motion(items.merge(entered), chart.transition.base).style('opacity', 1)
      .attr('transform', (_, index) => {
        const item = layout.items[index];
        return `translate(${item.x},${item.y})`;
      });
    motion(items.merge(entered).select<SVGRectElement>('rect'), chart.transition.base)
      .attr('fill', (value) => scale(legendRow(value)));
    items.merge(entered).select('text').text((_value, index) => labels[index]);
    motion(items.exit<unknown>(), chart.transition.base).style('opacity', 0).remove();
  }

  return drawLegend;
}
