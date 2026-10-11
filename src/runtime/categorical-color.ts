import type { ChannelSpec } from '../types/index.js';

/** Whether categorical colors come from VisDelta's automatic palette. */
export function usesDefaultCategoricalPalette(channel: ChannelSpec): boolean {
  return channel.type !== 'quantitative' && !channel.value && !channel.range &&
    !channel.scheme && !channel.hue && !channel.luminance;
}
