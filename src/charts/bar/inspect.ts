import type { DistributionOptions } from './layout/distribution.js';
import { distributionOptions, validateDistributionOptions } from './layout/distribution.js';
import { semanticBarState } from './semantic.js';
import type { BarLayout, BarOrientation, ViewSpec } from '../../types/index.js';

export interface BarSpecInspection {
  /** Declaration facts only: this does not validate data or observe rendered pixels. */
  status: 'known' | 'unknown';
  layout: BarLayout | null;
  distribution: DistributionOptions | null;
  orientation: BarOrientation | null;
  categoryField: string | null;
  measureField: string | null;
  segmentField: string | null;
  offsetChannel: 'xOffset' | 'yOffset' | null;
  diagnostics: Array<{ path: string; message: string }>;
}

/** Inspect a compiled/public Bar spec using the renderer's own semantic model. */
export function inspectBarSpec(spec: ViewSpec): BarSpecInspection {
  const unknown = (path: string, message: string): BarSpecInspection => ({
    status: 'unknown', layout: null, distribution: null, orientation: null, categoryField: null,
    measureField: null, segmentField: null, offsetChannel: null, diagnostics: [{ path, message }]
  });
  if (!spec || spec.mark !== 'bar') return unknown('/mark', 'Expected a Bar spec.');
  const { x, y, xOffset, yOffset } = spec.encoding ?? {};
  const category = (type: unknown) => type === 'nominal' || type === 'ordinal';
  const horizontal = x?.type === 'quantitative' && category(y?.type);
  const vertical = y?.type === 'quantitative' && category(x?.type);
  if ((!horizontal && !vertical) || !x?.field || !y?.field) {
    return unknown('/encoding', 'Declare one categorical axis and one quantitative axis, each with a field.');
  }
  if (spec.transform !== undefined && !Array.isArray(spec.transform)) {
    return unknown('/transform', 'Expected an ordered transform array.');
  }
  const offsetChannel = horizontal ? 'yOffset' : 'xOffset';
  const wrongOffset = horizontal ? xOffset : yOffset;
  if (wrongOffset !== undefined) return unknown(`/encoding/${horizontal ? 'xOffset' : 'yOffset'}`,
    'Grouped bars use an offset on the category axis, not the measure axis.');
  const offset = horizontal ? yOffset : xOffset;
  if (offset && !offset.field) return unknown(`/encoding/${offsetChannel}`, 'A grouped offset needs a field.');
  if (offset?.field && spec.encoding?.detail?.field && offset.field !== spec.encoding.detail.field) {
    return unknown(`/encoding/${offsetChannel}/field`, 'Offset and detail must identify the same segment field.');
  }
  const state = semanticBarState(spec);
  const layout = state.layout;
  if (!['simple', 'stacked', 'grouped', 'diverging'].includes(layout)) return unknown('/meta/state', 'Unrecognized Bar layout.');
  if ((layout === 'grouped') !== Boolean(offset?.field)) {
    return unknown('/encoding', 'Layout metadata and grouped offset disagree; regenerate the complete spec with the builder.');
  }
  try { validateDistributionOptions(layout, distributionOptions(spec)); }
  catch (error) { return unknown('/meta/state/sceneState/detail/offset', (error as Error).message); }
  return {
    status: 'known', layout,
    distribution: distributionOptions(spec) ? { normalize: 'none', ...structuredClone(distributionOptions(spec)!) } : null,
    orientation: state.orientation,
    categoryField: state.categoryField, measureField: state.measureField,
    segmentField: state.segmentField, offsetChannel: offset?.field ? offsetChannel : null,
    diagnostics: []
  };
}
