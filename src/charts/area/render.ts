import { BaseChart } from '../base.js';
import { cameraScale, focusCamera, rectBounds } from '../../focus.js';
import { d3Curve } from '../curve.js';
import type { D3AreaCurveName } from '../curve.js';
import { matchPathStrings, matchRenderedPaths } from '../path-interpolation.js';
import { DIVIDER_DRAW_PROGRESS } from '../detail-timing.js';
import {
  areaCells,
  areaLayers,
  areaPointKeyAccessor,
  areaSelectionOpacity,
  areaState
} from './state.js';
import { drawAreaAxes } from './axes.js';
import { motion } from '../../runtime/recorder.js';
import type { RenderDatum, RuntimeScale } from '../../runtime/marks.js';
import type { ChartContext, ChartDeps, D3Lib, Renderer } from '../../types/index.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { Area, Line } from 'd3-shape';
import type { AreaViewState } from './authoring.js';
import type { AreaTransitionPlanExtension } from './plugin.js';
import type { AreaCell, AreaLayer, AreaPoint } from './state.js';

/** One boundary sample in pixel space. */
export interface AreaBoundaryPoint {
  x: number;
  y0: number;
  y1: number;
}

/** A boundary sample that names the observation it belongs to. */
export interface AreaFramePoint extends AreaBoundaryPoint {
  key: string;
}

/** Left half, observation center, right half. A flattened frame keeps no keys. */
export type AreaCellFrame = AreaBoundaryPoint[];

type AreaShape = Area<AreaBoundaryPoint>;
type AreaEdge = Line<AreaBoundaryPoint>;

/** A rendered cell remembers the frame and curve it was last drawn from. */
interface AreaPathElement extends SVGPathElement {
  __visDeltaAreaFrame?: AreaCellFrame;
  __visDeltaAreaCurve?: string;
}

interface AreaDivider {
  key: string;
  layerKey: string;
  path: string;
}

interface AreaBoundaryRow extends RenderDatum {
  __areaValue: number;
}

export function createAreaRenderer(deps: ChartDeps): Renderer<AreaViewState> {
  return new AreaChart(deps).renderer();
}

class AreaChart extends BaseChart<AreaViewState> {
  render(chart: ChartContext, rows: RenderDatum[], spec: AreaViewState, tooltip: HTMLElement, d3: D3Lib): void {
    const {
      bandOrLinear, bindTooltip, colorScale, drawLegend,
      position, themeValue
    } = this.deps;
    const enc = spec.encoding || {};
    const xField = enc.x?.field;
    const yField = enc.y?.field;
    if (!xField || !yField) return;

    const state = areaState(spec, enc);
    const pointKey = areaPointKeyAccessor(spec, xField);
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const domainLayers = areaLayers(domainRows, xField, yField, state, pointKey);
    const scaleRows = state.filtersRows ? domainRows : rows;
    const layers = areaLayers(rows, xField, yField, state, pointKey);
    const lineageLayers = state.filtersRows && state.connect !== 'across'
      ? domainLayers
      : layers;
    const cells = areaCells(layers, lineageLayers);
    const plan = chart.transitionPlan as (typeof chart.transitionPlan & AreaTransitionPlanExtension) | undefined;
    const splitDetail = plan?.detailChange?.mode === 'split';
    const baseX = bandOrLinear(scaleRows, enc.x, [0, chart.innerWidth], d3);
    const boundaryRows: AreaBoundaryRow[] = domainLayers.flatMap((layer) => layer.points.flatMap((point) => [
      { __areaValue: point.y0 }, { __areaValue: point.y1 }
    ]));
    const yChannel = { ...enc.y, field: '__areaValue' };
    const baseY = bandOrLinear(boundaryRows, yChannel, [chart.innerHeight, 0], d3);
    const camera = focusCamera(
      cells.map((cell) => ({
        datum: cell.row,
        bounds: areaCellBounds(cell, baseX, baseY, position)
      })),
      state.selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const x = cameraScale(baseX, camera, 'x');
    const y = cameraScale(baseY, camera, 'y');
    chart.camera = camera;
    const color = colorScale(domainRows, enc.color, d3);
    const curveName = spec.curve || 'curveLinear';
    const curve = d3Curve(spec.curve, d3);
    const shape: AreaShape = d3.area<AreaBoundaryPoint>()
      .x((point) => point.x)
      .y0((point) => point.y0)
      .y1((point) => point.y1)
      .curve(curve);
    const edge: AreaEdge = d3.line<AreaBoundaryPoint>()
      .x((point) => point.x)
      .y((point) => point.y1)
      .curve(curve);
    const pointFrame = (point: AreaPoint): AreaFramePoint => ({
      key: point.key,
      x: position(x, point.x),
      y0: Number(y(point.y0)),
      y1: Number(y(point.y1))
    });
    const midpoint = (left: AreaFramePoint, right: AreaFramePoint, key: string): AreaFramePoint => ({
      key,
      x: (left.x + right.x) / 2,
      y0: (left.y0 + right.y0) / 2,
      y1: (left.y1 + right.y1) / 2
    });
    const frame = (cell: AreaCell): AreaFramePoint[] => {
      const center = pointFrame(cell.center);
      const left = cell.left
        ? midpoint(pointFrame(cell.left), center, `cut:${cell.left.key}|${cell.center.key}`)
        : { ...center, key: `edge:left:${cell.center.key}` };
      const right = cell.right
        ? midpoint(center, pointFrame(cell.right), `cut:${cell.center.key}|${cell.right.key}`)
        : { ...center, key: `edge:right:${cell.center.key}` };
      return [left, center, right];
    };
    const dividers = splitDetail && state.mode === 'stacked'
      ? areaDividerPaths(cells, layers, frame, edge)
      : [];
    const opacity = (cell: AreaCell) => areaSelectionOpacity(
      cell.layer, state.highlight, themeValue('--vd-dim-opacity', 0.22)
    );
    const addedKeys = new Set((plan?.observation?.addedKeys || []).map(String));
    const isAdded = (cell: AreaCell) => addedKeys.has(String(cell.observationKey));
    const tween = (node: AreaPathElement, cell: AreaCell, generator: AreaShape) => {
      const to = frame(cell);
      const from = node.__visDeltaAreaFrame || to;
      const previousCurve = node.__visDeltaAreaCurve || curveName;
      node.__visDeltaAreaFrame = to;
      node.__visDeltaAreaCurve = curveName;
      if (previousCurve !== curveName) {
        node.setAttribute('data-area-transition', 'change-curve');
        return interpolateAreaCurveFrames(
          node, from, to, previousCurve, curveName, generator, d3
        );
      }
      node.setAttribute('data-area-transition', 'move-boundaries');
      return interpolateAreaCellFrames(from, to, generator, d3);
    };

    // Area owns this cleanup locally; Core does not need to know the chart type.
    motion(chart.g.selectAll<SVGElement, unknown>('rect.vd-bar,path.vd-line,circle.vd-line-point,circle.vd-point,circle.vd-unit'),
      chart.transition.base).style('opacity', 0);
    this.setCartesianState(chart, enc, { x, y, color }, {
      x: (row) => position(x, row[xField]),
      y: (row) => position(y, row[yField])
    });
    drawAreaAxes(chart, x, y, enc, d3, this.deps);

    chart.g.selectAll<AreaPathElement, AreaCell>('path.vd-area')
      .data(cells, (cell) => cell.key)
      .join(
        (enter) => {
          const entered = enter.append<AreaPathElement>('path')
            .attr('class', 'vd-area vd-area-cell')
            .attr('data-key', (cell) => cell.key)
            .attr('data-layer-key', (cell) => cell.layerKey)
            .attr('data-observation-key', (cell) => cell.observationKey)
            .attr('d', (cell) => shape(isAdded(cell) ? flattenAreaFrame(frame(cell)) : frame(cell)))
            .attr('fill', (cell) => color(cell.row || {}))
            .attr('stroke', 'none')
            .style('opacity', (cell) => isAdded(cell) ? opacity(cell) : 0)
            .call(bindTooltip, spec, tooltip)
            .each(function(cell) {
              this.__visDeltaAreaFrame = isAdded(cell) ? flattenAreaFrame(frame(cell)) : frame(cell);
              this.__visDeltaAreaCurve = curveName;
            });
          motion(entered, chart.transition.enter || chart.transition.base)
            .style('opacity', opacity)
            .attrTween('d', function(cell) {
              return tween(this as AreaPathElement, cell, shape);
            });
          return entered;
        },
        (update) => {
          const prepared = update
            .attr('data-key', (cell) => cell.key)
            .attr('data-layer-key', (cell) => cell.layerKey)
            .attr('data-observation-key', (cell) => cell.observationKey)
            .call(bindTooltip, spec, tooltip);
          motion(prepared, chart.transition.base)
            .style('opacity', opacity)
            .attr('fill', (cell) => color(cell.row || {}))
            .attr('stroke', 'none')
            .attrTween('d', function(cell) {
              return tween(this as AreaPathElement, cell, shape);
            });
          return prepared;
        },
        (exit) => {
          motion(exit, chart.transition.exit || chart.transition.base)
            .style('opacity', 0)
            .remove();
          return exit;
        }
      );

    // Area is fill-first by default. Do not add a persistent outline or use a
    // border to imply layer separation that the author did not encode.
    chart.g.selectAll('path.vd-area-edge').remove();

    // A stacked Area has one continuous internal boundary per lower layer and
    // connected stretch. During a total -> detail split, draw those boundaries
    // over the still-visible parent before the detailed fills appear.
    // Cached canonical playback makes detail -> total the exact reverse.
    const dividerJoin = chart.g.selectAll<SVGPathElement, AreaDivider>('path.vd-area-divider')
      .data(dividers, (divider) => divider.key);
    motion(dividerJoin.exit(), chart.transition.base).style('opacity', 0).remove();
    const dividerEnter = dividerJoin.enter().append('path')
      .attr('class', 'vd-area-divider')
      .attr('data-key', (divider) => divider.key)
      .attr('data-layer-key', (divider) => divider.layerKey)
      .attr('fill', 'none')
      .attr('pointer-events', 'none')
      .attr('d', (divider) => divider.path)
      .style('opacity', 0);
    if (splitDetail) {
      dividerEnter
        .attr('stroke-dasharray', function() {
          const length = Math.max(0, this.getTotalLength());
          return `${length} ${length}`;
        })
        .attr('stroke-dashoffset', function() { return this.getTotalLength(); });
    }
    const divider = dividerEnter.merge(dividerJoin);
    const totalDuration = chart.transition.duration || 0;
    const dividerDrawDuration = Math.max(1, totalDuration * DIVIDER_DRAW_PROGRESS);
    motion(divider, chart.transition.base)
      .duration(dividerDrawDuration)
      .style('opacity', 1)
      .attr('stroke-dashoffset', 0)
      .attrTween('d', function(divider) {
        return matchRenderedPaths(this as SVGPathElement, divider.path);
      })
      .transition()
      .duration(Math.max(1, totalDuration - dividerDrawDuration))
      .style('opacity', 0)
      .remove();

    drawLegend(chart, rows, enc.color, d3);
  }
}

function areaDividerPaths(
  cells: AreaCell[],
  layers: AreaLayer[],
  frame: (cell: AreaCell) => AreaFramePoint[],
  edge: AreaEdge
): AreaDivider[] {
  const layerIndex = new Map(layers.map((layer, index) => [layer.key, index] as const));
  const pointByLayerAndX = layers.map((layer) => new Map(
    layer.points.map((point) => [String(point.x), point] as const)
  ));
  const isInternalBoundary = (cell: AreaCell) => {
    const index = layerIndex.get(cell.layerKey);
    const direction = stackDirection(cell.center);
    if (index == null || direction === 0) return false;
    return layers.slice(index + 1).some((layer, offset) => {
      const point = pointByLayerAndX[index + offset + 1].get(String(cell.center.x));
      return point && stackDirection(point) === direction &&
        Math.abs(point.y0 - cell.center.y1) < 1e-9;
    });
  };
  const paths: AreaDivider[] = [];
  let run: AreaCell[] = [];
  let runIndex = 0;
  let layerKey: string | null = null;
  const flush = () => {
    if (!run.length || layerKey == null) return;
    const points: AreaFramePoint[] = [];
    run.forEach((cell, index) => {
      const cellFrame = frame(cell);
      if (index === 0) points.push(cellFrame[0]);
      points.push(cellFrame[1]);
      if (index === run.length - 1) points.push(cellFrame[2]);
    });
    const path = edge(points);
    if (path) paths.push({ key: `${layerKey}::divider:${runIndex}`, layerKey, path });
    run = [];
    runIndex += 1;
  };

  cells.forEach((cell) => {
    if (layerKey !== cell.layerKey) {
      flush();
      layerKey = cell.layerKey;
      runIndex = 0;
    }
    if (cell.left == null && run.length) flush();
    if (!isInternalBoundary(cell)) {
      flush();
      return;
    }
    run.push(cell);
    if (cell.right == null) flush();
  });
  flush();
  return paths;
}

function areaCellBounds(cell: AreaCell, x: RuntimeScale, y: RuntimeScale, position: ChartRuntimeDeps['position']) {
  const project = (point: AreaPoint) => ({
    x: position(x, point.x),
    y0: Number(y(point.y0)),
    y1: Number(y(point.y1))
  });
  const center = project(cell.center);
  const left = cell.left ? midpointBounds(project(cell.left), center) : center;
  const right = cell.right ? midpointBounds(center, project(cell.right)) : center;
  const xs = [left.x, center.x, right.x];
  const ys = [left.y0, left.y1, center.y0, center.y1, right.y0, right.y1];
  return rectBounds(
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys)
  );
}

function midpointBounds(left: { x: number; y0: number; y1: number }, right: { x: number; y0: number; y1: number }) {
  return {
    x: (left.x + right.x) / 2,
    y0: (left.y0 + right.y0) / 2,
    y1: (left.y1 + right.y1) / 2
  };
}

function stackDirection(point: { y0: number; y1: number }): -1 | 0 | 1 {
  const value = Number(point.y1) - Number(point.y0);
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

/** Three points always mean left half, observation center, and right half. */
export function interpolateAreaCellFrames(
  from: AreaCellFrame | null | undefined,
  to: AreaCellFrame,
  shape: AreaShape,
  d3: D3Lib
): (progress: number) => string {
  const source = normalizeAreaCellFrame(from, to);
  const target = normalizeAreaCellFrame(to, from);
  return (progress) => shape(source.map((point, index) => ({
    ...target[index],
    x: safeInterpolate(point.x, target[index].x, progress, d3),
    y0: safeInterpolate(point.y0, target[index].y0, progress, d3),
    y1: safeInterpolate(point.y1, target[index].y1, progress, d3)
  }))) || '';
}

/**
 * Morph the two Area boundaries independently so neighbouring cells keep the
 * exact same shared edge throughout a curve change. Matching each closed cell
 * as one perimeter lets its top and baseline corners drift at different rates,
 * which exposes triangular cracks between otherwise touching fills.
 */
function interpolateAreaCurveFrames(
  node: AreaPathElement,
  from: AreaCellFrame,
  to: AreaCellFrame,
  fromCurveName: string,
  toCurveName: string,
  targetShape: AreaShape,
  d3: D3Lib
): (progress: number) => string {
  // Closed curve factories intentionally connect each boundary back to itself.
  // Keep the general path matcher for those uncommon shapes; the ordinary Area
  // curves can use the watertight boundary matcher below.
  if (
    fromCurveName.endsWith('Closed') || toCurveName.endsWith('Closed') ||
    fromCurveName.endsWith('Open') || toCurveName.endsWith('Open')
  ) {
    return matchRenderedPaths(node, targetShape(to));
  }

  const boundary = (frame: AreaCellFrame, curveName: string, channel: 'y0' | 'y1', reverse = false) => {
    const points = reverse ? [...frame].reverse() : frame;
    return d3.line<AreaBoundaryPoint>()
      .x((point) => point.x)
      .y((point) => point[channel])
      .curve(d3Curve(curveName as D3AreaCurveName, d3))(points) || '';
  };
  const top = matchPathStrings(
    node,
    boundary(from, fromCurveName, 'y1'),
    boundary(to, toCurveName, 'y1')
  );
  const bottom = matchPathStrings(
    node,
    boundary(from, fromCurveName, 'y0', true),
    boundary(to, toCurveName, 'y0', true)
  );
  const sourcePath = node.getAttribute('d') || '';
  const targetPath = targetShape(to) || '';

  return (progress) => {
    if (progress <= 0) return sourcePath;
    if (progress >= 1) return targetPath;
    return `${top(progress)}${continuePath(bottom(progress))}Z`;
  };
}

function continuePath(path: string): string {
  return path.replace(/^\s*M/i, 'L');
}

function normalizeAreaCellFrame(frame: AreaCellFrame | null | undefined, fallback: AreaCellFrame | null | undefined): AreaCellFrame {
  if (frame?.length === 3) return frame;
  if (fallback?.length === 3) return fallback;
  const point = frame?.[0] || fallback?.[0] || { x: 0, y0: 0, y1: 0 };
  return [point, point, point];
}

function flattenAreaFrame(frame: AreaCellFrame): AreaCellFrame {
  return frame.map((point) => flattenAreaPoint(point));
}

/**
 * Match keyed observations before interpolating either Area boundary.
 *
 * A new observation is represented in the old frame at its target x position
 * with zero thickness (`y1 === y0`). It grows away from the lower boundary;
 * removal uses these exact frames backward and therefore flattens the value
 * into the baseline without borrowing Line's horizontal retraction behavior.
 */
export function interpolateAreaFrames(
  from: AreaFramePoint[],
  to: AreaFramePoint[],
  shape: AreaShape,
  d3: D3Lib
): (progress: number) => string {
  const pairs = matchAreaFramePoints(from, to);
  return (progress) => shape(pairs.map((pair) => ({
    key: pair.key,
    x: safeInterpolate(pair.from.x, pair.to.x, progress, d3),
    y0: safeInterpolate(pair.from.y0, pair.to.y0, progress, d3),
    y1: safeInterpolate(pair.from.y1, pair.to.y1, progress, d3)
  }))) || '';
}

/** Pure keyed topology matching, exported for direct tests. */
export function matchAreaFramePoints(
  from: AreaFramePoint[],
  to: AreaFramePoint[]
): Array<{ key: string; from: AreaBoundaryPoint; to: AreaBoundaryPoint }> {
  const fromKeys = from.map((point) => point.key);
  const toKeys = to.map((point) => point.key);
  const fromSet = new Set(fromKeys);
  const toSet = new Set(toKeys);
  const sharedFrom = fromKeys.filter((key) => toSet.has(key));
  const sharedTo = toKeys.filter((key) => fromSet.has(key));

  // If shared observations changed order, prefer the target order. This still
  // produces a valid band, while ordinary add/remove/restore uses the more
  // precise merged observation order below.
  const order = sameKeysInOrder(sharedFrom, sharedTo)
    ? mergeObservationOrder(fromKeys, toKeys, sharedFrom)
    : toKeys;
  const fromByKey = pointMap(from);
  const toByKey = pointMap(to);
  const ordered = order.flatMap((key) => {
    const point = fromByKey.get(key) || toByKey.get(key);
    return point ? [point] : [];
  });

  return ordered.map((point) => ({
    key: point.key,
    from: fromByKey.get(point.key) || flattenAreaPoint(toByKey.get(point.key) || point),
    to: toByKey.get(point.key) || flattenAreaPoint(fromByKey.get(point.key) || point)
  }));
}

function mergeObservationOrder(from: string[], to: string[], shared: string[]): string[] {
  const order: string[] = [];
  let fromIndex = 0;
  let toIndex = 0;
  const append = (key: string) => {
    if (order[order.length - 1] !== key) order.push(key);
  };

  for (const sharedKey of shared) {
    while (from[fromIndex] !== sharedKey) append(from[fromIndex++]);
    while (to[toIndex] !== sharedKey) append(to[toIndex++]);
    append(sharedKey);
    fromIndex += 1;
    toIndex += 1;
  }
  while (fromIndex < from.length) append(from[fromIndex++]);
  while (toIndex < to.length) append(to[toIndex++]);
  return order;
}

function flattenAreaPoint(point: AreaBoundaryPoint): AreaBoundaryPoint {
  return { x: point.x, y0: point.y0, y1: point.y0 };
}

function pointMap(points: AreaFramePoint[]): Map<string, AreaFramePoint> {
  return new Map(points.map((point) => [point.key, point] as const));
}

function sameKeysInOrder(from: string[], to: string[]): boolean {
  return from.length === to.length && from.every((key, index) => key === to[index]);
}

function safeInterpolate(from: number, to: number, progress: number, d3: D3Lib): number {
  const a = Number(from);
  const b = Number(to);
  const safeA = Number.isFinite(a) ? a : Number.isFinite(b) ? b : 0;
  const safeB = Number.isFinite(b) ? b : safeA;
  return d3.interpolateNumber(safeA, safeB)(progress);
}
