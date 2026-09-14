// @ts-nocheck — D3 rendering utilities; typed via deps injection
import { specTransition } from '../spec-meta.js';
import { DEFAULT_MARK_DELAY, DEFAULT_TIMING, defaultTransition } from '../timing.js';
import { VISDELTA_TRANSITION_NAME } from '../transition-progress.js';
import { clamp, escapeHtml, titleize } from './utils.js';
import { channelValue, inferFieldType } from '../data/types.js';
import type { ChartStyleModule } from '../charts/style.js';

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
const DEFAULT_PALETTE = [
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
const DEFAULT_LUMINANCE_BASE = ['--vd-accent', '#4e79a7'];

// ─── Hue-maximisation helpers ─────────────────────────────────────────────────

// Circular angular distance between two hue angles (0–180°).
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Extract hue angle (0–360°) from a CSS color string.
// Supports #rrggbb, #rgb, and rgb(r,g,b).
// Returns null for near-achromatic colors (saturation range < 10 %).
function parseColorHue(color) {
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
function pickCategoricalColors(n, colors) {
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
        const minDist = Math.min(...chosen.map((j) => hueDist(hues[i], hues[j])));
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
function themeValue(cssVar, fallback) {
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

function transitionSpec(spec, previousSpec, { seekable = false, d3 } = {}) {
  if (!d3) throw new Error('VisDelta transitions require D3. Pass { d3 } to transition() or the driver runtime.');
  const local = specTransition(spec);
  const previous = previousSpec ? specTransition(previousSpec) : {};
  const transition = { ...defaultTransition(), ...previous, ...local };
  const ease = easeFor(transition.ease, d3);
  const base = (seekable ? d3.transition(VISDELTA_TRANSITION_NAME) : d3.transition())
    .duration(transition.duration).ease(ease);
  return { ...transition, base };
}

function effectiveTransitionSpec(spec = {}) {
  return defaultTransition(specTransition(spec));
}

function easeFor(name, d3) {
  const eases = {
    linear: d3.easeLinear, cubic: d3.easeCubic, cubicInOut: d3.easeCubicInOut,
    exp: d3.easeExp, expInOut: d3.easeExpInOut, elastic: d3.easeElasticOut, back: d3.easeBackOut
  };
  return eases[name] || d3.easeCubicInOut;
}

function activeMarkLayer(scene, mark, transition) {
  fadeLayers(scene, mark, transition);
  if (!scene.markLayers.has(mark)) {
    scene.markLayers.set(mark, scene.markRoot.append('g').attr('class', `vd-mark-layer vd-${mark}-layer`));
  }
  const layer = scene.markLayers.get(mark);
  layer.interrupt().style('display', null).transition(transition.base).style('opacity', 1);
  return layer;
}

function fadeLayers(scene, activeMark, transition = null, d3 = null) {
  const resolvedTransition = transition || { base: d3.transition().duration(300) };
  scene.markLayers.forEach((layer, mark) => {
    if (mark === activeMark) return;
    layer.interrupt().transition(resolvedTransition.base).style('opacity', 0);
  });
}

function staggerDelay(spec, datum, index, override) {
  const stagger = override === undefined ? effectiveTransitionSpec(spec).stagger : override;
  if (!stagger) return 0;
  if (typeof stagger === 'number') return index * stagger;
  const step = stagger.step ?? stagger.ms ?? DEFAULT_MARK_DELAY.step;
  const max = stagger.max ?? DEFAULT_MARK_DELAY.max;
  if (stagger.by) {
    const value = Number(datum[stagger.by] ?? datum.__row?.[stagger.by] ?? index);
    if (Number.isFinite(value)) return Math.min(value * step, max);
  }
  return Math.min(index * step, max);
}

function drawPath(selection, transition, d3) {
  selection.each(function() {
    const path = d3.select(this);
    const total = this.getTotalLength();
    path.attr('stroke-dasharray', `${total} ${total}`)
      .attr('stroke-dashoffset', total)
      .style('opacity', 1)
      .transition(transition)
      .attr('stroke-dashoffset', 0)
      .on('end', function() {
        d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      });
  });
}

function fadeNonBarShapes(chart) {
  chart.g.selectAll('circle,path:not(.vd-line)').transition(chart.transition.base).style('opacity', 0);
}

function fadeNonLineShapes(chart) {
  chart.g.selectAll('rect.vd-bar,circle.vd-point,circle.vd-unit').transition(chart.transition.base).style('opacity', 0);
}

function fadeNonPointShapes(chart) {
  chart.g.selectAll('rect.vd-bar,path.vd-line,circle.vd-line-point,circle.vd-unit').transition(chart.transition.base).style('opacity', 0);
}

function fadeNonUnitShapes(chart) {
  chart.g.selectAll('rect.vd-bar,path.vd-line,circle.vd-line-point,circle.vd-point').transition(chart.transition.base).style('opacity', 0);
}

function applyPlotClip(chart, enabled) {
  if (!enabled) { chart.g.attr('clip-path', null); return; }
  const id = `vd-mark-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, { x: 0, y: 0, width: chart.innerWidth, height: chart.innerHeight });
  chart.g.attr('clip-path', `url(#${id})`);
}

function drawUnsupported(chart, spec, availableTypes = []) {
  chart.g.append('text')
    .attr('x', chart.innerWidth / 2).attr('y', chart.innerHeight / 2)
    .attr('text-anchor', 'middle').attr('fill', 'var(--vd-muted)')
    .text(`Unsupported chart type "${spec.mark}"${availableTypes.length ? ` · available: ${availableTypes.join(', ')}` : ''}`);
}

function bandOrLinear(rows, channel, range, d3, options = {}) {
  if (!channel) return d3.scaleLinear().domain([0, 1]).range(range);
  const resolved = channel.field && !channel.type
    ? { ...channel, type: inferFieldType(rows, channel.field) }
    : channel;
  let scale;
  if (resolved.type === 'quantitative') scale = quantitativeScale(rows, resolved, range, d3, options);
  else if (resolved.type === 'temporal') {
    const explicitDomain = Array.isArray(resolved.domain);
    const dataDomain = d3.extent(rows, (d) => channelValue(d[resolved.field], resolved));
    const domain = (resolved.domain || d3.extent(rows, (d) => channelValue(d[resolved.field], resolved)))
      .map((value) => channelValue(value, resolved));
    scale = d3.scaleTime().domain(domain).range(range).nice();
    scale.__visDeltaDataDomain = dataDomain;
    if (!explicitDomain) padContinuousDomain(scale, options.domainPadding);
  } else {
    scale = d3.scaleBand().domain(channelDomain(rows, resolved)).range(range).padding(0.24);
  }
  scale.__visDeltaChannel = resolved;
  return scale;
}

function quantitativeScale(rows, channel = {}, range, d3, options = {}) {
  const scaleType = channel.scale?.type || channel.scaleType || 'linear';
  const domain = quantitativeDomain(rows, channel, scaleType === 'log' ? 1 : undefined);
  const values = rows.map((row) => Number(row[channel.field])).filter(Number.isFinite);
  const dataDomain = values.length ? d3.extent(values) : domain;
  const explicitDomain = Array.isArray(channel.domain);
  let scale;
  if (scaleType === 'log') {
    const safeDomain = domain.map((value) => Math.max(Number(value) || 1, 0.1));
    scale = d3.scaleLog().domain(safeDomain).range(range).nice();
  } else if (scaleType === 'sqrt') {
    scale = d3.scaleSqrt().domain(domain).range(range).nice();
  } else {
    scale = d3.scaleLinear().domain(domain).range(range).nice();
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
function padContinuousDomain(scale, padding = 0) {
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
  scale.domain([projection.invert(start), projection.invert(end)]);
  return scale;
}

function position(scale, value) {
  const scaled = scale(channelValue(value, scale.__visDeltaChannel));
  if (typeof scale.bandwidth === 'function') return scaled + scale.bandwidth() / 2;
  return scaled;
}

function niceExtent(rows, field, floor) {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  if (!values.length) return [0, 1];
  const min = floor ?? Math.min(...values);
  const max = Math.max(...values);
  return min === max ? [min - 1, max + 1] : [min, max];
}

function quantitativeDomain(rows, channel = {}, floor) {
  if (Array.isArray(channel.domain)) return channel.domain;
  return niceExtent(rows, channel.field, floor);
}

function channelDomain(rows, channel = {}) {
  if (Array.isArray(channel.domain)) return channel.domain;
  return Array.from(new Set(rows.map((row) => row[channel.field])));
}

function colorScale(rows, channel, d3) {
  const resolved = resolveColorChannel(rows, channel);
  if (!resolved) return () => themeColor(DEFAULT_LUMINANCE_BASE);
  channel = resolved;
  if (channel.value) return () => cssColor(channel.value, '#4e79a7');
  if (channel.hue || channel.luminance) return compositeColorScale(channel, d3);
  if (!channel.field) return () => themeColor(DEFAULT_LUMINANCE_BASE);
  if (channel.type === 'quantitative') return luminanceColorScale(rows, channel, d3);
  // Use the transition registry for consistent key→color mapping across frames.
  const fieldRegistry = !channel.range && context.colors?.get(channel.field);
  if (fieldRegistry) {
    const fallback = themeColor(DEFAULT_LUMINANCE_BASE);
    return (row) => fieldRegistry.get(String(row[channel.field])) ?? fallback;
  }
  const domain = channelDomain(rows, channel);
  const scale = d3.scaleOrdinal(colorRange(channel.range || categoricalRange(domain))).domain(domain);
  return (row) => scale(row[channel.field]);
}

function drawXAxis(chart, scale, title, d3, transition = chart.transition.base, options = {}) {
  const side = options.side === 'top' ? 'top' : 'bottom';
  const duration = options.duration;
  if (!scale) {
    const inactiveSide = activeAxisSide(chart.scene.xAxis, side);
    markAxisInactive(chart.scene.xAxis);
    timedTransition(chart.scene.xAxis, transition, duration)
      .attr('transform', axisSideTransform(chart, inactiveSide, true))
      .style('opacity', 0);
    timedTransition(chart.scene.xLabel, transition, duration)
      .attr('transform', `translate(${chart.margin.left},0)`)
      .attr('y', xLabelSideY(chart, inactiveSide, true, themeValue('--vd-axis-label-offset', 48)))
      .style('opacity', 0);
    return;
  }
  applyXAxisClip(chart);
  const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
  const labelOffset = themeValue('--vd-axis-label-offset', 48);
  const axisFactory = side === 'top' ? d3.axisTop : d3.axisBottom;
  let axis = typeof scale.bandwidth === 'function'
    ? axisFactory(scale)
    : axisFactory(scale).ticks(tickCount, options.tickFormat);
  if (typeof scale.bandwidth !== 'function') {
    axis = axis.tickValues(prioritizedContinuousTicks(scale, tickCount, 44));
  }
  axis = axis.tickSizeOuter(0);
  // Adaptive label thinning for band (categorical) x-axes:
  // when available px-per-band < threshold, skip every Nth label so they never overlap.
  if (typeof scale.bandwidth === 'function') {
    const domain = scale.domain();
    const minPxPerLabel = 44; // ~5 chars × 7px + 9px padding
    const pxPerBand = scale.step();
    if (pxPerBand < minPxPerLabel) {
      const step = Math.ceil(minPxPerLabel / pxPerBand);
      axis = axis.tickValues(domain.filter((_, i) => i % step === 0));
    }
  }
  const kind = axisKind(side, scale);
  const xAxis = chart.scene.xAxis.interrupt();
  const entersFromSide = axisIsEntering(xAxis);
  renderAxisWithGuard(xAxis, axis, transition, kind, duration);
  if (entersFromSide) {
    xAxis.attr('transform', axisSideTransform(chart, side, true)).style('opacity', 0);
  }
  xAxis.selectAll('.tick text').attr('dy', '0.8em');
  alignEdgeTickLabels(xAxis, scale, d3);
  timedTransition(xAxis, transition, duration)
    .attr('transform', axisPositionTransform(chart, side, options.position))
    .style('opacity', 1);
  if (title) {
    const xLabel = chart.scene.xLabel.interrupt();
    const xLabelTransition = transitionAxisLabel(xLabel, title, transition, duration);
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
  } else {
    timedTransition(chart.scene.xLabel, transition, duration).style('opacity', 0);
  }
}

function drawYAxis(chart, scale, title, d3, transition = chart.transition.base, options = {}) {
  const side = options.side === 'right' ? 'right' : 'left';
  const duration = options.duration;
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
  const axisFactory = side === 'right' ? d3.axisRight : d3.axisLeft;
  let axis = typeof scale.bandwidth === 'function'
    ? axisFactory(scale)
    : axisFactory(scale).ticks(tickCount, options.tickFormat);
  if (typeof scale.bandwidth !== 'function') {
    axis = axis.tickValues(prioritizedContinuousTicks(scale, tickCount, 22));
  }
  axis = axis.tickSizeOuter(0);
  // Adaptive label thinning for band (categorical) y-axes (horizontal bar charts):
  if (typeof scale.bandwidth === 'function') {
    const domain = scale.domain();
    const minPxPerLabel = 22; // vertical: ~1 line height
    const pxPerBand = scale.step();
    if (pxPerBand < minPxPerLabel) {
      const step = Math.ceil(minPxPerLabel / pxPerBand);
      axis = axis.tickValues(domain.filter((_, i) => i % step === 0));
    }
  }
  const kind = axisKind(side, scale);
  const yAxis = chart.scene.yAxis.interrupt();
  const entersFromSide = axisIsEntering(yAxis);
  renderAxisWithGuard(yAxis, axis, transition, kind, duration);
  if (entersFromSide) {
    yAxis.attr('transform', axisSideTransform(chart, side, true)).style('opacity', 0);
  }
  timedTransition(yAxis, transition, duration)
    .attr('transform', axisPositionTransform(chart, side, options.position))
    .style('opacity', 1);
  if (title) {
    const yLabel = chart.scene.yLabel.interrupt();
    const yLabelTransition = transitionAxisLabel(yLabel, title, transition, duration);
    if (entersFromSide) placeYLabel(yLabel, chart, side, labelOffset, true).style('opacity', 0);
    placeYLabel(yLabelTransition, chart, side, labelOffset, false);
  } else {
    timedTransition(chart.scene.yLabel, transition, duration).style('opacity', 0);
  }
}

function drawGrid(chart, y, d3, transition = chart.transition.base, options = {}) {
  updateGrid(chart, y, d3, transition, {
    keepX: Boolean(options.x),
    tickCount: options.yTickCount,
    duration: options.duration
  });
  updateXGrid(chart, options.x, d3, transition, options.xTickCount, options.duration);
}

function updateGrid(chart, y, d3, transition = chart.transition.base, options = {}) {
  if (!options.keepX) updateXGrid(chart, null, d3, transition, undefined, options.duration);
  if (!y) {
    markAxisInactive(chart.scene.grid);
    timedTransition(chart.scene.grid, transition, options.duration).style('opacity', options.keepX ? 1 : 0);
    return;
  }
  const grid = chart.scene.grid.interrupt().attr('transform', null);
  const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
  renderAxisWithGuard(grid, d3.axisLeft(y)
    .ticks(tickCount)
    .tickValues(prioritizedContinuousTicks(y, tickCount, 22))
    .tickSize(-chart.innerWidth)
    .tickFormat(''), transition, axisKind('grid-left', y), options.duration);
  timedTransition(grid, transition, options.duration).style('opacity', 1);
}

function updateXGrid(chart, x, d3, transition, tickCount, duration) {
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
  layer.interrupt().style('opacity', 1)
    .selectAll('line')
    .data(values, (value) => String(value))
    .join(
      (enter) => {
        const entered = enter.append('line')
          .attr('x1', (value) => x(value))
          .attr('x2', (value) => x(value))
          .attr('y1', 0)
          .attr('y2', chart.innerHeight)
          .style('opacity', 0);
        return timedTransition(entered, transition, duration).style('opacity', 1);
      },
      (update) => timedTransition(update, transition, duration)
        .attr('x1', (value) => x(value))
        .attr('x2', (value) => x(value))
        .attr('y1', 0)
        .attr('y2', chart.innerHeight)
        .style('opacity', 1),
      (exit) => timedTransition(exit, transition, duration).style('opacity', 0).remove()
    );
}

function drawLegend(chart, rows, channel, d3) {
  const colorRows = chart.domainRows?.length ? chart.domainRows : rows;
  channel = resolveColorChannel(colorRows, channel);
  if (!channel || channel.value || (!channel.field && !channel.hue && !channel.luminance)) {
    chart.scene.legend.transition(chart.transition.base).style('opacity', 0);
    return;
  }
  const legendChannel = channel.hue?.field ? channel.hue : channel.luminance?.field ? channel.luminance : channel;
  const quantitativeLegend = legendChannel.type === 'quantitative';
  const domain = quantitativeLegend
    ? quantitativeLegendDomain(colorRows, legendChannel, d3)
    : channelDomain(colorRows, legendChannel);
  const fieldRegistry = !channel.range && !channel.hue && !channel.luminance && !quantitativeLegend
    ? context.colors?.get(legendChannel.field)
    : null;
  const scale = channel.hue || channel.luminance
    ? compositeColorScale(channel, d3)
    : quantitativeLegend
      ? luminanceColorScale(colorRows, legendChannel, d3)
      : fieldRegistry
        ? (d) => fieldRegistry.get(String(d)) ?? themeColor(DEFAULT_LUMINANCE_BASE)
        : d3.scaleOrdinal(channel.range || categoricalRange(domain)).domain(domain);
  const legendRow = (value) => ({ [legendChannel.field]: value });
  const swatchSize = themeValue('--vd-legend-swatch-size', 9);
  const swatchRadius = themeValue('--vd-legend-swatch-radius', 1.5);
  const legendInset = context.chartStyle?.legendInset ?? { top: 8, left: 8 };
  const atRight = context.chartStyle?.legendPosition === 'right';
  const layout = legendLayout(
    domain,
    atRight ? 1 : chart.innerWidth,
    swatchSize
  );
  const legend = chart.scene.legend.interrupt().style('opacity', 1)
    .attr('transform', `translate(${chart.margin.left + legendInset.left + (atRight ? chart.innerWidth : 0)},${legendInset.top + (atRight ? chart.margin.top : 0)})`);
  const items = legend.selectAll('g.vd-legend-item').data(domain, (d) => d);
  const entered = items.enter().append('g').attr('class', 'vd-legend-item').style('opacity', 0);
  entered.append('rect').attr('width', swatchSize).attr('height', swatchSize).attr('rx', swatchRadius);
  entered.append('text').attr('x', swatchSize + 6).attr('y', swatchSize - 0.5);
  items.merge(entered).transition(chart.transition.base).style('opacity', 1)
    .attr('transform', (_, index) => {
      const item = layout.items[index];
      return `translate(${item.x},${item.y})`;
    });
  items.merge(entered).select('rect').transition(chart.transition.base)
    .attr('fill', (d) => channel.hue || channel.luminance ? scale(legendRow(d)) : scale(d));
  items.merge(entered).select('text').text((d) => quantitativeLegend ? d3.format('~g')(d) : d);
  items.exit().transition(chart.transition.base).style('opacity', 0).remove();
}

function bindTooltip(selection, spec, tooltip) {
  selection
    .on('mouseenter', (event, row) => { const html = tooltipHtml(row, spec.encoding?.tooltip); if (html) showTooltip(tooltip, event, html); })
    .on('mousemove', (event) => moveTooltip(tooltip, event))
    .on('mouseleave', () => hideTooltip(tooltip));
}

function showTooltip(tooltip, event, html) {
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  moveTooltip(tooltip, event);
}

function moveTooltip(tooltip, event) {
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function hideTooltip(tooltip) { tooltip.style.opacity = '0'; }

function markAxisInactive(axisGroup) {
  const node = axisGroup.node();
  if (!node) return;
  node.__visDeltaAxisActive = false;
}

function applyXAxisClip(chart) {
  const id = `vd-x-axis-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, { x: -28, y: -8, width: chart.innerWidth + 56, height: 72 });
  chart.scene.xAxis.attr('clip-path', `url(#${id})`);
}

function ensureClipRect(scene, id, rect) {
  let defs = scene.svg.select('defs');
  if (defs.empty()) defs = scene.svg.append('defs');
  defs.selectAll(`#${id}`).data([null]).join('clipPath').attr('id', id)
    .selectAll('rect').data([null]).join('rect')
    .attr('x', rect.x).attr('y', rect.y).attr('width', rect.width).attr('height', rect.height);
}

function alignEdgeTickLabels(axisGroup, scale, d3) {
  if (typeof scale.bandwidth === 'function' || typeof scale.range !== 'function') return;
  const range = scale.range();
  const min = Math.min(...range), max = Math.max(...range);
  axisGroup.selectAll('.tick').each(function() {
    const tick = d3.select(this);
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
function prioritizedContinuousTicks(scale, count, minSpacing) {
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
  const valueKey = (value) => value instanceof Date ? value.getTime() : Number(value);
  const uniqueEndpoints = [...new Map(endpoints.map((value) => [valueKey(value), value])).values()];
  const accepted = [...uniqueEndpoints];
  for (const tick of ordinary) {
    const duplicate = accepted.some((value) => valueKey(value) === valueKey(tick));
    const crowded = uniqueEndpoints.some((value) => Math.abs(scale(value) - scale(tick)) < minSpacing);
    if (!duplicate && !crowded) accepted.push(tick);
  }
  return accepted.sort((a, b) => scale(a) - scale(b));
}

function axisKind(placement, scale) {
  return `${placement}:${typeof scale.bandwidth === 'function' ? 'band' : 'continuous'}`;
}

function axisIsEntering(axisGroup) {
  const node = axisGroup.node();
  return !node?.__visDeltaAxisActive;
}

function activeAxisSide(axisGroup, fallback) {
  const side = String(axisGroup.node()?.__visDeltaAxisKind || '').split(':')[0];
  return ['top', 'right', 'bottom', 'left'].includes(side) ? side : fallback;
}

function axisSideTransform(chart, side, outside) {
  if (side === 'top') return `translate(${chart.margin.left},${outside ? 0 : chart.margin.top})`;
  if (side === 'right') {
    return `translate(${outside ? chart.width : chart.margin.left + chart.innerWidth},${chart.margin.top})`;
  }
  if (side === 'left') return `translate(${outside ? 0 : chart.margin.left},${chart.margin.top})`;
  return `translate(${chart.margin.left},${outside ? chart.height : chart.margin.top + chart.innerHeight})`;
}

function axisPositionTransform(chart, side, position) {
  if (!Number.isFinite(position)) return axisSideTransform(chart, side, false);
  if (side === 'top' || side === 'bottom') {
    return `translate(${chart.margin.left},${chart.margin.top + position})`;
  }
  return `translate(${chart.margin.left + position},${chart.margin.top})`;
}

function xLabelSideY(chart, side, outside, offset) {
  if (side === 'top') return outside ? 0 : chart.margin.top - offset;
  return outside ? chart.height : chart.margin.top + chart.innerHeight + offset;
}

function placeYLabel(label, chart, side, offset, outside) {
  if (side === 'right') {
    return label
      .attr('x', chart.innerHeight / 2)
      .attr('y', outside ? -chart.margin.right : -offset)
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${chart.margin.left + chart.innerWidth},${chart.margin.top}) rotate(90)`);
  }
  return label
    .attr('x', -chart.innerHeight / 2)
    .attr('y', outside ? 0 : chart.margin.left - offset)
    .attr('text-anchor', 'middle')
    .attr('transform', `translate(0,${chart.margin.top}) rotate(-90)`);
}

function renderAxisWithGuard(axisGroup, axis, transition, kind, duration) {
  const node = axisGroup.node();
  const canTransition = node?.__visDeltaAxisActive && node.__visDeltaAxisKind === kind;
  const replacesKind = node?.__visDeltaAxisActive && node.__visDeltaAxisKind !== kind;
  if (node) { node.__visDeltaAxisActive = true; node.__visDeltaAxisKind = kind; }
  if (canTransition) { timedTransition(axisGroup, transition, duration).call(axis); return; }
  if (replacesKind) {
    fadeClone(axisGroup, 'vd-axis vd-axis-ghost', transition, duration);
    axisGroup.call(axis).style('opacity', 0);
    return;
  }
  axisGroup.call(axis);
}

function transitionAxisLabel(label, title, transition, duration) {
  const previousTitle = label.text();
  // An axis has one meaning in each frame, so it must have one label node.
  // Keep incompatible axis geometry ghosts, but never duplicate title text.
  label.node()?.parentNode?.querySelectorAll?.('.vd-axis-label-ghost')
    .forEach((node) => node.remove());
  if (previousTitle && previousTitle !== title) {
    label.text(previousTitle).style('opacity', 1);
    return timedTransition(label, transition, duration)
      .tween('text', function() {
        return (progress) => { this.textContent = progress < 0.5 ? previousTitle : title; };
      })
      .style('opacity', 1);
  }
  label.text(title);
  return timedTransition(label, transition, duration).style('opacity', 1);
}

function fadeClone(selection, className, transition, duration) {
  const clone = selection.clone(true).attr('class', className).attr('aria-hidden', 'true');
  timedTransition(clone, transition, duration).style('opacity', 0).remove();
}

function timedTransition(selection, transition, duration) {
  const scheduled = selection.transition(transition);
  return Number.isFinite(Number(duration))
    ? scheduled.duration(Math.max(0, Number(duration)))
    : scheduled;
}

function resolveColorChannel(rows, channel) {
  if (channel === false) return null;
  // Color is a data encoding only when the author declares one. With no
  // channel, renderers use the single theme accent and draw no legend.
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

function normalizeColorSubchannel(rows, channel = {}) {
  if (!channel.field) return channel;
  return { ...channel, type: channel.type || inferFieldType(rows, channel.field) };
}

// Automatic categorical color assignment: resolve the active palette from CSS
// variables, then use greedy farthest-first hue selection so that the n chosen
// colors are as distinct as possible (Rules #4 + #5).
function categoricalRange(domain) {
  const resolved = DEFAULT_PALETTE.map((entry) => themeColor(entry));
  // Sequential slot assignment: Nth category → series-N. Consistent with the
  // stacked/grouped bar chart's explicit 'var(--vd-series-N)' range and with
  // the transition registry, so fallback frames never get mismatched colors.
  return domain.map((_, i) => resolved[i % resolved.length]);
}

function luminanceColorScale(rows, channel, d3) {
  const domain = quantitativeDomain(rows, channel);
  const base = cssColor(channel.base || channel.value || themeColor(DEFAULT_LUMINANCE_BASE), '#4e79a7');
  const lightness = channel.lightness || [22, -18];
  const scale = d3.scaleLinear().domain(domain).range(lightness).clamp(true);
  return (row = {}) => adjustLightness(base, scale(Number(row[channel.field])), d3);
}

function themeColor([name, fallback] = []) {
  if (!name) return fallback;
  return themeValue(name, fallback);
}

function colorRange(range = []) {
  return range.map((color, index) => cssColor(color, themeColor(DEFAULT_PALETTE[index % DEFAULT_PALETTE.length])));
}

function cssColor(color, fallback = '#4e79a7') {
  if (typeof color !== 'string') return color || fallback;
  const value = color.trim();
  if (!value.startsWith('var(')) return value || fallback;
  if (typeof document === 'undefined') return fallback;
  const name = value.match(/^var\(\s*(--[^,\s)]+)/)?.[1];
  if (!name) return fallback;
  const resolved = getComputedStyle(context.root ?? document.documentElement).getPropertyValue(name).trim();
  const inlineFallback = value.match(/,\s*([^)]+)\)$/)?.[1]?.trim();
  return resolved || inlineFallback || fallback;
}

function compositeColorScale(channel, d3) {
  const hue = channel.hue || {};
  const luminance = channel.luminance || {};
  const hueDomain = hue.domain || [];
  const hueScale = d3.scaleOrdinal(colorRange(hue.range || categoricalRange(hueDomain))).domain(hueDomain);
  const luminanceDomain = luminance.domain || [];
  const continuousLuminance = luminance.type === 'quantitative' ||
    (luminanceDomain.length === 2 && luminanceDomain.every((value) => Number.isFinite(Number(value))));
  const lightness = luminance.lightness || [18, 0, -18];
  const lightnessScale = continuousLuminance
    ? d3.scaleLinear().domain(luminanceDomain.map(Number)).range([lightness[0], lightness[lightness.length - 1]]).clamp(true)
    : d3.scaleOrdinal(lightness).domain(luminanceDomain);
  return (row = {}) => {
    const base = cssColor(hue.value || hueScale(row[hue.field]), '#4e79a7');
    const luminanceValue = row[luminance.field];
    const offset = luminance.field && (continuousLuminance || luminanceDomain.includes(luminanceValue))
      ? Number(lightnessScale(continuousLuminance ? Number(luminanceValue) : luminanceValue)) || 0
      : 0;
    return adjustLightness(base, offset, d3);
  };
}

function adjustLightness(color, offset, d3) {
  const resolved = cssColor(color, '#4e79a7');
  const hcl = d3.hcl(resolved);
  if (!Number.isFinite(hcl.l)) return resolved;
  hcl.l = clamp(hcl.l + offset, 0, 100);
  return hcl.formatHex();
}

function quantitativeLegendDomain(rows, channel, d3) {
  const [min, max] = quantitativeDomain(rows, channel);
  if (min === max) return [min];
  return d3.ticks(min, max, 3);
}

function legendLayout(domain, availableWidth, swatchSize) {
  const rowHeight = Math.max(14, swatchSize + 5);
  const width = Math.max(1, Number(availableWidth) || 1);
  const items = [];
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

function tooltipHtml(row, tooltipSpec) {
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

return { pickCategoricalColors, themeValue, transitionSpec, effectiveTransitionSpec, easeFor, activeMarkLayer, fadeLayers, staggerDelay, drawPath, fadeNonBarShapes, fadeNonLineShapes, fadeNonPointShapes, fadeNonUnitShapes, applyPlotClip, drawUnsupported, bandOrLinear, quantitativeScale, position, niceExtent, quantitativeDomain, channelDomain, colorScale, drawXAxis, drawYAxis, drawGrid, updateGrid, drawLegend, bindTooltip, showTooltip, moveTooltip, hideTooltip, markAxisInactive };
}

// Context-free utilities are shared by chart modules through dependency injection.
export const { pickCategoricalColors, themeValue, transitionSpec, effectiveTransitionSpec, easeFor, activeMarkLayer, fadeLayers, staggerDelay, drawPath, fadeNonBarShapes, fadeNonLineShapes, fadeNonPointShapes, fadeNonUnitShapes, applyPlotClip, drawUnsupported, bandOrLinear, quantitativeScale, position, niceExtent, quantitativeDomain, channelDomain, colorScale, drawXAxis, drawYAxis, drawGrid, updateGrid, drawLegend, bindTooltip, showTooltip, moveTooltip, hideTooltip, markAxisInactive } = createMarkHelpers();
