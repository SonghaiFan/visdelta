import { showTooltip, moveTooltip, hideTooltip } from './tooltip.js';
import { escapeHtml, titleize } from './utils.js';
import type { BaseType, Selection } from 'd3-selection';
import type { ViewSpec } from '../types/index.js';
import type { RenderDatum } from './render-types.js';
import { specDatumKey, specObjectKey } from '../spec-meta.js';
import type { MarkKeySpec } from '../identity/mark-correspondence.js';

export function bindTooltip<E extends Element, D extends object, P extends BaseType, PD>(
  selection: Selection<E, D, P, PD>,
  spec: ViewSpec,
  tooltip: HTMLElement
): void {
  // Any bound datum is read as a row: its `__row` when present, else its own
  // plain fields. d3 types the generic element's pointer events as CustomEvent | MouseEvent.
  selection
    .on('mouseenter', (event, row) => {
      const node = event.currentTarget as Element;
      const html = tooltipHtml(row as RenderDatum, spec, node.getAttribute('data-key'));
      if (html) showTooltip(tooltip, event as MouseEvent, html);
    })
    .on('mousemove', (event) => moveTooltip(tooltip, event as MouseEvent))
    .on('mouseleave', () => hideTooltip(tooltip));
}

function tooltipHtml(row: RenderDatum, spec: ViewSpec, markKey: string | null): string {
  const tooltipSpec: unknown = spec.encoding?.tooltip;
  if (tooltipSpec === false) return '';
  const source = row?.__row && typeof row.__row === 'object' ? row.__row : row;
  const items = Array.isArray(tooltipSpec)
    ? tooltipSpec
    : Object.keys(source || {})
        .filter((field) => !field.startsWith('__') && (source[field] == null || typeof source[field] !== 'object'))
        .map((field) => ({ field, title: titleize(field) }));
  const content = items
    .map((item) => `<strong>${escapeHtml(item.title || titleize(item.field))}</strong>: ${escapeHtml(source[item.field])}`)
    .join('<br>');
  return [content, tooltipIdentityHtml(row, spec, markKey)]
    .filter(Boolean).join('<br>');
}

/** Shared identity diagnostics used by both direct-mark and nearest-mark tooltips. */
export function tooltipIdentityHtml(
  row: RenderDatum,
  spec: ViewSpec,
  markKey: string | null,
  defaultMarkKey: MarkKeySpec | null = null
): string {
  const source = row?.__row && typeof row.__row === 'object' ? row.__row : row;
  const datumIdentity = row?.__datumIdentity ?? (source as RenderDatum)?.__datumIdentity;
  const identity = (label: string, key: MarkKeySpec | null, actual?: string | null) => {
    const fields = key == null ? [] : Array.isArray(key) ? key : [key];
    const values = fields.map(field => source[field]);
    const value = actual ?? (fields.length && values.every(value => value != null)
      ? JSON.stringify(values.length === 1 ? values[0] : values)
      : fields.length ? 'unavailable at this grain' : 'not declared');
    const declaration = fields.length ? ` (${fields.join(', ')})` : '';
    return `<strong>${label}${escapeHtml(declaration)}</strong>: ${escapeHtml(value)}`;
  };
  return [
    datumIdentity
      ? datumIdentityHtml(datumIdentity)
      : identity('datumKey', specDatumKey(spec)),
    identity('key', specObjectKey(spec) ?? defaultMarkKey, markKey)
  ].join('<br>');
}

function datumIdentityHtml(identity: NonNullable<RenderDatum['__datumIdentity']>): string {
  const fields = identity.fields.length
    ? identity.fields.join(', ')
    : 'auto index';
  const decoded = identity.keys.map((key) => decodeCompoundDatumKey(key, identity.fields.length));
  const value = decoded.length === 1 ? decoded[0] : decoded;
  return `<strong>datumKey (${escapeHtml(fields)})</strong>: ${escapeHtml(JSON.stringify(value))}`;
}

function decodeCompoundDatumKey(key: unknown, fieldCount: number): unknown {
  if (fieldCount <= 1 || typeof key !== 'string') return key;
  try {
    const parsed = JSON.parse(key);
    return Array.isArray(parsed) ? parsed : key;
  } catch {
    return key;
  }
}
