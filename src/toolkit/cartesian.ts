import type { RenderDatum } from '../runtime/render-types.js';
import type { ChartContext, EncodingSpec } from '../types/index.js';

export interface ChartPosition {
  x(row: RenderDatum): number;
  y(row: RenderDatum): number;
}

/** Publish a Cartesian projection for shared scene and focus helpers. */
export function setCartesianState(
  chart: ChartContext,
  encoding: EncodingSpec,
  scales: Record<string, unknown>,
  position: ChartPosition
): void {
  chart.scales = { ...scales, orientation: 'cartesian' };
  chart.channels = encoding;
  chart.position = position;
}
