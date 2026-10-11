import type { ChartViewport, MarginSpec, ViewSpec } from '../types/index.js';
import type { FacetLayout } from '../facet.js';
export function validateFacetLayout(layout: FacetLayout): void {
  if (layout.autoHeight != null && typeof layout.autoHeight !== 'boolean') throw new Error('Facet autoHeight must be boolean.');
  if (layout.minHeight != null && (!Number.isFinite(layout.minHeight) || layout.minHeight <= 0)) throw new Error('Facet minHeight must be positive and finite.');
  if (layout.direction != null && !['x', 'y', 'grid'].includes(layout.direction)) throw new Error('Facet direction must be x, y or grid.');
  if (layout.scales != null && !['shared', 'independent'].includes(layout.scales)) throw new Error('Facet scales must be shared or independent.');
  if (layout.columns != null && (!Number.isInteger(layout.columns) || layout.columns < 1)) throw new Error('Facet columns must be a positive integer.');
  if (layout.gap != null && (!Number.isFinite(layout.gap) || layout.gap < 0)) throw new Error('Facet gap must be finite and nonnegative.');
  if (layout.minWidth != null && (!Number.isFinite(layout.minWidth) || layout.minWidth <= 0)) throw new Error('Facet minWidth must be positive and finite.');
}

export function facetColumns(layout: FacetLayout, count: number, width: number): number {
  const gap = layout.gap ?? 24;
  return layout.direction === 'y' ? 1 : layout.direction === 'x' ? Math.max(1, count) : Math.max(1, Math.min(count || 1, layout.columns ?? 2, Math.floor((width + gap) / ((layout.minWidth ?? 240) + gap)) || 1));
}

/** Opt-in content height; fixed authored/runtime heights take priority at the caller. */
export function facetDefaultHeight(spec: ViewSpec, viewport: ChartViewport, margin: Partial<MarginSpec>): number {
  const layout = (spec.facetLayout ?? {}) as FacetLayout;
  const field = spec.encoding?.facet?.field;
  if (!field || !layout.autoHeight) return viewport.height;
  const count = new Set(viewport.rows.map(row => JSON.stringify([typeof row[field], row[field]]))).size;
  const columns = facetColumns(layout, count, Math.max(1, viewport.width - (margin.left ?? 0) - (margin.right ?? 0)));
  const rowCount = Math.max(1, Math.ceil(count / columns));
  return Math.max(viewport.height, rowCount * (layout.minHeight ?? 240) + (rowCount - 1) * (layout.gap ?? 24) + (margin.top ?? 0) + (margin.bottom ?? 0));
}
