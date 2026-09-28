import { showTooltip, moveTooltip, hideTooltip } from './tooltip.js';
import { escapeHtml, titleize } from './utils.js';
import type { BaseType, Selection } from 'd3-selection';
import type { ViewSpec } from '../types/index.js';
import type { RenderDatum } from './render-types.js';
export function bindTooltip<E extends Element, D extends object, P extends BaseType, PD>(
  selection: Selection<E, D, P, PD>,
  spec: ViewSpec,
  tooltip: HTMLElement
): void {
  // Any bound datum is read as a row: its `__row` when present, else its own
  // plain fields. d3 types the generic element's pointer events as CustomEvent | MouseEvent.
  selection
    .on('mouseenter', (event, row) => { const html = tooltipHtml(row as RenderDatum, spec.encoding?.tooltip); if (html) showTooltip(tooltip, event as MouseEvent, html); })
    .on('mousemove', (event) => moveTooltip(tooltip, event as MouseEvent))
    .on('mouseleave', () => hideTooltip(tooltip));
}

function tooltipHtml(row: RenderDatum, tooltipSpec: unknown): string {
  if (tooltipSpec === false) return '';
  const source = row?.__row && typeof row.__row === 'object' ? row.__row : row;
  const items = Array.isArray(tooltipSpec)
    ? tooltipSpec
    : Object.keys(source || {})
        .filter((field) => !field.startsWith('__') && (source[field] == null || typeof source[field] !== 'object'))
        .map((field) => ({ field, title: titleize(field) }));
  return items
    .map((item) => `<strong>${escapeHtml(item.title || titleize(item.field))}</strong>: ${escapeHtml(source[item.field])}`)
    .join('<br>');
}
