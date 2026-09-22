import type { ChartContext, ChannelSpec } from '../../types/index.js';
import type { RenderDatum } from '../../runtime/marks.js';
import type { LineViewState } from './authoring.js';
import { bisector } from 'd3-array';
import { format } from 'd3-format';
import { pointer, select } from 'd3-selection';
import type { Selection } from 'd3-selection';

interface LineTooltipPoint {
  node: SVGCircleElement;
  row: RenderDatum;
  x: number;
  y: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

/**
 * Line is inspected by x position rather than by requiring a pointer to hit an
 * invisible observation circle. The circles remain the source of truth for
 * current geometry, so the inspector follows seekable transition frames too.
 */
export function drawLineTooltip(
  chart: ChartContext,
  spec: LineViewState,
  tooltip: HTMLElement,
  xField: string,
  yField: string,
  seriesField = ''
): void {
  tooltip.style.opacity = '0';
  chart.g.selectAll<SVGCircleElement, RenderDatum>('circle.vd-line-point')
    .on('mouseenter', null)
    .on('mousemove', null)
    .on('mouseleave', null);

  const enabled = (spec.encoding?.tooltip as unknown) !== false && Boolean(xField && yField);
  const layer = chart.g.selectAll<SVGGElement, null>('g.vd-line-tooltip-layer')
    .data(enabled ? [null] : [])
    .join(
      (enter) => {
        const group = enter.append('g')
          .attr('class', 'vd-line-tooltip-layer');
        group.append('rect').attr('class', 'vd-line-tooltip-hitbox');
        group.append('line').attr('class', 'vd-line-tooltip-rule');
        group.append('circle').attr('class', 'vd-line-tooltip-dot');
        group.append('path').attr('class', 'vd-line-tooltip-tail');
        group.append('rect').attr('class', 'vd-line-tooltip-box');
        group.append('text').attr('class', 'vd-line-tooltip-text');
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );

  if (!enabled) return;

  layer.raise();
  const hitbox = layer.select<SVGRectElement>('rect.vd-line-tooltip-hitbox')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', chart.innerWidth)
    .attr('height', chart.innerHeight)
    .attr('aria-label', 'Inspect nearest line observation');

  const hide = () => layer.classed('is-active', false);
  const inspect = (event: PointerEvent) => {
    const frame = chart.g.node();
    if (!frame) return hide();
    const [pointerX, pointerY] = pointer(event, frame);
    const points = currentLinePoints(chart)
      .filter((point) => point.x >= 0 && point.x <= chart.innerWidth && point.y >= 0 && point.y <= chart.innerHeight)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (!points.length) return hide();

    const nearestIndex = bisector<LineTooltipPoint, number>((point) => point.x).center(points, pointerX);
    const nearestX = points[nearestIndex].x;
    const sameX = points.filter((point) => Math.abs(point.x - nearestX) < 0.75);
    const nearest = sameX.reduce((best, point) =>
      Math.abs(point.y - pointerY) < Math.abs(best.y - pointerY) ? point : best,
    sameX[0]);
    showLineTooltip(layer, nearest, spec, xField, yField, seriesField, chart.innerWidth, chart.innerHeight);
  };

  hitbox
    .on('pointerenter', inspect)
    .on('pointermove', inspect)
    .on('pointerleave', hide);
}

function currentLinePoints(chart: ChartContext): LineTooltipPoint[] {
  return chart.g.selectAll<SVGCircleElement, RenderDatum>('circle.vd-line-point')
    .nodes()
    .map((node) => ({
      node,
      row: select<SVGCircleElement, RenderDatum>(node).datum(),
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    }))
    .filter((point) => point.row && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function showLineTooltip(
  layer: Selection<SVGGElement, null, SVGGElement, unknown>,
  point: LineTooltipPoint,
  spec: LineViewState,
  xField: string,
  yField: string,
  seriesField: string,
  width: number,
  height: number
): void {
  const lines = tooltipLines(point.row, spec, xField, yField, seriesField);
  if (!lines.length) {
    layer.classed('is-active', false);
    return;
  }

  layer.classed('is-active', true);
  layer.select<SVGLineElement>('line.vd-line-tooltip-rule')
    .attr('x1', point.x)
    .attr('x2', point.x)
    .attr('y1', 0)
    .attr('y2', height);
  layer.select<SVGCircleElement>('circle.vd-line-tooltip-dot')
    .attr('cx', point.x)
    .attr('cy', point.y)
    .attr('fill', point.node.getAttribute('fill') || 'currentColor');

  const text = layer.select<SVGTextElement>('text.vd-line-tooltip-text');
  text.selectAll<SVGTSpanElement, { text: string; header: boolean }>('tspan')
    .data(lines)
    .join('tspan')
    .attr('x', 0)
    .attr('dy', (_, index) => index === 0 ? 0 : '1.35em')
    .attr('font-weight', (line) => line.header ? 650 : null)
    .text((line) => line.text);

  const box = text.node()?.getBBox();
  if (!box) return;
  const paddingX = 10;
  const paddingY = 8;
  const boxWidth = Math.ceil(box.width + paddingX * 2);
  const boxHeight = Math.ceil(box.height + paddingY * 2);
  const gap = 15;
  const above = point.y >= boxHeight + gap + 4;
  const boxX = clamp(point.x - boxWidth / 2, 4, Math.max(4, width - boxWidth - 4));
  const boxY = above ? point.y - boxHeight - gap : Math.min(height - boxHeight - 4, point.y + gap);
  const anchorX = clamp(point.x, boxX + 8, boxX + boxWidth - 8);
  const tailY = above ? boxY + boxHeight : boxY;

  layer.select<SVGRectElement>('rect.vd-line-tooltip-box')
    .attr('x', boxX)
    .attr('y', boxY)
    .attr('width', boxWidth)
    .attr('height', boxHeight);
  layer.select<SVGPathElement>('path.vd-line-tooltip-tail')
    .attr('d', `M${anchorX - 5},${tailY}L${point.x},${point.y}L${anchorX + 5},${tailY}Z`);
  text.attr('transform', `translate(${boxX + paddingX - box.x},${boxY + paddingY - box.y})`);
}

function tooltipLines(
  row: RenderDatum,
  spec: LineViewState,
  xField: string,
  yField: string,
  seriesField: string
): Array<{ text: string; header: boolean }> {
  const source = row.__row && typeof row.__row === 'object' ? row.__row : row;
  const value = (field: string) => row[field] ?? source[field];
  const encoding = spec.encoding || {};
  const x = encoding.x || { field: xField };
  const y = encoding.y || { field: yField };
  const tooltip = encoding.tooltip;
  const declared = Array.isArray(tooltip)
    ? tooltip
    : [
        ...(seriesField && value(seriesField) != null
          ? [{ field: seriesField, title: titleize(seriesField) }]
          : []),
        y
      ];
  const details = declared.filter((item) => item.field && item.field !== xField);
  return [
    { text: formatTooltipValue(value(xField), x), header: true },
    ...details.map((item) => ({
      text: `${item.title || titleize(item.field || '')}: ${formatTooltipValue(value(item.field || ''), tooltipChannel(item, x, y))}`,
      header: false
    }))
  ];
}

function tooltipChannel(item: ChannelSpec, x: ChannelSpec, y: ChannelSpec): ChannelSpec {
  if (item.field === x.field) return { ...x, ...item };
  if (item.field === y.field) return { ...y, ...item };
  return item;
}

function formatTooltipValue(value: unknown, channel: ChannelSpec): string {
  if (value instanceof Date) return DATE_FORMAT.format(value);
  if (channel.type === 'temporal' && (typeof value === 'string' || typeof value === 'number')) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return DATE_FORMAT.format(date);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return channel.format ? format(channel.format)(value) : value.toLocaleString();
  }
  return String(value ?? '');
}

function titleize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
