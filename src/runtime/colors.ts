import { scaleLinear, scaleOrdinal } from 'd3-scale';
import type { AxisDomain } from 'd3-axis';
import { hcl as toHcl } from 'd3-color';
import * as chromatic from 'd3-scale-chromatic';
import { inferFieldType } from '../data/types.js';
import { clamp } from './utils.js';
import { channelDomain, quantitativeDomain } from '../toolkit/scales.js';
import type { RenderContext, RenderDatum, RenderChannel } from './render-types.js';
import type { ThemeValue } from './theme.js';
export function createColors(context: RenderContext, themeValue: ThemeValue) {
  const DEFAULT_PALETTE: Array<readonly [string, string]> = [
    ['--vd-series-1',  '#4269d0'],
    ['--vd-series-2',  '#efb118'],
    ['--vd-series-3',  '#ff725c'],
    ['--vd-series-4',  '#6cc5b0'],
    ['--vd-series-5',  '#3ca951'],
    ['--vd-series-6',  '#ff8ab7'],
    ['--vd-series-7',  '#a463f2'],
    ['--vd-series-8',  '#97bbf5'],
    ['--vd-series-9',  '#9c6b4e'],
    ['--vd-series-10', '#9498a0']
  ];
  const DEFAULT_LUMINANCE_BASE: readonly [string, string] = ['--vd-accent', '#1533ff'];
  // Color is only introduced when authors declare an encoding. This token keeps
  // neutral ink legible when a chart style changes its surface.
  const DEFAULT_MARK_COLOR: readonly [string, string] = ['--vd-color-mark-default', '#000000'];

  function colorScale(rows: RenderDatum[], channel: RenderChannel | undefined): (row: RenderDatum) => string {
    const resolved = resolveColorChannel(rows, channel);
    if (!resolved) return () => themeColor(DEFAULT_MARK_COLOR);
    const activeChannel = resolved;
    if (activeChannel.value) return () => cssColor(activeChannel.value, '#1533ff');
    if (activeChannel.hue || activeChannel.luminance) return compositeColorScale(activeChannel);
    if (!activeChannel.field) return () => themeColor(DEFAULT_MARK_COLOR);
    if (activeChannel.type === 'quantitative') return quantitativeColorScale(rows, activeChannel);
    // Use the transition registry for consistent key→color mapping across frames.
    const field = activeChannel.field;
    const domain = channelDomain(rows, activeChannel);
    const fieldRegistry = !activeChannel.range && !activeChannel.scheme && context.colors?.get(field);
    if (fieldRegistry) {
      const fallback = themeColor(DEFAULT_LUMINANCE_BASE);
      return (row) => fieldRegistry.get(String(row[field])) ?? fallback;
    }
    const scale = scaleOrdinal<AxisDomain, string>(colorRange(activeChannel.range || schemeRange(activeChannel.scheme, domain.length) || categoricalRange(domain)))
      .domain(domain as AxisDomain[]);
    return (row) => scale(row[field] as AxisDomain);
  }

  function resolveColorChannel(
    rows: RenderDatum[],
    channel: RenderChannel | false | null | undefined
  ): RenderChannel | null {
    if (channel === false) return null;
    // Color is a data encoding only when the author declares one. With no
    // channel, renderers use neutral black and draw no legend. Theme accents
    // and categorical palettes only apply to explicitly declared color channels.
    if (!channel) return null;
    if (channel?.value) return channel;
    if (channel?.hue || channel?.luminance) {
      return {
        ...channel,
        ...(channel.hue ? { hue: normalizeColorSubchannel(rows, channel.hue) } : {}),
        ...(channel.luminance ? { luminance: normalizeColorSubchannel(rows, channel.luminance) } : {})
      };
    }
    if (channel?.field) return { ...channel, type: channel.type || inferFieldType(rows, channel.field) };
    return null;
  }

  function normalizeColorSubchannel(rows: RenderDatum[], channel: RenderChannel = {}): RenderChannel {
    if (!channel.field) return channel;
    return { ...channel, type: channel.type || inferFieldType(rows, channel.field) };
  }

  // Automatic categorical color assignment: resolve the active palette from CSS
  // variables, then use greedy farthest-first hue selection so that the n chosen
  // colors are as distinct as possible (Rules #4 + #5).
  function categoricalRange(domain: unknown[]): string[] {
    const resolved = DEFAULT_PALETTE.map((entry) => themeColor(entry));
    // Sequential slot assignment: Nth category → series-N. Consistent with the
    // stacked/grouped bar chart's explicit 'var(--vd-series-N)' range and with
    // the transition registry, so fallback frames never get mismatched colors.
    return domain.map((_, i) => resolved[i % resolved.length]);
  }

  type ChromaticInterpolator = (progress: number) => string;

  function chromaticExport(prefix: 'scheme' | 'interpolate', name: string): unknown {
    const requested = name.trim().replace(/^(scheme|interpolate)/i, '');
    if (!requested) return undefined;
    const key = Object.keys(chromatic).find((candidate) =>
      candidate.toLowerCase() === `${prefix}${requested}`.toLowerCase());
    return key ? (chromatic as Record<string, unknown>)[key] : undefined;
  }

  function schemeRange(name: string | undefined, count: number): string[] | null {
    if (!name) return null;
    const scheme = chromaticExport('scheme', name);
    if (Array.isArray(scheme) && scheme.every((color) => typeof color === 'string')) {
      return Array.from({ length: Math.max(1, count) }, (_, index) => scheme[index % scheme.length]);
    }
    if (Array.isArray(scheme)) {
      const sizes = scheme
        .map((colors, size) => Array.isArray(colors) ? { colors, size } : null)
        .filter((entry): entry is { colors: string[]; size: number } => Boolean(entry));
      const selected = sizes.find((entry) => entry.size >= count) || sizes[sizes.length - 1];
      if (selected) return Array.from({ length: Math.max(1, count) }, (_, index) =>
        selected.colors[index % selected.colors.length]);
    }
    const interpolator = chromaticExport('interpolate', name);
    if (typeof interpolator === 'function') {
      const interpolate = interpolator as ChromaticInterpolator;
      if (count <= 1) return [interpolate(0.5)];
      return Array.from({ length: count }, (_, index) => interpolate(index / (count - 1)));
    }
    throw new Error(`Unknown d3-scale-chromatic scheme: ${name}`);
  }

  function quantitativeColorScale(rows: RenderDatum[], channel: RenderChannel): (row: RenderDatum) => string {
    if (!channel.scheme) return luminanceColorScale(rows, channel);
    const interpolator = chromaticExport('interpolate', channel.scheme);
    if (typeof interpolator !== 'function') {
      throw new Error(`D3 color scheme ${channel.scheme} is not a continuous interpolator.`);
    }
    const domain = quantitativeDomain(rows, channel);
    const normalize = scaleLinear().domain(domain).range([0, 1]).clamp(true);
    const field = channel.field!;
    return (row = {}) => (interpolator as ChromaticInterpolator)(normalize(Number(row[field])));
  }

  function luminanceColorScale(
    rows: RenderDatum[],
    channel: RenderChannel
  ): (row: RenderDatum) => string {
    const domain = quantitativeDomain(rows, channel);
    const base = cssColor(channel.base || channel.value || themeColor(DEFAULT_LUMINANCE_BASE), '#1533ff');
    const lightness = channel.lightness || [22, -18];
    const scale = scaleLinear().domain(domain).range(lightness).clamp(true);
    const field = channel.field!;
    return (row = {}) => adjustLightness(base, scale(Number(row[field])));
  }

  function themeColor([name, fallback]: readonly [string, string]): string {
    if (!name) return fallback;
    return themeValue(name, fallback);
  }

  function colorRange(range: string[] = []): string[] {
    return range.map((color, index) => cssColor(color, themeColor(DEFAULT_PALETTE[index % DEFAULT_PALETTE.length])));
  }

  function cssColor(color: unknown, fallback = '#1533ff'): string {
    if (typeof color !== 'string') return (color as string) || fallback;
    const value = color.trim();
    if (!value.startsWith('var(')) return value || fallback;
    if (typeof document === 'undefined') return fallback;
    const name = value.match(/^var\(\s*(--[^,\s)]+)/)?.[1];
    if (!name) return fallback;
    const resolved = getComputedStyle(context.root ?? document.documentElement).getPropertyValue(name).trim();
    const inlineFallback = value.match(/,\s*([^)]+)\)$/)?.[1]?.trim();
    return resolved || inlineFallback || fallback;
  }

  function compositeColorScale(channel: RenderChannel): (row: RenderDatum) => string {
    const hue = channel.hue || {};
    const luminance = channel.luminance || {};
    const hueDomain = hue.domain || [];
    const hueScale = scaleOrdinal<AxisDomain, string>(colorRange(hue.range || schemeRange(hue.scheme, hueDomain.length) || categoricalRange(hueDomain)))
      .domain(hueDomain as AxisDomain[]);
    const luminanceDomain = luminance.domain || [];
    const continuousLuminance = luminance.type === 'quantitative' ||
      (luminanceDomain.length === 2 && luminanceDomain.every((value) => Number.isFinite(Number(value))));
    const lightness = luminance.lightness || [18, 0, -18];
    const lightnessScale = continuousLuminance
      ? scaleLinear().domain(luminanceDomain.map(Number)).range([lightness[0], lightness[lightness.length - 1]]).clamp(true)
      : scaleOrdinal<AxisDomain, number>(lightness).domain(luminanceDomain as AxisDomain[]);
    const lightnessOffset = continuousLuminance
      ? (value: unknown) => (lightnessScale as import('d3-scale').ScaleLinear<number, number>)(Number(value))
      : (value: unknown) => (lightnessScale as import('d3-scale').ScaleOrdinal<AxisDomain, number>)(value as AxisDomain);
    const hueField = hue.field;
    const luminanceField = luminance.field;
    return (row = {}) => {
      const base = cssColor(hue.value || hueScale(row[hueField!] as AxisDomain), '#1533ff');
      const luminanceValue = luminanceField ? row[luminanceField] : undefined;
      const offset = luminanceField && (continuousLuminance || luminanceDomain.includes(luminanceValue))
        ? Number(lightnessOffset(luminanceValue)) || 0
        : 0;
      return adjustLightness(base, offset);
    };
  }

  function adjustLightness(color: unknown, offset: number): string {
    const resolved = cssColor(color, '#1533ff');
    const hcl = toHcl(resolved);
    if (!Number.isFinite(hcl.l)) return resolved;
    hcl.l = clamp(hcl.l + offset, 0, 100);
    return hcl.formatHex();
  }


  return { colorScale, resolveColorChannel, compositeColorScale, quantitativeColorScale, colorRange, schemeRange, categoricalRange, themeColor, fallbackColor: DEFAULT_LUMINANCE_BASE };
}
