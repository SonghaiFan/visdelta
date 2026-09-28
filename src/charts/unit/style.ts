import type { ChartPresentationDefinition } from '../style.js';
import type { EncodingSpec, ViewSpec } from '../../types/index.js';
import { specUnit } from '../../spec-meta.js';

export const unitPresentation: ChartPresentationDefinition = { plot: { margin: { top: 28, right: 20, bottom: 40, left: 40 }, grid: 'none', openXDomain: false, openYDomain: true, edgeTitles: true } };

export function unitLayoutChannels(spec: ViewSpec): EncodingSpec {
  const unit = specUnit(spec);
  const { x, y, color } = spec.encoding ?? {};
  if (unit?.layout === 'bar' && unit.group) {
    return { color, x: { field: String(unit.group), title: String(unit.group), type: 'nominal' } };
  }
  if (unit?.layout === 'beeswarm') return { color, x: x ? { ...x, title: x.title || x.field } : undefined };
  if (unit?.layout === 'force') return {
    color, x: x ? { ...x, title: undefined } : undefined, y: y ? { ...y, title: undefined } : undefined
  };
  return { color };
}
