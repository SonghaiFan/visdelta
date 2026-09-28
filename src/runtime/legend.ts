import { scaleOrdinal } from 'd3-scale';
import type { AxisDomain } from 'd3-axis';
import { motion } from './recorder.js';
import { legendDomain, legendLabel, legendLayout } from './legend-layout.js';
import { createTextMeasure } from './text-measure.js';
import type { RenderContext, RenderChartContext, RenderDatum, RenderChannel } from './render-types.js';
import type { ThemeValue } from './theme.js';
import type { createColors } from './colors.js';
export function createLegend(context: RenderContext, themeValue: ThemeValue, colors: ReturnType<typeof createColors>) {
  const { resolveColorChannel, compositeColorScale, quantitativeColorScale, colorRange, schemeRange, categoricalRange, themeColor, fallbackColor: DEFAULT_LUMINANCE_BASE } = colors;
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
    const quantitativeLegend = legendChannel.type === 'quantitative';
    const domain = legendDomain(colorRows, legendChannel);
    const fieldRegistry = !activeChannel.range && !activeChannel.hue && !activeChannel.luminance && !quantitativeLegend
      ? context.colors?.get(legendField)
      : null;
    const scale = activeChannel.hue || activeChannel.luminance
      ? compositeColorScale(activeChannel)
      : quantitativeLegend
        ? quantitativeColorScale(colorRows, legendChannel)
        : fieldRegistry
          ? (value: unknown) => fieldRegistry.get(String(value)) ?? themeColor(DEFAULT_LUMINANCE_BASE)
          : scaleOrdinal<AxisDomain, string>(colorRange(activeChannel.range || schemeRange(activeChannel.scheme, domain.length) || categoricalRange(domain)))
              .domain(domain as AxisDomain[]);
    const legendRow = (value: unknown): RenderDatum => ({ [legendField]: value });
    const swatchSize = themeValue('--vd-legend-swatch-size', 9);
    const swatchRadius = themeValue('--vd-legend-swatch-radius', 1.5);
    const legendInset = context.chartStyle?.legendInset ?? { top: 8, left: 8 };
    const labels = domain.map(value => legendLabel(value, legendChannel));
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
    const items = legend.selectAll<SVGGElement, unknown>('g.vd-legend-item').data(domain, (value) => String(value));
    const entered = items.enter().append('g').attr('class', 'vd-legend-item').style('opacity', 0);
    entered.append('rect').attr('width', swatchSize).attr('height', swatchSize).attr('rx', swatchRadius);
    entered.append('text').attr('x', swatchSize + 6).attr('y', swatchSize - 0.5);
    motion(items.merge(entered), chart.transition.base).style('opacity', 1)
      .attr('transform', (_, index) => {
        const item = layout.items[index];
        return `translate(${item.x},${item.y})`;
      });
    motion(items.merge(entered).select<SVGRectElement>('rect'), chart.transition.base)
      .attr('fill', (value) => activeChannel.hue || activeChannel.luminance
        ? scale(legendRow(value) as RenderDatum & AxisDomain)
        : scale(value as RenderDatum & AxisDomain));
    items.merge(entered).select('text').text((value) => legendLabel(value, legendChannel));
    motion(items.exit<unknown>(), chart.transition.base).style('opacity', 0).remove();
  }

  return drawLegend;
}
