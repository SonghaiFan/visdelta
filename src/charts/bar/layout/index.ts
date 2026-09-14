import type { BarLayout, BarOrientation, ChannelSpec } from '../../../types/index.js';

export function barOrientationFromEncoding(
  encoding: Record<string, ChannelSpec | undefined> = {}
): BarOrientation {
  return isQuantitative(encoding.x) && isDiscrete(encoding.y) ? 'horizontal' : 'vertical';
}

export function barCategoryChannelName(encoding: Record<string, ChannelSpec | undefined> = {}): 'x' | 'y' {
  return barOrientationFromEncoding(encoding) === 'horizontal' ? 'y' : 'x';
}

export function barMeasureChannelName(encoding: Record<string, ChannelSpec | undefined> = {}): 'x' | 'y' {
  return barOrientationFromEncoding(encoding) === 'horizontal' ? 'x' : 'y';
}

export function barCategoryChannel(encoding: Record<string, ChannelSpec | undefined> = {}): ChannelSpec {
  return encoding[barCategoryChannelName(encoding)] ?? {};
}

export function barMeasureChannel(encoding: Record<string, ChannelSpec | undefined> = {}): ChannelSpec {
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
