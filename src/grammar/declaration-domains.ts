import { channelValue, resolveSpecDataTypes } from '../data/types.js';
import { applyTransforms } from '../data/transforms.js';
import type { ChannelSpec, ViewSpec } from '../types/index.js';

/** Validate explicit position domains against the values and scales used by renderers. */
export function validateCanonicalPositionDomains(spec: ViewSpec): string | null {
  const data = spec.data;
  const dataRecord = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(dataRecord?.['values'])
      ? dataRecord['values'] as unknown[]
      : [];
  const typed = resolveSpecDataTypes(spec, rows);
  for (const channelName of ['x', 'y'] as const) {
    const channel = typed.encoding?.[channelName] as ChannelSpec | undefined;
    if (!channel || !Object.prototype.hasOwnProperty.call(channel, 'domain')) continue;
    if (channel.type === 'quantitative' || channel.type === 'temporal') {
      if (!Array.isArray(channel.domain) || channel.domain.length < 2) {
        return `${channelName} ${channel.type} domain must contain at least two values`;
      }
      const resolved = channel.domain.map(value => channelValue(value, channel));
      const finite = resolved.every(value => channel.type === 'temporal'
        ? value instanceof Date && Number.isFinite(value.getTime())
        : typeof value === 'number' && Number.isFinite(value));
      if (!finite) return `${channelName} ${channel.type} domain values must resolve to finite values`;
      continue;
    }

    // A band scale returns undefined for a value outside an explicit domain.
    // Renderers then turn that into a non-finite mark position, so the planner
    // must reject such a declaration when its inline transformed rows prove it.
    const field = channel.field;
    if (!field || !Array.isArray(channel.domain) || !rows.length) continue;
    let transformed: unknown[];
    try { transformed = applyTransforms(rows as Record<string, unknown>[], spec.transform ?? []); }
    catch { continue; }
    const domain = new Set(channel.domain.map(value => domainKey(channelValue(value, channel))));
    const outside = transformed.some(row => !domain.has(domainKey(channelValue(
      (row as Record<string, unknown>)[field], channel
    ))));
    if (outside) return `${channelName} ${channel.type ?? 'categorical'} domain omits an inline transformed data value`;
  }
  return null;
}

function domainKey(value: unknown): unknown {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : value;
  if (value && typeof value === 'object' && typeof (value as { valueOf?: unknown }).valueOf === 'function') {
    return (value as { valueOf(): unknown }).valueOf();
  }
  return value;
}
