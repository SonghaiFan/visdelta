import { extent } from 'd3-array';
import type { AxisDomain } from 'd3-axis';
import { scaleBand, scaleLinear, scaleLog, scaleSqrt, scaleTime } from 'd3-scale';
import { channelValue, inferFieldType } from '../data/types.js';
import type { RenderDatum, RenderChannel, RuntimeScale, ScaleOptions } from '../runtime/render-types.js';
export function bandOrLinear(
  rows: RenderDatum[],
  channel: RenderChannel | undefined,
  range: [number, number],
  options: ScaleOptions = {}
): RuntimeScale {
  if (!channel) return asRuntimeScale(scaleLinear().domain([0, 1]).range(range));
  const resolved = channel.field && !channel.type
    ? { ...channel, type: inferFieldType(rows, channel.field) }
    : channel;
  let scale;
  if (resolved.type === 'quantitative') scale = quantitativeScale(rows, resolved, range, options);
  else if (resolved.type === 'temporal') {
    const field = resolved.field ?? '';
    const explicitDomain = Array.isArray(resolved.domain);
    const values = rows.map((datum) => channelValue(datum[field], resolved)) as Array<Date | number>;
    const dataDomain = extent(values);
    const domain = (resolved.domain || dataDomain)
      .map((value) => channelValue(value, resolved)) as Array<Date | number>;
    scale = asRuntimeScale(scaleTime().domain(domain).range(range).nice());
    scale.__visDeltaDataDomain = dataDomain;
    if (!explicitDomain) padContinuousDomain(scale, options.domainPadding);
  } else {
    scale = asRuntimeScale(scaleBand<AxisDomain>().domain(channelDomain(rows, resolved) as AxisDomain[]).range(range).padding(0.24));
  }
  scale.__visDeltaChannel = resolved;
  return scale;
}

export function quantitativeScale(
  rows: RenderDatum[],
  channel: RenderChannel = {},
  range: [number, number],
  options: ScaleOptions = {}
): RuntimeScale {
  const scaleType = channel.scale?.type || channel.scaleType || 'linear';
  const domain = quantitativeDomain(rows, channel, scaleType === 'log' ? 1 : undefined);
  const field = channel.field ?? '';
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  const dataDomain = values.length ? extent(values) : domain;
  const explicitDomain = Array.isArray(channel.domain);
  let scale;
  if (scaleType === 'log') {
    const safeDomain = domain.map((value) => Math.max(Number(value) || 1, 0.1));
    const requestedBase = Number(channel.scale?.base);
    const base = Number.isFinite(requestedBase) && requestedBase > 0 && requestedBase !== 1
      ? requestedBase
      : 10;
    scale = asRuntimeScale(scaleLog().base(base).domain(safeDomain).range(range).nice());
  } else if (scaleType === 'sqrt') {
    scale = asRuntimeScale(scaleSqrt().domain(domain).range(range).nice());
  } else {
    scale = asRuntimeScale(scaleLinear().domain(domain).range(range).nice());
  }
  scale.__visDeltaDataDomain = dataDomain;
  if (!explicitDomain) padContinuousDomain(scale, options.domainPadding);
  scale.__visDeltaChannel = { ...channel, type: 'quantitative' };
  return scale;
}

/**
 * Extend a continuous domain by the exact amount needed to keep a mark with a
 * pixel footprint inside the plot clip. The scale still owns the full plot
 * range; only its inferred domain grows. Explicit author domains remain
 * authoritative and never reach this helper.
 */
export function padContinuousDomain(scale: RuntimeScale, padding = 0): RuntimeScale {
  const pixels = Math.max(0, Number(padding) || 0);
  if (!pixels || typeof scale.copy !== 'function' || typeof scale.invert !== 'function') return scale;
  const range = scale.range();
  if (range.length < 2) return scale;
  const start = Number(range[0]);
  const end = Number(range[range.length - 1]);
  const span = Math.abs(end - start);
  if (!Number.isFinite(span) || span <= pixels * 2) return scale;
  const direction = Math.sign(end - start) || 1;
  const inner = [start + direction * pixels, end - direction * pixels];
  const projection = scale.copy().range(inner);
  scale.domain([projection.invert!(start), projection.invert!(end)]);
  return scale;
}

export function asRuntimeScale(scale: unknown): RuntimeScale {
  return scale as RuntimeScale;
}

export function position(scale: RuntimeScale, value: unknown): number {
  const scaled = scale(channelValue(value, scale.__visDeltaChannel));
  if (typeof scale.bandwidth === 'function') return (scaled as number) + scale.bandwidth() / 2;
  return scaled as number;
}

export function niceExtent(rows: RenderDatum[], field: string | undefined, floor?: number): [number, number] {
  const key = field ?? '';
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return [0, 1];
  const min = floor ?? Math.min(...values);
  const max = Math.max(...values);
  return min === max ? [min - 1, max + 1] : [min, max];
}

export function quantitativeDomain(rows: RenderDatum[], channel: RenderChannel = {}, floor?: number): number[] {
  if (Array.isArray(channel.domain)) return channel.domain as number[];
  return niceExtent(rows, channel.field, floor);
}

export function channelDomain(rows: RenderDatum[], channel: RenderChannel = {}): unknown[] {
  if (Array.isArray(channel.domain)) return channel.domain;
  const field = channel.field ?? '';
  return Array.from(new Set(rows.map((row) => row[field])));
}
