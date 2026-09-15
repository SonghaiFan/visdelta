import { rectBounds } from '../../../focus.js';
import type { FocusBounds } from '../../../focus.js';
import type { RuntimeScale } from '../../../runtime/marks.js';
import type { BarLayout, BarOrientation, ChannelSpec, EncodingSpec } from '../../../types/index.js';
import type { BarDatum, GeometryValue, TargetGeometry } from '../render-pattern.js';

export function barOrientationFromEncoding(encoding: EncodingSpec = {}): BarOrientation {
  return isQuantitative(encoding.x) && isDiscrete(encoding.y) ? 'horizontal' : 'vertical';
}

export function barCategoryChannelName(encoding: EncodingSpec = {}): 'x' | 'y' {
  return barOrientationFromEncoding(encoding) === 'horizontal' ? 'y' : 'x';
}

export function barMeasureChannelName(encoding: EncodingSpec = {}): 'x' | 'y' {
  return barOrientationFromEncoding(encoding) === 'horizontal' ? 'x' : 'y';
}

export function barCategoryChannel(encoding: EncodingSpec = {}): ChannelSpec {
  return encoding[barCategoryChannelName(encoding)] ?? {};
}

export function barMeasureChannel(encoding: EncodingSpec = {}): ChannelSpec {
  return encoding[barMeasureChannelName(encoding)] ?? {};
}

export function barOffsetChannelName(orientation: BarOrientation): 'xOffset' | 'yOffset' {
  return orientation === 'horizontal' ? 'yOffset' : 'xOffset';
}

export function barRendererKey(layout: BarLayout, orientation: BarOrientation): string {
  if (layout === 'grouped') return `grouped-${orientation}`;
  if (layout === 'stacked') return `stacked-${orientation}`;
  return orientation;
}

export function isSegmentLayout(layout: BarLayout | undefined): boolean {
  return layout === 'grouped' || layout === 'stacked';
}

function isQuantitative(channel: ChannelSpec | undefined): boolean {
  return channel?.type === 'quantitative';
}

function isDiscrete(channel: ChannelSpec | undefined): boolean {
  return channel?.type === 'nominal' || channel?.type === 'ordinal';
}

// ─── Shared scale and geometry helpers ───────────────────────────────────────

/** D3 scales satisfy the runtime scale contract; the cast is recorded once here. */
export function asRuntimeScale(scale: unknown): RuntimeScale {
  return scale as RuntimeScale;
}

export function scaled(scale: RuntimeScale, value: unknown): number {
  return Number(scale(value));
}

export function bandwidth(scale: RuntimeScale): number {
  return typeof scale.bandwidth === 'function' ? scale.bandwidth() : 0;
}

export function resolveGeometry(value: GeometryValue, datum: BarDatum): number {
  return typeof value === 'function' ? value(datum) : value;
}

export function geometryBounds(geometry: TargetGeometry, datum: BarDatum): FocusBounds {
  return rectBounds(
    resolveGeometry(geometry.x, datum),
    resolveGeometry(geometry.y, datum),
    resolveGeometry(geometry.width, datum),
    resolveGeometry(geometry.height, datum)
  );
}
