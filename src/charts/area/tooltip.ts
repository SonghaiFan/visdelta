import type { ChartRuntime } from '../../types/index.js';
import { escapeHtml } from '../../runtime/utils.js';
import type { ChartContext, ChannelSpec } from '../../types/index.js';
import type { RenderDatum } from '../../runtime/render-types.js';
import type { AreaViewState } from './authoring.js';
import type { AreaCell } from './state.js';
import { bisector } from 'd3-array';
import { format } from 'd3-format';
import { pointer, select } from 'd3-selection';
import type { Selection } from 'd3-selection';

interface AreaTooltipBand {
  cell: AreaCell;
  row: RenderDatum;
  x: number;
  y0: number;
  y1: number;
  top: number;
  bottom: number;
  fill: string;
  opacity: number;
  order: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

/**
 * Area is inspected as a vertical band, not as a generic mark. The full plot
 * finds the nearest x observation, then pointer y selects the stacked layer.
 */
export function drawAreaTooltip(
  chart: ChartContext,
  spec: AreaViewState,
  tooltip: HTMLElement,
  xField: string,
  yField: string,
  seriesField = '',
  service: ChartRuntime['tooltip']
): void {
  service.hide(tooltip);
  chart.g.selectAll<SVGPathElement, AreaCell>('path.vd-area')
    .on('mouseenter', null)
    .on('mousemove', null)
    .on('mouseleave', null);

  const enabled = (spec.encoding?.tooltip as unknown) !== false && Boolean(xField && yField);
  const layer = chart.g.selectAll<SVGGElement, null>('g.vd-area-tooltip-layer')
    .data(enabled ? [null] : [])
    .join(
      (enter) => {
        const group = enter.append('g').attr('class', 'vd-area-tooltip-layer');
        group.append('rect').attr('class', 'vd-area-tooltip-hitbox');
        group.append('line').attr('class', 'vd-area-tooltip-rule');
        group.append('circle').attr('class', 'vd-area-tooltip-dot vd-area-tooltip-dot-y0');
        group.append('circle').attr('class', 'vd-area-tooltip-dot vd-area-tooltip-dot-y1');
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );

  if (!enabled) return;

  layer.raise();
  const hitbox = layer.select<SVGRectElement>('rect.vd-area-tooltip-hitbox')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', chart.innerWidth)
    .attr('height', chart.innerHeight)
    .attr('aria-label', 'Inspect nearest area band');

  const hide = () => {
    layer.classed('is-active', false);
    service.hide(tooltip);
  };
  const inspect = (event: PointerEvent) => {
    const frame = chart.g.node();
    if (!frame) return hide();
    const [pointerX, pointerY] = pointer(event, frame);
    const bands = currentAreaBands(chart)
      .filter((band) => band.x >= 0 && band.x <= chart.innerWidth &&
        band.bottom >= 0 && band.top <= chart.innerHeight && band.opacity > 0.01)
      .sort((a, b) => a.x - b.x || a.order - b.order);
    if (!bands.length) return hide();

    const nearestIndex = bisector<AreaTooltipBand, number>((band) => band.x).center(bands, pointerX);
    const nearestX = bands[nearestIndex].x;
    const sameX = bands.filter((band) => Math.abs(band.x - nearestX) < 0.75);
    const containing = sameX.filter((band) => pointerY >= band.top && pointerY <= band.bottom);
    const candidates = containing.length ? containing : sameX;
    const nearest = candidates.reduce((best, band) =>
      bandDistance(band, pointerY) <= bandDistance(best, pointerY) ? band : best
    );
    showAreaTooltip(
      layer, nearest, spec, xField, yField, seriesField,
      tooltip, frame, service, chart.innerHeight
    );
  };

  hitbox
    .on('pointerenter', inspect)
    .on('pointermove', inspect)
    .on('pointerleave', hide);
}

function currentAreaBands(chart: ChartContext): AreaTooltipBand[] {
  const pathByKey = new Map(
    chart.g.selectAll<SVGPathElement, AreaCell>('path.vd-area').nodes().map((node) => {
      const cell = select<SVGPathElement, AreaCell>(node).datum();
      return [cell?.key, node] as const;
    })
  );
  return chart.g.selectAll<SVGLineElement, AreaCell>('line.vd-area-observation')
    .nodes()
    .map((node, order) => {
      const cell = select<SVGLineElement, AreaCell>(node).datum();
      const path = pathByKey.get(cell?.key);
      const y0 = Number(node.getAttribute('y2'));
      const y1 = Number(node.getAttribute('y1'));
      const opacity = path ? Number.parseFloat(getComputedStyle(path).opacity || '1') : 0;
      return {
        cell,
        row: cell?.row as RenderDatum,
        x: Number(node.getAttribute('x1')),
        y0,
        y1,
        top: Math.min(y0, y1),
        bottom: Math.max(y0, y1),
        fill: path?.getAttribute('fill') || node.getAttribute('stroke') || 'currentColor',
        opacity: Number.isFinite(opacity) ? opacity : 1,
        order
      };
    })
    .filter((band) => band.cell && band.row && Number.isFinite(band.x) &&
      Number.isFinite(band.y0) && Number.isFinite(band.y1));
}

function bandDistance(band: AreaTooltipBand, y: number): number {
  if (y >= band.top && y <= band.bottom) return -band.opacity - band.order * 1e-6;
  return Math.min(Math.abs(y - band.top), Math.abs(y - band.bottom));
}

function showAreaTooltip(
  layer: Selection<SVGGElement, null, SVGGElement, unknown>,
  band: AreaTooltipBand,
  spec: AreaViewState,
  xField: string,
  yField: string,
  seriesField: string,
  tooltip: HTMLElement,
  frame: SVGGraphicsElement,
  service: ChartRuntime['tooltip'],
  height: number
): void {
  const lines = tooltipLines(band, spec, xField, yField, seriesField);
  if (!lines.length) {
    layer.classed('is-active', false);
    service.hide(tooltip);
    return;
  }

  layer.classed('is-active', true);
  const top = clamp(band.top, 0, height);
  const bottom = clamp(band.bottom, 0, height);
  layer.select<SVGLineElement>('line.vd-area-tooltip-rule')
    .attr('x1', band.x).attr('x2', band.x).attr('y1', 0).attr('y2', height);
  layer.select<SVGCircleElement>('circle.vd-area-tooltip-dot-y0')
    .attr('cx', band.x).attr('cy', band.y0).attr('fill', band.fill);
  layer.select<SVGCircleElement>('circle.vd-area-tooltip-dot-y1')
    .attr('cx', band.x).attr('cy', band.y1).attr('fill', band.fill);

  const position = service.svgPosition(frame, band.x, (top + bottom) / 2);
  if (!position) { service.hide(tooltip); return; }
  service.show(tooltip, position, lines.map(line =>
    line.header ? `<strong>${escapeHtml(line.text)}</strong>` : escapeHtml(line.text)
  ).join('<br>'));
}

function tooltipLines(
  band: AreaTooltipBand,
  spec: AreaViewState,
  xField: string,
  yField: string,
  seriesField: string
): Array<{ text: string; header: boolean }> {
  const row = band.row;
  const source = row.__row && typeof row.__row === 'object' ? row.__row : row;
  const value = (field: string) => row[field] ?? source[field];
  const encoding = spec.encoding || {};
  const x = encoding.x || { field: xField };
  const y = encoding.y || { field: yField };
  const declared = Array.isArray(encoding.tooltip) ? encoding.tooltip : encoding.tooltip ? [encoding.tooltip] : [];
  const details: ChannelSpec[] = [
    y,
    ...declared.filter((item) => item.field && ![xField, yField, seriesField].includes(item.field))
  ];
  const seriesValue = seriesField ? value(seriesField) : null;
  return [
    { text: formatTooltipValue(value(xField), x), header: true },
    ...(seriesValue != null ? [{ text: String(seriesValue), header: true }] : []),
    ...details.map((item) => ({
      text: `${item.title || titleize(item.field || '')}: ${formatTooltipValue(
        item.field === yField && value(yField) == null
          ? Math.abs(band.cell.center.y1 - band.cell.center.y0)
          : value(item.field || ''),
        tooltipChannel(item, x, y)
      )}`,
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
