import { specTransition } from '../spec-meta.js';
import { DEFAULT_MARK_DELAY, DEFAULT_TIMING, defaultTransition } from '../timing.js';
import { renderAxis } from './axis.js';
import type { AxisOrient } from './axis.js';
import { motion } from './recorder.js';
import type { Motion, MotionTiming } from './recorder.js';
import { clamp, escapeHtml, titleize } from './utils.js';
import { channelValue, inferFieldType } from '../data/types.js';
import type { ChartStyleModule } from '../charts/style.js';
import type {
  ChannelSpec,
  ChartContext,
  ChartSceneContext,
  ChartTransitionContext,
  DataRow,
  StaggerSpec,
  TransitionSpec,
  ViewSpec
} from '../types/index.js';
import type { Axis, AxisDomain, AxisScale } from 'd3-axis';
import type { BaseType, Selection } from 'd3-selection';
import { extent, ticks } from 'd3-array';
import { axisBottom, axisLeft, axisRight, axisTop } from 'd3-axis';
import { hcl as toHcl } from 'd3-color';
import { easeBackOut, easeCubic, easeCubicInOut, easeElasticOut, easeExp, easeExpInOut, easeLinear } from 'd3-ease';
import { format } from 'd3-format';
import { scaleBand, scaleLinear, scaleLog, scaleOrdinal, scaleSqrt, scaleTime } from 'd3-scale';
import { select } from 'd3-selection';

type SvgSelection<ElementType extends BaseType, Datum = unknown> =
  Selection<ElementType, Datum, BaseType, unknown>;
type MotionTransition = MotionTiming;

interface AxisElement extends SVGGElement {
  __visDeltaAxisActive?: boolean;
  __visDeltaAxisKind?: string;
}

export interface RuntimeScale {
  (value: unknown): number | undefined;
  domain(): unknown[];
  domain(values: Iterable<unknown>): RuntimeScale;
  range(): number[];
  range(values: Iterable<number>): RuntimeScale;
  bandwidth?: () => number;
  step?: () => number;
  ticks?: (count?: number) => unknown[];
  copy?: () => RuntimeScale;
  invert?: (value: number) => unknown;
  __visDeltaChannel?: RenderChannel;
  __visDeltaDataDomain?: unknown[];
}

export interface RenderChannel extends ChannelSpec {
  field?: string;
  value?: string;
  range?: string[];
  scaleType?: string;
  hue?: RenderChannel;
  luminance?: RenderChannel;
  base?: string;
  lightness?: number[];
}

export interface RenderDatum extends DataRow {
  __row?: DataRow;
}

type RenderScene = ChartSceneContext;
type RenderTransition = ChartTransitionContext;
type RenderChartContext = ChartContext;

export interface ScaleOptions {
  domainPadding?: number;
}

/** Distances from the chart's edges for an edge-placed axis title. */
export interface EdgeTitleInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AxisOptions {
  side?: 'top' | 'right' | 'bottom' | 'left';
  duration?: number;
  tickCount?: number;
  tickFormat?: string;
  position?: number;
  /**
   * Place the title at the chart edge (x: bottom-right, y: top-left) instead
   * of centered along the axis. The axis is the title's only writer either
   * way: a second placement on the same node would fight it frame by frame.
   */
  edgeTitleInset?: Readonly<EdgeTitleInset>;
}

export interface GridOptions {
  x?: RuntimeScale | null;
  keepX?: boolean;
  xTickCount?: number;
  yTickCount?: number;
  tickCount?: number;
  duration?: number;
}

interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LegendLayoutItem {
  x: number;
  y: number;
}

export interface RenderContext {
  root?: Element;
  colors?: Map<string, Map<string, string>> | null;
  chartStyle?: ChartStyleModule;
}

/** Helpers capture one instance context, including delayed D3 callbacks. */
export function createMarkHelpers(context: RenderContext = {}) {
// ─── Color rules (Stephen Few, "Practical Rules for Using Color in Charts") ───
//
// Rule #3  Use color only when it serves a communication goal.
// Rule #4  Use different hues only for different meanings in the data.
// Rule #5  Soft, natural hues for most data; bright/dark for highlights.
// Rule #6  Sequential quantitative encoding: single hue, varying intensity.
// Rule #7  Non-data ink (axes, grid) barely visible — light grays only.
// Rule #8  Avoid red + green together (colorblind safety).
// Rule #9  No visual effects (gradients, 3-D, shadows on data marks).
//
// Categorical palette design (Rules #4 + #5):
//   • Use hues that are as distinct as possible — maximise minimum pairwise
//     hue distance so no two groups look similar.
//   • Keep similar lightness/saturation so no single group dominates visually.
//   • The Tableau 10 palette satisfies both criteria and is colorblind-safe
//     (no adjacent red+green pair in the hue-maximised assignment order).
// ─────────────────────────────────────────────────────────────────────────────

// Chart-instance color registry: field → (key → color string).
// Set once per transition so the same semantic key always maps to the same
// color regardless of which subset of categories appears in a frame.

// Tableau 10 — widely-adopted, perceptually balanced categorical palette.
const DEFAULT_PALETTE: Array<readonly [string, string]> = [
  ['--vd-series-1',  '#4e79a7'],
  ['--vd-series-2',  '#f28e2b'],
  ['--vd-series-3',  '#e15759'],
  ['--vd-series-4',  '#76b7b2'],
  ['--vd-series-5',  '#59a14f'],
  ['--vd-series-6',  '#edc948'],
  ['--vd-series-7',  '#b07aa1'],
  ['--vd-series-8',  '#ff9da7'],
  ['--vd-series-9',  '#9c755f'],
  ['--vd-series-10', '#bab0ac']
];
const DEFAULT_LUMINANCE_BASE: readonly [string, string] = ['--vd-accent', '#4e79a7'];

// ─── Hue-maximisation helpers ─────────────────────────────────────────────────

// Circular angular distance between two hue angles (0–180°).
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Extract hue angle (0–360°) from a CSS color string.
// Supports #rrggbb, #rgb, and rgb(r,g,b).
// Returns null for near-achromatic colors (saturation range < 10 %).
function parseColorHue(color: string): number | null {
  if (typeof color !== 'string') return null;
  let r, g, b;
  const hex = color.trim().match(/^#([0-9a-f]{3,6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    r = parseInt(full.slice(0, 2), 16) / 255;
    g = parseInt(full.slice(2, 4), 16) / 255;
    b = parseInt(full.slice(4, 6), 16) / 255;
  } else {
    const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!m) return null;
    r = Number(m[1]) / 255;
    g = Number(m[2]) / 255;
    b = Number(m[3]) / 255;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.1) return null; // near-achromatic — skip in hue selection
  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return (h * 60 + 360) % 360;
}

// Greedy farthest-first selection: choose n colors from `colors` such that the
// minimum pairwise hue distance among the chosen set is maximised.
// Near-achromatic entries are relegated to the end (appended only when needed).
// Works on any resolved-color array, so user-customised palettes benefit too.
function pickCategoricalColors(n: number, colors: string[]): string[] {
  if (n <= 0) return [];
  if (n >= colors.length) {
    return Array.from({ length: n }, (_, i) => colors[i % colors.length]);
  }
  const hues = colors.map(parseColorHue);
  const chromatic  = hues.map((h, i) => h !== null ? i : -1).filter((i) => i >= 0);
  const achromatic = hues.map((h, i) => h === null ? i : -1).filter((i) => i >= 0);

  if (chromatic.length === 0) return colors.slice(0, n); // all near-gray

  const chosen    = [chromatic[0]];
  const remaining = chromatic.slice(1);

  while (chosen.length < n) {
    if (remaining.length > 0) {
      let bestK = 0, bestMinDist = -Infinity;
      for (let k = 0; k < remaining.length; k++) {
        const i = remaining[k];
        const minDist = Math.min(...chosen.map((j) => hueDist(hues[i]!, hues[j]!)));
        if (minDist > bestMinDist) { bestMinDist = minDist; bestK = k; }
      }
      chosen.push(remaining.splice(bestK, 1)[0]);
    } else {
      // Chromatic pool exhausted — fill with achromatic entries
      const take = Math.min(achromatic.length, n - chosen.length);
      chosen.push(...achromatic.splice(0, take));
    }
  }
  return chosen.slice(0, n).map((i) => colors[i]);
}

// ─── Theme value helper ───────────────────────────────────────────────────────
// Reads a CSS custom property from :root at render time, with a typed fallback.
// Numeric fallback → strips units and returns a number (e.g. parseFloat("11px") = 11).
// String fallback  → returns the raw trimmed value.
// Falls back silently when running outside a browser (SSR / tests).
function themeValue(cssVar: string, fallback: number): number;
function themeValue(cssVar: string, fallback: string): string;
function themeValue(cssVar: string, fallback: string | number): string | number {
  if (typeof document === 'undefined') return fallback;
  const contextRoot = context.root ?? document.documentElement;
  const scopedRoot = contextRoot.matches?.('.vd-transition-root, .vd-chart-root')
    ? contextRoot
    : contextRoot.querySelector?.('.vd-transition-root, .vd-chart-root');
  const style = getComputedStyle(scopedRoot ?? contextRoot);
  const raw = style.getPropertyValue(cssVar).trim();
  if (!raw) return fallback;
  // Defensive var() resolution: if the browser returns an unresolved
  // var() reference (e.g. "var(--vd-rounded-md)"), resolve one level.
  // Modern browsers should already compute the final value, but this
  // guards against edge-cases and non-browser environments.
  if (raw.startsWith('var(')) {
    const m = raw.match(/^var\(\s*(--[\w-]+)(?:\s*,\s*([^)]*?))?\s*\)$/);
    if (m) {
      const resolved = style.getPropertyValue(m[1]).trim() || m[2]?.trim() || '';
      if (!resolved) return fallback;
      if (typeof fallback === 'number') {
        const n = parseFloat(resolved);
        return isNaN(n) ? fallback : n;
      }
      return resolved;
    }
    return fallback;
  }
  if (typeof fallback === 'number') {
    const n = parseFloat(raw);
    return isNaN(n) ? fallback : n;
  }
  return raw;
}
// ─────────────────────────────────────────────────────────────────────────────

function transitionSpec(
  spec: ViewSpec,
  previousSpec: ViewSpec | null | undefined,
): RenderTransition {
  const local = specTransition(spec);
  const previous = previousSpec ? specTransition(previousSpec) : {};
  const transition = { ...defaultTransition(), ...previous, ...local };
  const base: MotionTiming = { delay: 0, duration: transition.duration, ease: easeFor(transition.ease) };
  return { ...transition, base };
}

function effectiveTransitionSpec(spec: ViewSpec = {}): Required<TransitionSpec> {
  return defaultTransition(specTransition(spec));
}

function easeFor(name: string | undefined): (progress: number) => number {
  const eases = {
    linear: easeLinear, cubic: easeCubic, cubicInOut: easeCubicInOut,
    exp: easeExp, expInOut: easeExpInOut, elastic: easeElasticOut, back: easeBackOut
  };
  return (name ? eases[name as keyof typeof eases] : undefined) || easeCubicInOut;
}

function activeMarkLayer(scene: RenderScene, mark: string, transition: RenderTransition): SvgSelection<SVGGElement> {
  fadeLayers(scene, mark, transition);
  if (!scene.markLayers.has(mark)) {
    scene.markLayers.set(mark, scene.markRoot.append('g').attr('class', `vd-mark-layer vd-${mark}-layer`));
  }
  const layer = scene.markLayers.get(mark)!;
  motion(layer.style('display', null), transition.base).style('opacity', 1);
  return layer;
}

function fadeLayers(
  scene: RenderScene,
  activeMark: string,
  transition: RenderTransition | null = null
): void {
  const resolvedTransition = transition || { base: { delay: 0, duration: 300, ease: easeCubicInOut } };
  scene.markLayers.forEach((layer, mark) => {
    if (mark === activeMark) return;
    motion(layer, resolvedTransition.base).style('opacity', 0);
  });
}

function staggerDelay(
  spec: ViewSpec,
  datum: RenderDatum,
  index: number,
  override?: StaggerSpec | number
): number {
  const stagger = override === undefined ? effectiveTransitionSpec(spec).stagger : override;
  if (!stagger) return 0;
  if (typeof stagger === 'number') return index * stagger;
  const step = stagger.step ?? (stagger as StaggerSpec & { ms?: number }).ms ?? DEFAULT_MARK_DELAY.step;
  const max = stagger.max ?? DEFAULT_MARK_DELAY.max;
  if (stagger.by) {
    const value = Number(datum[stagger.by] ?? datum.__row?.[stagger.by] ?? index);
    if (Number.isFinite(value)) return Math.min(value * step, max);
  }
  return Math.min(index * step, max);
}

function fadeNonBarShapes(chart: RenderChartContext): void {
  motion(chart.g.selectAll<SVGElement, unknown>('circle,path:not(.vd-line)'), chart.transition.base).style('opacity', 0);
}

function fadeNonLineShapes(chart: RenderChartContext): void {
  motion(chart.g.selectAll<SVGElement, unknown>('rect.vd-bar,circle.vd-point,circle.vd-unit'), chart.transition.base).style('opacity', 0);
}

function fadeNonPointShapes(chart: RenderChartContext): void {
  motion(chart.g.selectAll<SVGElement, unknown>('rect.vd-bar,path.vd-line,circle.vd-line-point,circle.vd-unit'), chart.transition.base).style('opacity', 0);
}

function fadeNonUnitShapes(chart: RenderChartContext): void {
  motion(chart.g.selectAll<SVGElement, unknown>('rect.vd-bar,path.vd-line,circle.vd-line-point,circle.vd-point'), chart.transition.base).style('opacity', 0);
}

function applyPlotClip(chart: RenderChartContext, enabled: boolean): void {
  if (!enabled) { chart.g.attr('clip-path', null); return; }
  const id = `vd-mark-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, { x: 0, y: 0, width: chart.innerWidth, height: chart.innerHeight });
  chart.g.attr('clip-path', `url(#${id})`);
}

function drawUnsupported(chart: RenderChartContext, spec: ViewSpec, availableTypes: string[] = []): void {
  chart.g.append('text')
    .attr('x', chart.innerWidth / 2).attr('y', chart.innerHeight / 2)
    .attr('text-anchor', 'middle').attr('fill', 'var(--vd-muted)')
    .text(`Unsupported chart type "${spec.mark}"${availableTypes.length ? ` · available: ${availableTypes.join(', ')}` : ''}`);
}

function bandOrLinear(
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

function quantitativeScale(
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
    scale = asRuntimeScale(scaleLog().domain(safeDomain).range(range).nice());
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
function padContinuousDomain(scale: RuntimeScale, padding = 0): RuntimeScale {
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

function asRuntimeScale(scale: unknown): RuntimeScale {
  return scale as RuntimeScale;
}

function position(scale: RuntimeScale, value: unknown): number {
  const scaled = scale(channelValue(value, scale.__visDeltaChannel));
  if (typeof scale.bandwidth === 'function') return (scaled as number) + scale.bandwidth() / 2;
  return scaled as number;
}

function niceExtent(rows: RenderDatum[], field: string | undefined, floor?: number): [number, number] {
  const key = field ?? '';
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return [0, 1];
  const min = floor ?? Math.min(...values);
  const max = Math.max(...values);
  return min === max ? [min - 1, max + 1] : [min, max];
}

function quantitativeDomain(rows: RenderDatum[], channel: RenderChannel = {}, floor?: number): number[] {
  if (Array.isArray(channel.domain)) return channel.domain as number[];
  return niceExtent(rows, channel.field, floor);
}

function channelDomain(rows: RenderDatum[], channel: RenderChannel = {}): unknown[] {
  if (Array.isArray(channel.domain)) return channel.domain;
  const field = channel.field ?? '';
  return Array.from(new Set(rows.map((row) => row[field])));
}

function colorScale(rows: RenderDatum[], channel: RenderChannel | undefined): (row: RenderDatum) => string {
  const resolved = resolveColorChannel(rows, channel);
  if (!resolved) return () => '#000000';
  const activeChannel = resolved;
  if (activeChannel.value) return () => cssColor(activeChannel.value, '#4e79a7');
  if (activeChannel.hue || activeChannel.luminance) return compositeColorScale(activeChannel);
  if (!activeChannel.field) return () => '#000000';
  if (activeChannel.type === 'quantitative') return luminanceColorScale(rows, activeChannel);
  // Use the transition registry for consistent key→color mapping across frames.
  const field = activeChannel.field;
  const fieldRegistry = !activeChannel.range && context.colors?.get(field);
  if (fieldRegistry) {
    const fallback = themeColor(DEFAULT_LUMINANCE_BASE);
    return (row) => fieldRegistry.get(String(row[field])) ?? fallback;
  }
  const domain = channelDomain(rows, activeChannel);
  const scale = scaleOrdinal<AxisDomain, string>(colorRange(activeChannel.range || categoricalRange(domain)))
    .domain(domain as AxisDomain[]);
  return (row) => scale(row[field] as AxisDomain);
}

function drawXAxis(
  chart: RenderChartContext,
  scale: RuntimeScale | null,
  title: string | undefined,
  transition: MotionTransition = chart.transition.base,
  options: AxisOptions = {}
): void {
  const side = options.side === 'top' ? 'top' : 'bottom';
  const duration = options.duration;
  applyXAxisClip(chart);
  if (!scale) {
    const inactiveSide = activeHorizontalAxisSide(chart.scene.xAxis, side);
    markAxisInactive(chart.scene.xAxis);
    timedTransition(chart.scene.xAxis, transition, duration)
      .attr('transform', axisSideTransform(chart, inactiveSide, true))
      .style('opacity', 0);
    const hiddenLabel = timedTransition(chart.scene.xLabel, transition, duration).style('opacity', 0);
    if (!options.edgeTitleInset) {
      hiddenLabel
        .attr('transform', `translate(${chart.margin.left},0)`)
        .attr('y', xLabelSideY(chart, inactiveSide, true, themeValue('--vd-axis-label-offset', 48)));
    }
    return;
  }
  const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
  const labelOffset = themeValue('--vd-axis-label-offset', 48);
  const axisFactory = side === 'top' ? axisTop : axisBottom;
  const axisScale = scale as unknown as AxisScale<AxisDomain>;
  let axis = typeof scale.bandwidth === 'function'
    ? axisFactory(axisScale)
    : axisFactory(axisScale).ticks(tickCount, options.tickFormat);
  if (typeof scale.bandwidth !== 'function') {
    axis = axis.tickValues(prioritizedContinuousTicks(scale, tickCount, 44) as AxisDomain[]);
  }
  axis = axis.tickSizeOuter(0);
  // Adaptive label thinning for band (categorical) x-axes:
  // when available px-per-band < threshold, skip every Nth label so they never overlap.
  if (typeof scale.bandwidth === 'function') {
    const domain = scale.domain();
    const minPxPerLabel = 44; // ~5 chars × 7px + 9px padding
    const pxPerBand = scale.step!();
    if (pxPerBand < minPxPerLabel) {
      const step = Math.ceil(minPxPerLabel / pxPerBand);
      axis = axis.tickValues(domain.filter((_, i) => i % step === 0) as AxisDomain[]);
    }
  }
  const kind = axisKind(side, scale);
  const xAxis = chart.scene.xAxis;
  const entersFromSide = axisIsEntering(xAxis);
  renderAxisWithGuard(xAxis, axis, transition, kind, duration);
  if (entersFromSide) {
    xAxis.attr('transform', axisSideTransform(chart, side, true)).style('opacity', 0);
  }
  xAxis.selectAll('.tick text').attr('dy', '0.8em');
  alignEdgeTickLabels(xAxis, scale);
  timedTransition(xAxis, transition, duration)
    .attr('transform', axisPositionTransform(chart, side, options.position))
    .style('opacity', 1);
  if (title) {
    const xLabel = chart.scene.xLabel;
    const xLabelTransition = transitionAxisLabel(xLabel, title, transition, duration);
    const inset = options.edgeTitleInset;
    if (inset) {
      // An edge title never travels with the axis; it fades in where it lives.
      if (entersFromSide) placeEdgeXLabel(xLabel, chart, inset).style('opacity', 0);
      placeEdgeXLabel(xLabelTransition, chart, inset);
    } else {
      if (entersFromSide) {
        xLabel
          .attr('x', chart.innerWidth / 2)
          .attr('y', xLabelSideY(chart, side, true, labelOffset))
          .attr('text-anchor', 'middle')
          .attr('transform', `translate(${chart.margin.left},0)`)
          .style('opacity', 0);
      }
      xLabelTransition
        .attr('x', chart.innerWidth / 2).attr('y', xLabelSideY(chart, side, false, labelOffset))
        .attr('text-anchor', 'middle').attr('transform', `translate(${chart.margin.left},0)`);
    }
  } else {
    timedTransition(chart.scene.xLabel, transition, duration).style('opacity', 0);
  }
}

function drawYAxis(
  chart: RenderChartContext,
  scale: RuntimeScale | null,
  title: string | undefined,
  transition: MotionTransition = chart.transition.base,
  options: AxisOptions = {}
): void {
  const side = options.side === 'right' ? 'right' : 'left';
  const duration = options.duration;
  applyYAxisClip(chart);
  if (!scale) {
    const inactiveSide = activeAxisSide(chart.scene.yAxis, side);
    markAxisInactive(chart.scene.yAxis);
    timedTransition(chart.scene.yAxis, transition, duration)
      .attr('transform', axisSideTransform(chart, inactiveSide, true))
      .style('opacity', 0);
    timedTransition(chart.scene.yLabel, transition, duration).style('opacity', 0);
    return;
  }
  const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
  const labelOffset = themeValue('--vd-axis-label-offset', 48);
  const axisFactory = side === 'right' ? axisRight : axisLeft;
  const axisScale = scale as unknown as AxisScale<AxisDomain>;
  let axis = typeof scale.bandwidth === 'function'
    ? axisFactory(axisScale)
    : axisFactory(axisScale).ticks(tickCount, options.tickFormat);
  if (typeof scale.bandwidth !== 'function') {
    axis = axis.tickValues(prioritizedContinuousTicks(scale, tickCount, 22) as AxisDomain[]);
  }
  axis = axis.tickSizeOuter(0);
  // Adaptive label thinning for band (categorical) y-axes (horizontal bar charts):
  if (typeof scale.bandwidth === 'function') {
    const domain = scale.domain();
    const minPxPerLabel = 22; // vertical: ~1 line height
    const pxPerBand = scale.step!();
    if (pxPerBand < minPxPerLabel) {
      const step = Math.ceil(minPxPerLabel / pxPerBand);
      axis = axis.tickValues(domain.filter((_, i) => i % step === 0) as AxisDomain[]);
    }
  }
  const kind = axisKind(side, scale);
  const yAxis = chart.scene.yAxis;
  const entersFromSide = axisIsEntering(yAxis);
  renderAxisWithGuard(yAxis, axis, transition, kind, duration);
  if (entersFromSide) {
    yAxis.attr('transform', axisSideTransform(chart, side, true)).style('opacity', 0);
  }
  timedTransition(yAxis, transition, duration)
    .attr('transform', axisPositionTransform(chart, side, options.position))
    .style('opacity', 1);
  if (title) {
    const yLabel = chart.scene.yLabel;
    const yLabelTransition = transitionAxisLabel(yLabel, title, transition, duration);
    const inset = options.edgeTitleInset;
    if (inset) {
      if (entersFromSide) placeEdgeYLabel(yLabel, chart, inset).style('opacity', 0);
      placeEdgeYLabel(yLabelTransition, chart, inset);
    } else {
      if (entersFromSide) placeYLabel(yLabel, chart, side, labelOffset, true).style('opacity', 0);
      placeYLabel(yLabelTransition, chart, side, labelOffset, false);
    }
  } else {
    timedTransition(chart.scene.yLabel, transition, duration).style('opacity', 0);
  }
}

function drawGrid(
  chart: RenderChartContext,
  y: RuntimeScale | null,
  transition: MotionTransition = chart.transition.base,
  options: GridOptions = {}
): void {
  updateGrid(chart, y, transition, {
    keepX: Boolean(options.x),
    tickCount: options.yTickCount,
    duration: options.duration
  });
  updateXGrid(chart, options.x ?? null, transition, options.xTickCount, options.duration);
}

function updateGrid(
  chart: RenderChartContext,
  y: RuntimeScale | null,
  transition: MotionTransition = chart.transition.base,
  options: GridOptions = {}
): void {
  applyGridClip(chart);
  if (!options.keepX) updateXGrid(chart, null, transition, undefined, options.duration);
  if (!y) {
    markAxisInactive(chart.scene.grid);
    timedTransition(chart.scene.grid, transition, options.duration).style('opacity', options.keepX ? 1 : 0);
    return;
  }
  const grid = chart.scene.grid.attr('transform', null);
  const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
  renderAxisWithGuard(grid, axisLeft(y as unknown as AxisScale<AxisDomain>)
    .ticks(tickCount)
    .tickValues(prioritizedContinuousTicks(y, tickCount, 22) as AxisDomain[])
    .tickSize(-chart.innerWidth)
    .tickFormat(() => ''), transition, axisKind('grid-left', y), options.duration);
  timedTransition(grid, transition, options.duration).style('opacity', 1);
}

function updateXGrid(
  chart: RenderChartContext,
  x: RuntimeScale | null,
  transition: MotionTransition,
  tickCount: number | undefined,
  duration: number | undefined
): void {
  const layer = chart.scene.grid.selectAll('g.vd-point-x-grid')
    .data(x ? [null] : [])
    .join(
      (enter) => enter.append('g').attr('class', 'vd-point-x-grid'),
      (update) => update,
      (exit) => timedTransition(exit, transition, duration).style('opacity', 0).remove()
    );
  if (!x) return;

  const count = tickCount ?? themeValue('--vd-tick-count', 6);
  const values = typeof x.ticks === 'function'
    ? prioritizedContinuousTicks(x, count, 44)
    : x.domain();
  layer.style('opacity', 1)
    .selectAll('line')
    .data(values, (value) => String(value))
    .join(
      (enter) => {
        const entered = enter.append('line')
          .attr('x1', (value) => x(value) as number)
          .attr('x2', (value) => x(value) as number)
          .attr('y1', 0)
          .attr('y2', chart.innerHeight)
          .style('opacity', 0);
        timedTransition(entered, transition, duration).style('opacity', 1);
        return entered;
      },
      (update) => {
        timedTransition(update, transition, duration)
          .attr('x1', (value) => x(value) as number)
          .attr('x2', (value) => x(value) as number)
          .attr('y1', 0)
          .attr('y2', chart.innerHeight)
          .style('opacity', 1);
        return update;
      },
      (exit) => { timedTransition(exit, transition, duration).style('opacity', 0).remove(); }
    );
}

function drawLegend(
  chart: RenderChartContext,
  rows: RenderDatum[],
  channel: RenderChannel | undefined
): void {
  const colorRows = chart.domainRows?.length ? chart.domainRows : rows;
  const activeChannel = resolveColorChannel(colorRows, channel);
  if (!activeChannel || activeChannel.value || (!activeChannel.field && !activeChannel.hue && !activeChannel.luminance)) {
    motion(chart.scene.legend, chart.transition.base).style('opacity', 0);
    return;
  }
  const legendChannel = activeChannel.hue?.field
    ? activeChannel.hue
    : activeChannel.luminance?.field
      ? activeChannel.luminance
      : activeChannel;
  const legendField = legendChannel.field!;
  const quantitativeLegend = legendChannel.type === 'quantitative';
  const domain = quantitativeLegend
    ? quantitativeLegendDomain(colorRows, legendChannel)
    : channelDomain(colorRows, legendChannel);
  const fieldRegistry = !activeChannel.range && !activeChannel.hue && !activeChannel.luminance && !quantitativeLegend
    ? context.colors?.get(legendField)
    : null;
  const scale = activeChannel.hue || activeChannel.luminance
    ? compositeColorScale(activeChannel)
    : quantitativeLegend
      ? luminanceColorScale(colorRows, legendChannel)
      : fieldRegistry
        ? (value: unknown) => fieldRegistry.get(String(value)) ?? themeColor(DEFAULT_LUMINANCE_BASE)
        : scaleOrdinal<AxisDomain, string>(activeChannel.range || categoricalRange(domain))
            .domain(domain as AxisDomain[]);
  const legendRow = (value: unknown): RenderDatum => ({ [legendField]: value });
  const swatchSize = themeValue('--vd-legend-swatch-size', 9);
  const swatchRadius = themeValue('--vd-legend-swatch-radius', 1.5);
  const legendInset = context.chartStyle?.legendInset ?? { top: 8, left: 8 };
  const atRight = context.chartStyle?.legendPosition === 'right';
  const layout = legendLayout(
    domain,
    atRight ? 1 : chart.innerWidth,
    swatchSize
  );
  const legend = chart.scene.legend.style('opacity', 1)
    .attr('transform', `translate(${chart.margin.left + legendInset.left + (atRight ? chart.innerWidth : 0)},${legendInset.top + (atRight ? chart.margin.top : 0)})`);
  const items = legend.selectAll<SVGGElement, unknown>('g.vd-legend-item').data(domain, (value) => String(value));
  const entered = items.enter().append('g').attr('class', 'vd-legend-item').style('opacity', 0);
  entered.append('rect').attr('width', swatchSize).attr('height', swatchSize).attr('rx', swatchRadius);
  entered.append('text').attr('x', swatchSize + 6).attr('y', swatchSize - 0.5);
  motion(items.merge(entered), chart.transition.base).style('opacity', 1)
    .attr('transform', (_, index) => {
      const item = layout.items[index];
      return `translate(${item.x},${item.y})`;
    });
  motion(items.merge(entered).select<SVGRectElement>('rect'), chart.transition.base)
    .attr('fill', (value) => activeChannel.hue || activeChannel.luminance
      ? scale(legendRow(value) as RenderDatum & AxisDomain)
      : scale(value as RenderDatum & AxisDomain));
  items.merge(entered).select('text').text((value) => quantitativeLegend ? format('~g')(Number(value)) : String(value));
  motion(items.exit<unknown>(), chart.transition.base).style('opacity', 0).remove();
}

function bindTooltip<E extends Element, D extends object, P extends BaseType, PD>(
  selection: Selection<E, D, P, PD>,
  spec: ViewSpec,
  tooltip: HTMLElement
): void {
  // Any bound datum is read as a row: its `__row` when present, else its own
  // plain fields. d3 types the generic element's pointer events as CustomEvent | MouseEvent.
  selection
    .on('mouseenter', (event, row) => { const html = tooltipHtml(row as RenderDatum, spec.encoding?.tooltip); if (html) showTooltip(tooltip, event as MouseEvent, html); })
    .on('mousemove', (event) => moveTooltip(tooltip, event as MouseEvent))
    .on('mouseleave', () => hideTooltip(tooltip));
}

function showTooltip(tooltip: HTMLElement, event: MouseEvent, html: string): void {
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  moveTooltip(tooltip, event);
}

function moveTooltip(tooltip: HTMLElement, event: MouseEvent): void {
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function hideTooltip(tooltip: HTMLElement): void { tooltip.style.opacity = '0'; }

function markAxisInactive(axisGroup: SvgSelection<AxisElement>): void {
  const node = axisGroup.node();
  if (!node) return;
  node.__visDeltaAxisActive = false;
}

// An axis group is clipped along its own axis to the plot extent, with slack
// for the label of a tick sitting exactly on the range edge. A tick that a
// scale change pushes past the plot is cut off instead of drawn in the margin.
// Across the axis the rect is unbounded (the group's translate varies by side
// and position), so tick marks and labels are never cut.
const AXIS_CLIP_SLACK = 28;

function applyXAxisClip(chart: RenderChartContext): void {
  const id = `vd-x-axis-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, {
    x: -AXIS_CLIP_SLACK,
    y: -chart.height,
    width: chart.innerWidth + AXIS_CLIP_SLACK * 2,
    height: chart.height * 2
  });
  chart.scene.xAxis.attr('clip-path', `url(#${id})`);
}

function applyYAxisClip(chart: RenderChartContext): void {
  const id = `vd-y-axis-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, {
    x: -chart.width,
    y: -AXIS_CLIP_SLACK / 2,
    width: chart.width * 2,
    height: chart.innerHeight + AXIS_CLIP_SLACK
  });
  chart.scene.yAxis.attr('clip-path', `url(#${id})`);
}

/** Grid lines belong to the plot; one pixel of slack keeps an edge line whole. */
function applyGridClip(chart: RenderChartContext): void {
  const id = `vd-grid-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, { x: -1, y: -1, width: chart.innerWidth + 2, height: chart.innerHeight + 2 });
  chart.scene.grid.attr('clip-path', `url(#${id})`);
}

function ensureClipRect(scene: RenderScene, id: string, rect: RectBounds): void {
  let defs = scene.svg.select<SVGDefsElement>('defs');
  if (defs.empty()) defs = scene.svg.append<SVGDefsElement>('defs');
  defs.selectAll(`#${id}`).data([null]).join('clipPath').attr('id', id)
    .selectAll('rect').data([null]).join('rect')
    .attr('x', rect.x).attr('y', rect.y).attr('width', rect.width).attr('height', rect.height);
}

function alignEdgeTickLabels(
  axisGroup: SvgSelection<AxisElement>,
  scale: RuntimeScale
): void {
  if (typeof scale.bandwidth === 'function' || typeof scale.range !== 'function') return;
  const range = scale.range();
  const min = Math.min(...range), max = Math.max(...range);
  axisGroup.selectAll<SVGGElement, unknown>('.tick').each(function(this: SVGGElement) {
    const tick = select(this);
    const match = (tick.attr('transform') || '').match(/translate\(([-\d.]+)/);
    if (!match) return;
    const x = Number(match[1]);
    const text = tick.select('text');
    if (Math.abs(x - min) <= 1) text.attr('text-anchor', 'start').attr('dx', '0.15em');
    else if (Math.abs(x - max) <= 1) text.attr('text-anchor', 'end').attr('dx', '-0.15em');
    else text.attr('text-anchor', 'middle').attr('dx', null);
  });
}

/**
 * D3 ticks optimize for round, evenly spaced labels and may omit the actual
 * observations at either end. Keep data endpoints first, then admit ordinary
 * ticks only when they have enough screen distance from those endpoints.
 */
function prioritizedContinuousTicks(scale: RuntimeScale, count: number, minSpacing: number): unknown[] {
  const ordinary = typeof scale.ticks === 'function' ? scale.ticks(count) : scale.domain();
  const scaleDomain = scale.domain().map((value) => Number(value));
  const domainMin = Math.min(...scaleDomain);
  const domainMax = Math.max(...scaleDomain);
  const endpoints = Array.isArray(scale.__visDeltaDataDomain)
    ? scale.__visDeltaDataDomain.filter((value) => {
        const number = Number(value);
        return value != null && Number.isFinite(number) && number >= domainMin && number <= domainMax;
      })
    : [];
  if (!endpoints.length) return ordinary;
  const valueKey = (value: unknown) => value instanceof Date ? value.getTime() : Number(value);
  const uniqueEndpoints = [...new Map(endpoints.map((value) => [valueKey(value), value])).values()];
  const accepted = [...uniqueEndpoints];
  for (const tick of ordinary) {
    const duplicate = accepted.some((value) => valueKey(value) === valueKey(tick));
    const crowded = uniqueEndpoints.some((value) => Math.abs((scale(value) as number) - (scale(tick) as number)) < minSpacing);
    if (!duplicate && !crowded) accepted.push(tick);
  }
  return accepted.sort((a, b) => (scale(a) as number) - (scale(b) as number));
}

function axisKind(placement: string, scale: RuntimeScale): string {
  return `${placement}:${typeof scale.bandwidth === 'function' ? 'band' : 'continuous'}`;
}

function axisIsEntering(axisGroup: SvgSelection<AxisElement>): boolean {
  const node = axisGroup.node();
  return !node?.__visDeltaAxisActive;
}

function activeAxisSide(
  axisGroup: SvgSelection<AxisElement>,
  fallback: 'top' | 'right' | 'bottom' | 'left'
): 'top' | 'right' | 'bottom' | 'left' {
  const side = String(axisGroup.node()?.__visDeltaAxisKind || '').split(':')[0];
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return sides.includes(side as (typeof sides)[number]) ? side as (typeof sides)[number] : fallback;
}

function activeHorizontalAxisSide(
  axisGroup: SvgSelection<AxisElement>,
  fallback: 'top' | 'bottom'
): 'top' | 'bottom' {
  const side = activeAxisSide(axisGroup, fallback);
  return side === 'top' || side === 'bottom' ? side : fallback;
}

function axisSideTransform(
  chart: RenderChartContext,
  side: 'top' | 'right' | 'bottom' | 'left',
  outside: boolean
): string {
  if (side === 'top') return `translate(${chart.margin.left},${outside ? 0 : chart.margin.top})`;
  if (side === 'right') {
    return `translate(${outside ? chart.width : chart.margin.left + chart.innerWidth},${chart.margin.top})`;
  }
  if (side === 'left') return `translate(${outside ? 0 : chart.margin.left},${chart.margin.top})`;
  return `translate(${chart.margin.left},${outside ? chart.height : chart.margin.top + chart.innerHeight})`;
}

function axisPositionTransform(
  chart: RenderChartContext,
  side: 'top' | 'right' | 'bottom' | 'left',
  position: number | undefined
): string {
  if (!Number.isFinite(position)) return axisSideTransform(chart, side, false);
  if (side === 'top' || side === 'bottom') {
    return `translate(${chart.margin.left},${chart.margin.top + position!})`;
  }
  return `translate(${chart.margin.left + position!},${chart.margin.top})`;
}

function xLabelSideY(
  chart: RenderChartContext,
  side: 'top' | 'bottom',
  outside: boolean,
  offset: number
): number {
  if (side === 'top') return outside ? 0 : chart.margin.top - offset;
  return outside ? chart.height : chart.margin.top + chart.innerHeight + offset;
}

interface LabelTarget { attr(name: string, value: string | number | null): LabelTarget }

function placeYLabel<Label extends LabelTarget>(
  label: Label,
  chart: RenderChartContext,
  side: 'right' | 'left',
  offset: number,
  outside: boolean
) : Label {
  const target = label;
  if (side === 'right') {
    target
      .attr('x', chart.innerHeight / 2)
      .attr('y', outside ? -chart.margin.right : -offset)
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${chart.margin.left + chart.innerWidth},${chart.margin.top}) rotate(90)`);
    return label;
  }
  target
    .attr('x', -chart.innerHeight / 2)
    .attr('y', outside ? 0 : chart.margin.left - offset)
    .attr('text-anchor', 'middle')
    .attr('transform', `translate(0,${chart.margin.top}) rotate(-90)`);
  return label;
}

function placeEdgeXLabel<Label extends LabelTarget>(label: Label, chart: RenderChartContext, inset: Readonly<EdgeTitleInset>): Label {
  label
    .attr('text-anchor', 'end')
    .attr('x', chart.margin.left + chart.innerWidth - inset.right)
    .attr('y', chart.height - inset.bottom)
    .attr('transform', null);
  return label;
}

function placeEdgeYLabel<Label extends LabelTarget>(label: Label, chart: RenderChartContext, inset: Readonly<EdgeTitleInset>): Label {
  label
    .attr('text-anchor', 'start')
    .attr('x', chart.margin.left + inset.left)
    .attr('y', chart.margin.top - inset.top)
    .attr('transform', null);
  return label;
}

function renderAxisWithGuard(
  axisGroup: SvgSelection<AxisElement>,
  axis: Axis<AxisDomain>,
  transition: MotionTransition,
  kind: string,
  duration: number | undefined
): void {
  const node = axisGroup.node();
  const canTransition = node?.__visDeltaAxisActive && node.__visDeltaAxisKind === kind;
  const replacesKind = node?.__visDeltaAxisActive && node.__visDeltaAxisKind !== kind;
  if (node) { node.__visDeltaAxisActive = true; node.__visDeltaAxisKind = kind; }
  const orient = axisOrient(kind);
  if (canTransition) {
    renderAxis(axisGroup, axis, orient, (selection) => timedTransition(selection, transition, duration));
    return;
  }
  if (replacesKind) {
    fadeClone(axisGroup, 'vd-axis vd-axis-ghost', transition, duration);
    renderAxis(axisGroup, axis, orient, null);
    axisGroup.style('opacity', 0);
    return;
  }
  renderAxis(axisGroup, axis, orient, null);
}

/** Axis kinds are `${placement}:${scale}`; grid placements are prefixed `grid-`. */
function axisOrient(kind: string): AxisOrient {
  const placement = kind.split(':')[0].replace(/^grid-/, '');
  return placement === 'top' || placement === 'right' || placement === 'bottom' ? placement : 'left';
}

function transitionAxisLabel(
  label: SvgSelection<SVGTextElement>,
  title: string,
  transition: MotionTransition,
  duration: number | undefined
): Motion<SVGTextElement, unknown> {
  const previousTitle = label.text();
  // An axis has one meaning in each frame, so it must have one label node.
  // Keep incompatible axis geometry ghosts, but never duplicate title text.
  label.node()?.parentNode?.querySelectorAll?.('.vd-axis-label-ghost')
    .forEach((node) => node.remove());
  if (previousTitle && previousTitle !== title) {
    label.text(previousTitle).style('opacity', 1);
    return timedTransition(label, transition, duration)
      .tween('text', function(this: Element) {
        return (progress: number) => { this.textContent = progress < 0.5 ? previousTitle : title; };
      })
      .style('opacity', 1);
  }
  label.text(title);
  return timedTransition(label, transition, duration).style('opacity', 1);
}

function fadeClone<ElementType extends BaseType, Datum>(
  selection: Selection<ElementType, Datum, any, any>,
  className: string,
  transition: MotionTransition,
  duration: number | undefined
): void {
  const clone = selection.clone(true).attr('class', className).attr('aria-hidden', 'true');
  timedTransition(clone, transition, duration).style('opacity', 0).remove();
}

function timedTransition<ElementType extends BaseType, Datum>(
  selection: Selection<ElementType, Datum, any, any>,
  transition: MotionTransition,
  duration: number | undefined
): Motion<ElementType, Datum> {
  return motion(selection, Number.isFinite(Number(duration))
    ? { ...transition, duration: Math.max(0, Number(duration)) }
    : transition);
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

function luminanceColorScale(
  rows: RenderDatum[],
  channel: RenderChannel
): (row: RenderDatum) => string {
  const domain = quantitativeDomain(rows, channel);
  const base = cssColor(channel.base || channel.value || themeColor(DEFAULT_LUMINANCE_BASE), '#4e79a7');
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

function cssColor(color: unknown, fallback = '#4e79a7'): string {
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
  const hueScale = scaleOrdinal<AxisDomain, string>(colorRange(hue.range || categoricalRange(hueDomain)))
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
    const base = cssColor(hue.value || hueScale(row[hueField!] as AxisDomain), '#4e79a7');
    const luminanceValue = luminanceField ? row[luminanceField] : undefined;
    const offset = luminanceField && (continuousLuminance || luminanceDomain.includes(luminanceValue))
      ? Number(lightnessOffset(luminanceValue)) || 0
      : 0;
    return adjustLightness(base, offset);
  };
}

function adjustLightness(color: unknown, offset: number): string {
  const resolved = cssColor(color, '#4e79a7');
  const hcl = toHcl(resolved);
  if (!Number.isFinite(hcl.l)) return resolved;
  hcl.l = clamp(hcl.l + offset, 0, 100);
  return hcl.formatHex();
}

function quantitativeLegendDomain(rows: RenderDatum[], channel: RenderChannel): number[] {
  const [min, max] = quantitativeDomain(rows, channel);
  if (min === max) return [min];
  return ticks(min, max, 3);
}

function legendLayout(domain: unknown[], availableWidth: number, swatchSize: number) {
  const rowHeight = Math.max(14, swatchSize + 5);
  const width = Math.max(1, Number(availableWidth) || 1);
  const items: LegendLayoutItem[] = [];
  let x = 0;
  let row = 0;
  domain.forEach((value) => {
    const itemWidth = Math.max(30, String(value).length * 6.25 + swatchSize + 18);
    if (x > 0 && x + itemWidth > width) {
      row += 1;
      x = 0;
    }
    items.push({ x, y: row * rowHeight });
    x += itemWidth;
  });
  const rows = domain.length ? row + 1 : 0;
  return { items, rows, height: rows * rowHeight };
}

function tooltipHtml(row: RenderDatum, tooltipSpec: unknown): string {
  if (tooltipSpec === false) return '';
  const source = row?.__row && typeof row.__row === 'object' ? row.__row : row;
  const items = Array.isArray(tooltipSpec)
    ? tooltipSpec
    : Object.keys(source || {})
        .filter((field) => !field.startsWith('__') && (source[field] == null || typeof source[field] !== 'object'))
        .map((field) => ({ field, title: titleize(field) }));
  return items
    .map((item) => `<strong>${escapeHtml(item.title || titleize(item.field))}</strong>: ${escapeHtml(source[item.field])}`)
    .join('<br>');
}

return { pickCategoricalColors, themeValue, transitionSpec, effectiveTransitionSpec, easeFor, activeMarkLayer, fadeLayers, staggerDelay, fadeNonBarShapes, fadeNonLineShapes, fadeNonPointShapes, fadeNonUnitShapes, applyPlotClip, drawUnsupported, bandOrLinear, quantitativeScale, position, niceExtent, quantitativeDomain, channelDomain, colorScale, drawXAxis, drawYAxis, drawGrid, updateGrid, drawLegend, bindTooltip, showTooltip, moveTooltip, hideTooltip, markAxisInactive };
}

// Context-free utilities are shared by chart modules through dependency injection.
export const { pickCategoricalColors, themeValue, transitionSpec, effectiveTransitionSpec, easeFor, activeMarkLayer, fadeLayers, staggerDelay, fadeNonBarShapes, fadeNonLineShapes, fadeNonPointShapes, fadeNonUnitShapes, applyPlotClip, drawUnsupported, bandOrLinear, quantitativeScale, position, niceExtent, quantitativeDomain, channelDomain, colorScale, drawXAxis, drawYAxis, drawGrid, updateGrid, drawLegend, bindTooltip, showTooltip, moveTooltip, hideTooltip, markAxisInactive } = createMarkHelpers();
