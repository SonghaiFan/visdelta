import { BaseChart } from '../base.js';
import { cameraScale, cameraSize, focusCamera, matchesSelection, pointBounds, viewHighlight, viewSelection } from '../../focus.js';
import { applyTransforms } from '../../data/transforms.js';
import { drawPointAxes } from './axes.js';
import { applyPointIdentity, pointKeyAccessor, pointStoredKey } from './keys.js';
import { defaultPointRadius, parentAnchors, parentKey, pointState, radiusScale } from './state.js';
import type { PointState } from './state.js';
import { motion } from '../../runtime/recorder.js';
import type { MotionTiming } from '../../runtime/recorder.js';
import type { RenderDatum, RuntimeScale } from '../../runtime/marks.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { ChannelSpec, ChartContext, ChartDeps, ChartSceneContext, ChartSelection, ConnectorSpec, D3Lib, EncodingSpec, Renderer, ViewSpec } from '../../types/index.js';
import type { PointViewState } from './authoring.js';

interface Point {
  x: number;
  y: number;
}

/** Cluster centroids remembered on the scene between detail transitions. */
interface PointAnchorMemory {
  byKey?: Map<string, Point>;
  byParent: Map<string, Point>;
}

type ResolvedConnector =
  | { mode: 'baseline'; channel: 'x' | 'y'; from: number }
  | { mode: 'group'; by: string[]; orderBy: string | null };

interface ConnectorSegment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface BlendChild {
  start: Point;
  end: Point;
  radius: number;
}

interface BlendMotion {
  parentRadiusTween(this: Element, row: RenderDatum): (progress: number) => string;
}

type KeyFn = (d: RenderDatum, i: number) => string | number;
type PositionOf = (row: RenderDatum) => Point;

export function createPointRenderer(deps: ChartDeps): Renderer<PointViewState> {
  return new PointChart(deps).renderer();
}

class PointChart extends BaseChart<PointViewState> {
  render(chart: ChartContext, rows: RenderDatum[], spec: PointViewState, tooltip: HTMLElement, d3: D3Lib): void {
    const {
      bindTooltip,
      chartStyle,
      colorScale,
      drawGrid,
      drawLegend,
      drawXAxis,
      drawYAxis,
      fadeNonPointShapes,
      bandOrLinear,
      position,
      quantitativeDomain,
      quantitativeScale,
      staggerDelay,
      themeValue
    } = this.deps;

    const enc = spec.encoding || {};
    const xField = enc.x?.field ?? '';
    const yField = enc.y?.field ?? '';
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const state = pointState(spec, enc);
    const viewEnc = state.view?.encoding || enc;
    const viewXField = viewEnc.x?.field ?? '';
    const viewYField = viewEnc.y?.field ?? '';
    const viewRows = state.view
      ? applyTransforms(chart.sourceRows ?? [], state.view.transform || [], chart.aq)
      : rows;
    const connector = resolvePointConnector(spec, viewEnc);
    const selection = viewSelection(spec);
    const movesPoints = state.detailMode === 'detail' && !state.view;
    // Scatter and gather use the shared base timing (ease-in-out by default).
    // An earlier `base.ease(d3.easeCubicOut)` here never took effect: D3
    // transitions inherit timing from the nearest scheduled ancestor, and the
    // frame had already been scheduled on the unmodified base. Recorded tracks
    // read the base directly, so a per-chart ease must be declared before the
    // frame is scheduled (a transition-plan concern), not mutated here.
    const t = chart.transition.base;
    const fallbackRadius = Number.isFinite(Number(spec.size))
      ? Number(spec.size)
      : defaultPointRadius(rows.length);
    const baseRadius = radiusScale(domainRows, enc.size, fallbackRadius, d3, quantitativeDomain);
    const largestRadius = domainRows.reduce(
      (largest, row) => Math.max(largest, baseRadius(row)),
      fallbackRadius
    );
    const markPadding = largestRadius + themeValue('--vd-point-stroke-width', 1.5) / 2;
    const xDomainRows = connector?.mode === 'baseline' && connector.channel === 'x'
      ? rowsIncludingBaseline(viewRows, viewEnc.x, connector.from)
      : viewRows;
    const yDomainRows = connector?.mode === 'baseline' && connector.channel === 'y'
      ? rowsIncludingBaseline(viewRows, viewEnc.y, connector.from)
      : viewRows;
    const baseX = bandOrLinear(xDomainRows, viewEnc.x, [0, chart.innerWidth], d3, { domainPadding: markPadding });
    const baseY = bandOrLinear(yDomainRows, viewEnc.y, [chart.innerHeight, 0], d3, { domainPadding: markPadding });
    const color = colorScale(domainRows, enc.color, d3);
    const camera = focusCamera(
      viewRows.map((row) => ({
        datum: row,
        bounds: pointBounds(
          position(baseX, row[viewXField]),
          position(baseY, row[viewYField]),
          baseRadius(row)
        )
      })),
      selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const x = cameraScale(baseX, camera, 'x');
    const y = cameraScale(baseY, camera, 'y');
    const radius = (row: RenderDatum) => cameraSize(baseRadius(row), camera);
    chart.camera = camera;
    const markDelay = camera.bounds
      ? () => 0
      : (row: RenderDatum, index: number) => staggerDelay(spec, row, index);
    const scaleMarkDelay = (row: RenderDatum, index: number) =>
      (chart.transition.exitDuration || 0) + markDelay(row, index);
    const opacity = (row: RenderDatum) => pointSelectionOpacity(row, spec, themeValue('--vd-dim-opacity', 0.22));
    const key: KeyFn = pointKeyAccessor(spec, xField || yField);

    // Anchor tracking for gather/scatter animation across detail transitions.
    // When rolling up (detail → aggregate), exiting points fly to the next cluster centroid.
    // When breaking down (aggregate → detail), entering points start at the previous cluster centroid.
    const scene = chart.scene as ChartSceneContext & { pointAnchors?: PointAnchorMemory };
    const previousAnchors: PointAnchorMemory = scene.pointAnchors || { byParent: new Map() };

    function chartPosition(row: RenderDatum): Point {
      return {
        x: position(x, row[xField]),
        y: position(y, row[yField])
      };
    }

    const nextParentAnchors = parentAnchors(rows, state.parentField, chartPosition);

    function enterAnchor(row: RenderDatum): Point {
      const parent = parentKey(row, state.parentField);
      return previousAnchors.byParent?.get(parent) || chartPosition(row);
    }

    function pointEnterPosition(row: RenderDatum): Point {
      // An added observation has no meaningful journey from another datum:
      // it is born at its target and grows there. A summary/detail change is
      // different—the parent centroid is meaningful data, so children may
      // spread from it.
      return movesPoints ? enterAnchor(row) : chartPosition(row);
    }

    function exitAnchor(row: RenderDatum): Point {
      const parent = parentKey(row, state.parentField);
      return nextParentAnchors.get(parent) || chartPosition(row);
    }

    fadeNonPointShapes(chart);
    this.setCartesianState(chart, viewEnc, { x, y, color }, {
      x: (d) => position(x, d[xField]),
      y: (d) => position(y, d[yField])
    });
    drawPointAxes(chart, x, y, viewEnc, d3, this.deps);
    drawLegend(chart, rows, enc.color, d3);
    drawPointConnectors({
      chart,
      connectors: pointConnectorSegments(rows, connector, chartPosition, { x, y }, position, key),
      transition: t,
      themeValue
    });

    const crispLayer = chart.g.selectAll<SVGGElement, null>('g.vd-point-crisp-layer')
      .data([null])
      .join('g')
      .attr('class', 'vd-point-crisp-layer');
    const blendMotion = pointBlendMotion({
      rows, state, radius, enterAnchor, exitAnchor, chartPosition
    });
    drawPointBlend({
      chart, rows, state, key, radius, color, enterAnchor, exitAnchor,
      chartPosition, crispLayer, blendMotion, movesPoints, transition: t, d3
    });

    crispLayer.selectAll<SVGCircleElement, RenderDatum>('circle.vd-point')
      .data(rows, (d, i) => pointStoredKey(d, i, key))
      .join(
        (enter) => {
          const entered = enter
            .append('circle')
            .attr('class', 'vd-point')
            .call(applyPointIdentity, key)
            .attr('cx', (d) => pointEnterPosition(d).x)
            .attr('cy', (d) => pointEnterPosition(d).y)
            .attr('r', 0)
            .attr('fill', (d) => color(d))
            .attr('stroke', themeValue('--vd-mark-stroke', 'white'))
            .attr('stroke-width', cameraSize(themeValue('--vd-point-stroke-width', 1.5), camera))
            .style('opacity', 0)
            .call(bindTooltip, spec, tooltip);
          motion(entered, chart.transition.enter || t)
            .delay((d, i) => (chart.transition.enterDelay || 0) + markDelay(d, i))
            .attr('cx', (d) => chartPosition(d).x)
            .attr('cy', (d) => chartPosition(d).y)
            .attr('r', (d) => radius(d))
            .style('opacity', (d) => opacity(d));
          return entered;
        },
        (update) => {
          const prepared = update
            .call(applyPointIdentity, key)
            .call(bindTooltip, spec, tooltip);
          motion(prepared, t)
            .delay(scaleMarkDelay)
            .attr('cx', (d) => chartPosition(d).x)
            .attr('cy', (d) => chartPosition(d).y)
            .attr('r', (d) => radius(d))
            .attr('fill', (d) => color(d))
            .attr('stroke-width', cameraSize(themeValue('--vd-point-stroke-width', 1.5), camera))
            .style('opacity', (d) => opacity(d));
          return prepared;
        },
        (exit) => {
          const leaving = motion(exit, chart.transition.exit || t)
            .delay(markDelay)
            .style('opacity', 0);
          if (!chart.transition.exitFirst) {
            leaving
              .attr('cx', (d) => exitAnchor(d).x)
              .attr('cy', (d) => exitAnchor(d).y);
          }
          if (blendMotion) leaving.attrTween('r', blendMotion.parentRadiusTween);
          else leaving.attr('r', 0);
          leaving.remove();
          return exit;
        }
      );

    // Persist per-step anchor positions for the next transition.
    scene.pointAnchors = {
      byKey: new Map(rows.map((row, index) => [String(key(row, index)), chartPosition(row)] as const)),
      byParent: nextParentAnchors
    };

    // Clean up any stale parent-centroid markers from previous renders.
    motion(chart.g.selectAll<SVGCircleElement, unknown>('circle.vd-point-parent'), t)
      .attr('r', 0)
      .style('opacity', 0)
      .remove();
  }
}

function resolvePointConnector(spec: PointViewState, encoding: EncodingSpec): ResolvedConnector | null {
  const connector: ConnectorSpec | null | undefined = spec.connector;
  if (!connector) return null;
  if (Number.isFinite(connector.from)) {
    const candidates = (['x', 'y'] as const).filter((channel) =>
      encoding[channel]?.field && encoding[channel]?.type === 'quantitative');
    const channel = connector.channel || (candidates.length === 1 ? candidates[0] : null);
    if (!channel) {
      throw new Error('Point connector from a constant needs channel "x" or "y" when it cannot be inferred.');
    }
    if (encoding[channel]?.type !== 'quantitative' || !encoding[channel]?.field) {
      throw new Error(`Point connector channel "${channel}" must be a quantitative positional channel.`);
    }
    return { mode: 'baseline', channel, from: Number(connector.from) };
  }
  const by = Array.isArray(connector.by) ? connector.by.map(String) : [connector.by].filter(Boolean).map(String);
  if (!by.length) throw new Error('Point connector needs a finite from value or a by field.');
  return { mode: 'group', by, orderBy: connector.orderBy ? String(connector.orderBy) : null };
}

function rowsIncludingBaseline(rows: RenderDatum[], channel: ChannelSpec | undefined, baseline: number): RenderDatum[] {
  if (!channel?.field || Array.isArray(channel.domain)) return rows;
  return [...rows, { [channel.field]: baseline }];
}

function pointConnectorSegments(
  rows: RenderDatum[],
  connector: ResolvedConnector | null,
  chartPosition: PositionOf,
  scales: { x: RuntimeScale; y: RuntimeScale },
  position: ChartRuntimeDeps['position'],
  key: KeyFn
): ConnectorSegment[] {
  if (!connector) return [];
  if (connector.mode === 'baseline') {
    const scale = scales[connector.channel];
    const start = position(scale, connector.from);
    return rows.map((row, index) => {
      const point = chartPosition(row);
      return {
        key: `baseline:${String(key(row, index))}`,
        x1: connector.channel === 'x' ? start : point.x,
        y1: connector.channel === 'y' ? start : point.y,
        x2: point.x,
        y2: point.y
      };
    });
  }

  const orderBy = connector.orderBy;
  for (const field of [...connector.by, orderBy].filter((name): name is string => Boolean(name))) {
    if (rows.length && !rows.some((row) => Object.prototype.hasOwnProperty.call(row, field))) {
      throw new Error(`Point connector references missing field "${field}".`);
    }
  }

  const groups = new Map<string, Array<{ row: RenderDatum; index: number }>>();
  rows.forEach((row, index) => {
    const groupKey = connector.by.map((field) => String(row[field])).join('\u0000');
    const members = groups.get(groupKey) ?? [];
    members.push({ row, index });
    groups.set(groupKey, members);
  });
  return Array.from(groups, ([groupKey, members]) => {
    const ordered = orderBy
      ? [...members].sort((a, b) => compareConnectorValues(a.row[orderBy], b.row[orderBy]))
      : members;
    return ordered.slice(0, -1).map((member, index) => {
      const next = ordered[index + 1];
      const from = chartPosition(member.row);
      const to = chartPosition(next.row);
      return {
        key: `group:${groupKey}:${String(key(member.row, member.index))}:${String(key(next.row, next.index))}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y
      };
    });
  }).flat();
}

function compareConnectorValues(a: unknown, b: unknown): number {
  const left = (a instanceof Date ? a.getTime() : a) as number | string;
  const right = (b instanceof Date ? b.getTime() : b) as number | string;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function drawPointConnectors({ chart, connectors, transition, themeValue }: {
  chart: ChartContext;
  connectors: ConnectorSegment[];
  transition: MotionTiming;
  themeValue: ChartRuntimeDeps['themeValue'];
}): void {
  const layer = chart.g.selectAll('g.vd-point-connector-layer')
    .data([null])
    .join('g')
    .attr('class', 'vd-point-connector-layer')
    .style('pointer-events', 'none')
    .lower();
  layer.selectAll<SVGLineElement, ConnectorSegment>('line.vd-point-connector')
    .data(connectors, (connector) => connector.key)
    .join(
      (enter) => {
        const entered = enter.append('line')
          .attr('class', 'vd-point-connector')
          .attr('data-key', (connector) => connector.key)
          .attr('x1', (connector) => connector.x1)
          .attr('y1', (connector) => connector.y1)
          .attr('x2', (connector) => connector.x1)
          .attr('y2', (connector) => connector.y1)
          .attr('stroke', themeValue('--vd-point-connector', '#8a8f98'))
          .attr('stroke-width', themeValue('--vd-point-connector-width', 2))
          .style('opacity', 0);
        motion(entered, transition)
          .attr('x2', (connector) => connector.x2)
          .attr('y2', (connector) => connector.y2)
          .style('opacity', 1);
        return entered;
      },
      (update) => {
        motion(update, transition)
          .attr('x1', (connector) => connector.x1)
          .attr('y1', (connector) => connector.y1)
          .attr('x2', (connector) => connector.x2)
          .attr('y2', (connector) => connector.y2)
          .attr('stroke', themeValue('--vd-point-connector', '#8a8f98'))
          .attr('stroke-width', themeValue('--vd-point-connector-width', 2))
          .style('opacity', 1);
        return update;
      },
      (exit) => {
        motion(exit, transition)
          .attr('x2', (connector) => connector.x1)
          .attr('y2', (connector) => connector.y1)
          .style('opacity', 0)
          .remove();
        return exit;
      }
    );
}

/** A deterministic, decorative layer for summary/detail movement. */
function drawPointBlend({
  chart, rows, state, key, radius, color, enterAnchor, exitAnchor,
  chartPosition, crispLayer, blendMotion, movesPoints, transition, d3
}: {
  chart: ChartContext;
  rows: RenderDatum[];
  state: PointState;
  key: KeyFn;
  radius: (row: RenderDatum) => number;
  color: (row: RenderDatum) => string;
  enterAnchor: PositionOf;
  exitAnchor: PositionOf;
  chartPosition: PositionOf;
  crispLayer: ChartSelection<SVGGElement, null>;
  blendMotion: BlendMotion | null;
  movesPoints: boolean;
  transition: MotionTiming;
  d3: D3Lib;
}): void {
  const enabled = state.effect === 'blend';
  crispLayer.interrupt().style('visibility', 'visible');
  const layer = chart.g.selectAll<SVGGElement, null>('g.vd-point-blend-layer')
    .data(enabled ? [null] : [])
    .join(
      (enter) => enter.append('g')
        .attr('class', 'vd-point-blend-layer')
        .style('pointer-events', 'none')
        .style('visibility', 'hidden')
        .raise(),
      (update) => update,
      (exit) => exit.remove()
    );
  if (!enabled) return;

  const filterId = ensurePointBlendFilter(chart.scene, d3);
  const groups = Array.from(
    d3.group(rows, (row) => parentKey(row, state.parentField)),
    ([parent, values]) => ({ parent, values })
  );
  const group = layer.selectAll<SVGGElement, { parent: string; values: RenderDatum[] }>('g.vd-point-blend-group')
    .data(groups, (entry) => entry.parent)
    .join(
      (enter) => enter.append('g').attr('class', 'vd-point-blend-group'),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr('filter', `url(#${filterId})`);

  group.each(function(entry) {
    d3.select(this).selectAll<SVGCircleElement, RenderDatum>('circle.vd-point-blend')
      .data(entry.values, (row, index) => pointStoredKey(row, index, key))
      .join(
        (enter) => {
          const entered = enter.append('circle')
            .attr('class', 'vd-point-blend')
            .attr('data-blend-role', state.detailMode === 'aggregate' ? 'summary' : 'child')
            .attr('cx', (row) => enterAnchor(row).x)
            .attr('cy', (row) => enterAnchor(row).y)
            .attr('r', (row) => Math.max(4, radius(row)))
            .attr('fill', (row) => color(row));
          motion(entered, transition)
            .attr('cx', (row) => chartPosition(row).x)
            .attr('cy', (row) => chartPosition(row).y);
          return entered;
        },
        (update) => {
          const prepared = update
            .attr('data-blend-role', state.detailMode === 'aggregate' ? 'summary' : 'child');
          motion(prepared, transition)
            .attr('cx', (row) => chartPosition(row).x)
            .attr('cy', (row) => chartPosition(row).y)
            .attr('r', (row) => Math.max(4, radius(row)))
            .attr('fill', (row) => color(row));
          return prepared;
        },
        (exit) => {
          const leaving = motion(exit.attr('data-blend-role', 'parent'), transition)
            .attr('cx', (row) => exitAnchor(row).x)
            .attr('cy', (row) => exitAnchor(row).y);
          if (blendMotion) leaving.attrTween('r', blendMotion.parentRadiusTween);
          else leaving.attr('r', 0);
          leaving.remove();
          return exit;
        }
      );
  });

  layer.interrupt().style('visibility', 'hidden');
  if (movesPoints) {
    motion(layer, transition)
      .styleTween('visibility', () => (progress) =>
        pointBlendVisibility(progress));
    motion(crispLayer, transition)
      .styleTween('visibility', () => (progress) =>
        pointCrispVisibility(progress));
  }
}

function pointBlendVisibility(progress: number): string {
  return progress > 0 && progress < 1 ? 'visible' : 'hidden';
}

function pointCrispVisibility(progress: number): string {
  return progress > 0 && progress < 1 ? 'hidden' : 'visible';
}

const POINT_BLEND_BLUR = 5;
const POINT_BLEND_REACH = POINT_BLEND_BLUR * 2;

/**
 * Keep a summary circle only while at least one of its children is close
 * enough to share the gooey silhouette. The same distance rule runs backward
 * for merge, so the summary starts growing only after the first child connects.
 */
function pointBlendMotion({
  rows, state, radius, enterAnchor, exitAnchor, chartPosition
}: {
  rows: RenderDatum[];
  state: PointState;
  radius: (row: RenderDatum) => number;
  enterAnchor: PositionOf;
  exitAnchor: PositionOf;
  chartPosition: PositionOf;
}): BlendMotion | null {
  if (state.effect !== 'blend' || state.detailMode !== 'detail' || state.view) return null;

  const childrenByParent = new Map<string, BlendChild[]>();
  rows.forEach((row) => {
    const parent = parentKey(row, state.parentField);
    const children = childrenByParent.get(parent) || [];
    children.push({
      start: enterAnchor(row),
      end: chartPosition(row),
      radius: Math.max(4, radius(row))
    });
    childrenByParent.set(parent, children);
  });

  return {
    parentRadiusTween: function parentRadiusTween(this: Element, row: RenderDatum) {
      const startRadius = Math.max(0, Number(this.getAttribute('r')) || 0);
      const parentStart = {
        x: Number(this.getAttribute('cx')) || 0,
        y: Number(this.getAttribute('cy')) || 0
      };
      const parentEnd = exitAnchor(row);
      const children = childrenByParent.get(parentKey(row, state.parentField)) || [];
      return (progress: number) => String(pointBlendParentRadius({
        progress, startRadius, parentStart, parentEnd, children
      }));
    }
  };
}

function pointBlendParentRadius({
  progress, startRadius, parentStart, parentEnd, children
}: {
  progress: number;
  startRadius: number;
  parentStart: Point;
  parentEnd: Point;
  children: BlendChild[];
}): number {
  const parent = interpolatePoint(parentStart, parentEnd, progress);
  const connectionTotal = children.reduce((total, child) => {
    const point = interpolatePoint(child.start, child.end, progress);
    const distance = Math.hypot(point.x - parent.x, point.y - parent.y);
    // Once the child is farther away than its own visible edge plus the
    // filter's bridge reach, a zero-radius parent can no longer connect it.
    // The parent must already be gone at that point.
    const disconnectAt = child.radius + POINT_BLEND_REACH;
    const shrinkFrom = disconnectAt * 0.7;
    const strength = 1 - smoothStep(shrinkFrom, disconnectAt, distance);
    return total + strength;
  }, 0);
  // Every child contributes an equal share of the final parent radius. A group
  // of ten therefore grows through 10%, 20%, 30%, ... as children connect.
  // Partial connections keep those steps smooth instead of making the radius
  // jump. Reversing the same calculation makes split shrink identically.
  const connectedShare = children.length ? connectionTotal / children.length : 0;

  // A child can finish unusually close to its parent's centroid. The endpoint
  // still belongs to detail, so the obsolete summary must be fully gone.
  const endpoint = 1 - smoothStep(0.82, 1, progress);
  return startRadius * Math.min(connectedShare, endpoint);
}

function interpolatePoint(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress
  };
}

function smoothStep(from: number, to: number, value: number): number {
  const progress = Math.max(0, Math.min(1, (value - from) / Math.max(Number.EPSILON, to - from)));
  return progress * progress * (3 - 2 * progress);
}

function ensurePointBlendFilter(scene: ChartSceneContext, d3: D3Lib): string {
  void d3;
  const id = `vd-point-blend-${scene.clipIdentity}`;
  const defs = scene.svg.selectAll<SVGDefsElement, null>('defs.vd-point-blend-defs')
    .data([null])
    .join('defs')
    .attr('class', 'vd-point-blend-defs');
  const existing = defs.select(`#${id}`);
  if (!existing.empty()) return id;

  const filter = defs.append('filter')
    .attr('id', id)
    .attr('x', '-60%')
    .attr('y', '-60%')
    .attr('width', '220%')
    .attr('height', '220%')
    .attr('color-interpolation-filters', 'sRGB');
  filter.append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', 5)
    .attr('result', 'blur');
  filter.append('feColorMatrix')
    .attr('in', 'blur')
    .attr('mode', 'matrix')
    .attr('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8');
  return id;
}

export function pointSelectionOpacity(row: RenderDatum, spec: ViewSpec = {}, dimOpacity = 0.22): number {
  const selection = viewHighlight(spec);
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(row.__row || row, selection)
    ? 1
    : Number(selection.opacity ?? dimOpacity);
}
