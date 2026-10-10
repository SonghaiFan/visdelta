import type { ChartViewport, EncodingSpec, ViewSpec } from '../../types/index.js';
import { areaState, rankedAreaSeries } from './state.js';
import { usesDefaultCategoricalPalette } from '../../runtime/categorical-color.js';
import type { ChartPresentationDefinition } from '../style.js';

export const areaPresentation: ChartPresentationDefinition = { plot: { margin: { top: 56, right: 20, bottom: 40, left: 48 }, grid: 'horizontal', openXDomain: false, openYDomain: true, edgeTitles: true } };


/** Default colors and legend follow the same ranked series as the area stack. */
export function areaLayoutChannels(spec: ViewSpec, viewport?: ChartViewport): EncodingSpec {
  const encoding = spec.encoding ?? {};
  const state = areaState(spec, encoding);
  const color = encoding.color;
  const y = encoding.y?.field;
  if (!viewport || state.layout !== 'stacked' || !state.seriesField || !y ||
      color?.field !== state.seriesField || color.domain || !usesDefaultCategoricalPalette(color)) return encoding;
  return { ...encoding, color: { ...color, domain: rankedAreaSeries(viewport.rows, state.seriesField, y) } };
}
