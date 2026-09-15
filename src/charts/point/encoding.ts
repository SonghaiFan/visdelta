import type { ChannelSpec, EncodingSpec } from '../../types/index.js';

type AnyRecord = Record<string, unknown>;

export function colorField(encoding: EncodingSpec = {}): string | null {
  return channelField(encoding.color ?? null);
}

export function channelField(channel: ChannelSpec | null = null): string | null {
  if (!channel) return null;
  if (typeof channel === 'string') return channel;
  if ((channel as ChannelSpec).field) return (channel as ChannelSpec).field!;

  const ch = channel as AnyRecord;
  for (const key of ['hue', 'luminance', 'saturation', 'opacity']) {
    if ((ch[key] as AnyRecord | undefined)?.['field']) {
      return (ch[key] as AnyRecord)['field'] as string;
    }
  }

  return null;
}
