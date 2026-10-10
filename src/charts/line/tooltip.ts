import type { ChartRuntime } from '../../types/index.js';
import { escapeHtml } from '../../runtime/utils.js';
import type { ChartContext, ChannelSpec } from '../../types/index.js';
import type { RenderDatum } from '../../runtime/render-types.js';
import type { LineViewState } from './authoring.js';
import { tooltipIdentityHtml } from '../../runtime/mark-tooltip.js';
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
  seriesField = '',
  service: ChartRuntime['tooltip']
): void {
  service.hide(tooltip);
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

  const hide = () => {
    layer.classed('is-active', false);
    service.hide(tooltip);
  };
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
    showLineTooltip(layer, nearest, spec, xField, yField, seriesField, tooltip, frame, service, chart.innerHeight);
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
  tooltip: HTMLElement,
  frame: SVGGraphicsElement,
  service: ChartRuntime['tooltip'],
  height: number
): void {
  const lines = tooltipLines(point.row, spec, xField, yField, seriesField);
  if (!lines.length) {
    layer.classed('is-active', false);
    service.hide(tooltip);
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

  const position = service.svgPosition(frame, point.x, point.y);
  if (!position) { service.hide(tooltip); return; }
  const content = lines.map(line =>
    line.header ? `<strong>${escapeHtml(line.text)}</strong>` : escapeHtml(line.text)
  ).join('<br>');
  service.show(tooltip, position, [
    content,
    tooltipIdentityHtml(point.row, spec, point.node.getAttribute('data-key'), xField)
  ].filter(Boolean).join('<br>'));
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
