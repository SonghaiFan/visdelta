import { select } from 'd3-selection';
import type { AxisElement, SvgSelection, RuntimeScale, RenderChartContext, EdgeTitleInset } from './render-types.js';
export function alignEdgeTickLabels(
  axisGroup: SvgSelection<AxisElement>,
  scale: RuntimeScale
): void {
  if (typeof scale.bandwidth === 'function' || typeof scale.range !== 'function') return;
  const range = scale.range();
  const min = Math.min(...range), max = Math.max(...range);
  axisGroup.selectAll<SVGGElement, unknown>('.tick').each(function(this: SVGGElement) {
    const tick = select(this);
    const match = (tick.attr('transform') || '').match(/translate\(([-\d.]+)/);
    if (!match) return;
    const x = Number(match[1]);
    const text = tick.select('text');
    if (Math.abs(x - min) <= 1) text.attr('text-anchor', 'start').attr('dx', '0.15em');
    else if (Math.abs(x - max) <= 1) text.attr('text-anchor', 'end').attr('dx', '-0.15em');
    else text.attr('text-anchor', 'middle').attr('dx', null);
  });
}

/**
 * D3 ticks optimize for round, evenly spaced labels and may omit the actual
 * observations at either end. Keep data endpoints first, then admit ordinary
 * ticks only when they have enough screen distance from those endpoints.
 */
export function prioritizedContinuousTicks(scale: RuntimeScale, count: number, minSpacing: number): unknown[] {
  const ordinary = typeof scale.ticks === 'function' ? scale.ticks(count) : scale.domain();
  const scaleDomain = scale.domain().map((value) => Number(value));
  const domainMin = Math.min(...scaleDomain);
  const domainMax = Math.max(...scaleDomain);
  const endpoints = Array.isArray(scale.__visDeltaDataDomain)
    ? scale.__visDeltaDataDomain.filter((value) => {
        const number = Number(value);
        return value != null && Number.isFinite(number) && number >= domainMin && number <= domainMax;
      })
    : [];
  if (!endpoints.length) return ordinary;
  const valueKey = (value: unknown) => value instanceof Date ? value.getTime() : Number(value);
  const uniqueEndpoints = [...new Map(endpoints.map((value) => [valueKey(value), value])).values()];
  const accepted = [...uniqueEndpoints];
  for (const tick of ordinary) {
    const duplicate = accepted.some((value) => valueKey(value) === valueKey(tick));
    const crowded = uniqueEndpoints.some((value) => Math.abs((scale(value) as number) - (scale(tick) as number)) < minSpacing);
    if (!duplicate && !crowded) accepted.push(tick);
  }
  return accepted.sort((a, b) => (scale(a) as number) - (scale(b) as number));
}

export function axisKind(placement: string, scale: RuntimeScale): string {
  return `${placement}:${typeof scale.bandwidth === 'function' ? 'band' : 'continuous'}`;
}

export function axisIsEntering(axisGroup: SvgSelection<AxisElement>): boolean {
  const node = axisGroup.node();
  return !node?.__visDeltaAxisActive;
}

export function activeAxisSide(
  axisGroup: SvgSelection<AxisElement>,
  fallback: 'top' | 'right' | 'bottom' | 'left'
): 'top' | 'right' | 'bottom' | 'left' {
  const side = String(axisGroup.node()?.__visDeltaAxisKind || '').split(':')[0];
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return sides.includes(side as (typeof sides)[number]) ? side as (typeof sides)[number] : fallback;
}

export function activeHorizontalAxisSide(
  axisGroup: SvgSelection<AxisElement>,
  fallback: 'top' | 'bottom'
): 'top' | 'bottom' {
  const side = activeAxisSide(axisGroup, fallback);
  return side === 'top' || side === 'bottom' ? side : fallback;
}

export function axisSideTransform(
  chart: RenderChartContext,
  side: 'top' | 'right' | 'bottom' | 'left',
  outside: boolean
): string {
  if (side === 'top') return `translate(${chart.margin.left},${outside ? 0 : chart.margin.top})`;
  if (side === 'right') {
    return `translate(${outside ? chart.width : chart.margin.left + chart.innerWidth},${chart.margin.top})`;
  }
  if (side === 'left') return `translate(${outside ? 0 : chart.margin.left},${chart.margin.top})`;
  return `translate(${chart.margin.left},${outside ? chart.height : chart.margin.top + chart.innerHeight})`;
}

export function axisPositionTransform(
  chart: RenderChartContext,
  side: 'top' | 'right' | 'bottom' | 'left',
  position: number | undefined
): string {
  if (!Number.isFinite(position)) return axisSideTransform(chart, side, false);
  if (side === 'top' || side === 'bottom') {
    return `translate(${chart.margin.left},${chart.margin.top + position!})`;
  }
  return `translate(${chart.margin.left + position!},${chart.margin.top})`;
}

export function xLabelSideY(
  chart: RenderChartContext,
  side: 'top' | 'bottom',
  outside: boolean,
  offset: number
): number {
  if (side === 'top') return outside ? 0 : chart.margin.top - offset;
  return outside ? chart.height : chart.margin.top + chart.innerHeight + offset;
}

interface LabelTarget { attr(name: string, value: string | number | null): LabelTarget }

export function placeYLabel<Label extends LabelTarget>(
  label: Label,
  chart: RenderChartContext,
  side: 'right' | 'left',
  offset: number,
  outside: boolean
) : Label {
  const target = label;
  if (side === 'right') {
    target
      .attr('x', chart.innerHeight / 2)
      .attr('y', outside ? -chart.margin.right : -offset)
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${chart.margin.left + chart.innerWidth},${chart.margin.top}) rotate(90)`);
    return label;
  }
  target
    .attr('x', -chart.innerHeight / 2)
    .attr('y', outside ? 0 : chart.margin.left - offset)
    .attr('text-anchor', 'middle')
    .attr('transform', `translate(0,${chart.margin.top}) rotate(-90)`);
  return label;
}

export function placeEdgeXLabel<Label extends LabelTarget>(label: Label, chart: RenderChartContext, inset: Readonly<EdgeTitleInset>): Label {
  label
    .attr('text-anchor', 'end')
    .attr('x', chart.margin.left + chart.innerWidth - inset.right)
    .attr('y', chart.height - inset.bottom)
    .attr('transform', null);
  return label;
}

export function placeEdgeYLabel<Label extends LabelTarget>(label: Label, chart: RenderChartContext, inset: Readonly<EdgeTitleInset>): Label {
  label
    .attr('text-anchor', 'start')
    .attr('x', chart.margin.left + inset.left)
    .attr('y', chart.margin.top - inset.top)
    .attr('transform', null);
  return label;
}
