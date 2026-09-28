import { ticks } from 'd3-array';
import { format } from 'd3-format';
import { channelDomain, quantitativeDomain } from '../toolkit/scales.js';
import type { RenderChannel, RenderDatum } from './render-types.js';

export function legendDomain(rows: RenderDatum[], channel: RenderChannel): unknown[] {
  if (channel.type !== 'quantitative') return channelDomain(rows, channel);
  const [min, max] = quantitativeDomain(rows, channel);
  return min === max ? [min] : ticks(min, max, 3);
}

export function legendLabel(value: unknown, channel: RenderChannel): string {
  return channel.type === 'quantitative' ? format('~g')(Number(value)) : String(value);
}

/** Shared by space allocation and drawing, so wrapping never disagrees with margins. */
export function legendLayout(labels: string[], availableWidth: number, swatch: number, measure: (text: string) => number) {
  const rowHeight = Math.max(18, swatch + 7);
  let x = 0, row = 0;
  const widths = labels.map(label => Math.max(30, measure(label) + swatch + 18));
  const items = widths.map(width => {
    if (x > 0 && x + width > availableWidth) { row++; x = 0; }
    const item = { x, y: row * rowHeight };
    x += width;
    return item;
  });
  return { items, height: labels.length ? (row + 1) * rowHeight : 0, width: Math.max(0, ...widths) };
}
