import { BaseChart } from '../base.js';
import { cameraPosition, cameraScale, cameraSize, focusCamera, pointBounds, viewSelection } from '../../focus.js';
import { specTransition } from '../../spec-meta.js';
import { directionalEase } from '../../runtime/tracks.js';
import { motion } from '../../runtime/recorder.js';
import { unitKey } from './keys.js';
import { clearUnitAxes, drawUnitAxes } from './axes.js';
import {
  expandUnits,
  matchUnitSlotsByIdentityAndTravel,
  unitLayout,
  unitSelectionOpacity,
  unitStageTiming
} from './state.js';
import type { Point, UnitAxis, UnitDatum, UnitLayoutResult, UnitTransitionPlan } from './state.js';
import type { Motion, MotionTiming } from '../../runtime/recorder.js';
import type { RenderDatum } from '../../runtime/marks.js';
import type { ChartContext, ChartDeps, ChartSceneContext, ChartSelection, D3Lib, Renderer, StaggerSpec, ViewSpec } from '../../types/index.js';
import type { BaseType, Selection } from 'd3-selection';
import type { UnitViewState } from './authoring.js';

/** A source circle read back from the DOM before a unit-value split. */
interface UnitLineageSource {
  key: string;
  parentKey: string;
  valueStart: number;
  valueEnd: number;
  x: number;
  y: number;
  radius: number;
  fill: string | null;
  opacity: string;
}

interface UnitNode extends SVGCircleElement {
  __data__?: Partial<UnitDatum>;
}

type UnitMotion = Motion<SVGCircleElement, UnitDatum>;
type UnitSelection = Selection<SVGCircleElement, UnitDatum, BaseType, unknown>;
type EntryPosition = (unit: UnitDatum, index: number) => Point;

const DEFAULT_UNIT_STAGGER: StaggerSpec = { step: 4, max: 100 };

export function createUnitRenderer(deps: ChartDeps): Renderer<UnitViewState> {
  return new UnitChart(deps).renderer();
}

class UnitChart extends BaseChart<UnitViewState> {
  render(chart: ChartContext, rows: RenderDatum[], spec: UnitViewState, tooltip: HTMLElement, d3: D3Lib): void {
    const {
      bandOrLinear,
      bindTooltip,
      colorScale,
      drawLegend,
      fadeNonUnitShapes,
      position,
      staggerDelay,
      themeValue
    } = this.deps;

    const enc = spec.encoding || {};
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    let units = expandUnits(rows, spec, d3);
    const color = colorScale(domainRows, enc.color, d3);
    const plan = chart.transitionPlan as UnitTransitionPlan | undefined;
    const isUnitValueSplit = plan?.detailChange?.mode === 'split';
    const sourceLineage = isUnitValueSplit
      ? unitLineageSources(chart.g.selectAll<UnitNode, unknown>('circle.vd-unit').nodes())
      : [];
    const originalTransition = chart.transition.base;
    // See point/render.ts: mutating the base ease here never reached the marks
    // under D3 (they inherited the frame's earlier copy), so the value split
    // keeps the shared base timing.
    const grainTransition = originalTransition;
    const stage = isUnitValueSplit ? null : unitStageTiming(chart);
    if (stage) chart.transition.base = transitionFor(chart, d3, stage.viewDuration);
    const baseLayout = unitLayout(units, chart, spec, { bandOrLinear, d3, position });
    if (baseLayout.trajectory && stage) chart.transition.base = originalTransition;
    const camera = focusCamera(
      units.map((unit, index) => ({
        datum: unit.__row || unit,
        bounds: pointBounds(baseLayout.x(unit, index), baseLayout.y(unit, index), baseLayout.r)
      })),
      viewSelection(spec),
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const baseTrajectory = baseLayout.trajectory;
    const layout: UnitLayoutResult = {
      ...baseLayout,
      r: cameraSize(baseLayout.r, camera),
      x: (unit, index) => cameraPosition(baseLayout.x(unit, index), camera, 'x'),
      y: (unit, index) => cameraPosition(baseLayout.y(unit, index), camera, 'y'),
      ...(baseTrajectory ? {
        trajectory: (unit: UnitDatum) => baseTrajectory(unit)?.map((point) => ({
          x: cameraPosition(point.x, camera, 'x'),
          y: cameraPosition(point.y, camera, 'y')
        })),
        trajectoryTimeline: baseLayout.trajectoryTimeline
      } : {})
    };
    const layoutAxes = typeof baseLayout.axes === 'object' ? baseLayout.axes : null;
    const baseAxes: { x: UnitAxis | null; y: UnitAxis | null } = {
      x: layoutAxes?.x || baseLayout.axis || null,
      y: layoutAxes?.y || null
    };
    const xScale = baseAxes.x
      ? cameraScale(baseAxes.x.scale, camera, 'x')
      : null;
    const yScale = baseAxes.y
      ? cameraScale(baseAxes.y.scale, camera, 'y')
      : null;
    chart.camera = camera;
    if (xScale || yScale) {
      drawUnitAxes(chart, { x: xScale, y: yScale }, {
        x: baseAxes.x?.channel,
        y: baseAxes.y?.channel
      }, d3, this.deps, {
        position: cameraPosition(chart.innerHeight, camera, 'y'),
        anchorsOnly: layout.name === 'force'
      });
    } else {
      clearUnitAxes(chart, d3, this.deps);
    }

    fadeNonUnitShapes(chart);
    chart.scales = {
      color,
      layout: layout.name,
      ...(xScale ? { x: xScale } : {}),
      ...(yScale ? { y: yScale } : {})
    };
    chart.channels = enc;
    chart.position = { x: layout.x, y: layout.y };
    drawLegend(chart, rows, enc.color, d3);
    chart.transition.base = originalTransition;

    const match = matchUnitSlotsByIdentityAndTravel(chart, units, layout);
    units = isUnitValueSplit
      ? assignUnitValueLineage(match.units, sourceLineage)
      : match.units;
    const totalDuration = Math.max(1, Number(chart.transition.duration) || 900);
    const markDuration = stage?.markDuration ?? totalDuration;
    const fallsToAxis = Number.isFinite(stage?.moveAcrossDuration);
    const enterDuration = layout.trajectory
      ? Math.max(1, totalDuration - (chart.transition.enterDelay || 0))
      : markDuration;
    const updateDuration = layout.trajectory
      ? Math.max(1, totalDuration - (chart.transition.exitDuration || 0))
      : (fallsToAxis ? stage?.moveAcrossDuration ?? markDuration : markDuration);
    const enterTransition = stage
      ? transitionFor(chart, d3, enterDuration)
      : (chart.transition.enter || originalTransition);
    const updateTransition = stage
      ? transitionFor(chart, d3, updateDuration)
      : originalTransition;
    const transitionOptions = specTransition(spec);
    const hasStaggerOverride = Object.prototype.hasOwnProperty.call(transitionOptions, 'stagger');
    const perMarkDelay = (unit: UnitDatum, index: number): number => isUnitValueSplit
      ? 0
      : stage && !hasStaggerOverride
      ? layout.trajectory
        ? 0
        : travelDelay(unit, match.maxDistance, stage.travelDelay)
      : staggerDelay(
          spec,
          unit,
          index,
          hasStaggerOverride ? transitionOptions.stagger : DEFAULT_UNIT_STAGGER
        );
    const baseMarkDelay = (unit: UnitDatum, index: number): number => isUnitValueSplit
      ? 0
      : layout.trajectory
      ? 0
      : camera.bounds
      ? 0
        : stage
        ? stage.viewDuration + (fallsToAxis
            ? 0
            : perMarkDelay(unit, index))
        : perMarkDelay(unit, index);
    const enterMarkDelay = (unit: UnitDatum, index: number) =>
      (chart.transition.enterDelay || 0) + baseMarkDelay(unit, index);
    const updateMarkDelay = (unit: UnitDatum, index: number) =>
      (chart.transition.exitDuration || 0) + baseMarkDelay(unit, index);
    const opacity = (unit: UnitDatum) => unitSelectionOpacity(
      unit, spec, themeValue('--vd-dim-opacity', 0.22)
    );
    const enterPosition: EntryPosition = (unit, index) => unit.__lineageAnchor
      || trajectoryStart(layout, unit, {
        x: layout.x(unit, index), y: layout.y(unit, index)
      });

    const crispLayer = chart.g.selectAll<SVGGElement, null>('g.vd-unit-crisp-layer')
      .data([null])
      .join('g')
      .attr('class', 'vd-unit-crisp-layer');
    drawUnitValueBlend({
      chart, crispLayer, enabled: isUnitValueSplit, sourceLineage, units,
      layout, color, transition: grainTransition, d3
    });

    crispLayer.selectAll<SVGCircleElement, UnitDatum>('circle.vd-unit')
      .data(units, unitKey)
      .join(
        (enter) => {
          const entered = enter.append('circle')
          .attr('class', 'vd-unit')
          .attr('data-key', semanticUnitKey)
          .attr('data-source-key', (d) => d.__sourceUnitKey ?? null)
          .attr('data-travel-distance', (d) => d.__travelDistance || 0)
          .attr('data-matched-by', (d) => d.__matchedBy ?? null)
          .attr('data-parent-key', (d) => d.__parentKey)
          .attr('data-unit-index', (d) => d.__unitIndex)
          .attr('data-group-key', (d) => groupKeyOf(layout, d))
          .attr('cx', (unit, index) => enterPosition(unit, index).x)
          .attr('cy', (unit, index) => enterPosition(unit, index).y)
          .attr('r', 0)
          .attr('fill', (d) => color(d.__row || d))
          .attr('stroke', themeValue('--vd-mark-stroke', 'white'))
          .attr('stroke-width', cameraSize(themeValue('--vd-unit-stroke-width', 0.5), camera))
          .call(bindTooltip, spec, tooltip);
          const entering = motion(entered, enterTransition)
            .delay(enterMarkDelay)
            .attr('r', layout.r)
            .style('opacity', opacity);
          if (layout.trajectory) applyForceTrajectory(entering, layout, d3, enterPosition);
          return entered;
        },
        (update) => {
          const prepared = update
            .attr('data-key', semanticUnitKey)
            .attr('data-source-key', (d) => d.__sourceUnitKey ?? null)
            .attr('data-travel-distance', (d) => d.__travelDistance || 0)
            .attr('data-matched-by', (d) => d.__matchedBy ?? null)
            .attr('data-parent-key', (d) => d.__parentKey)
            .attr('data-unit-index', (d) => d.__unitIndex)
            .attr('data-group-key', (d) => groupKeyOf(layout, d))
            .call(bindTooltip, spec, tooltip);
          const moveAcross = motion(prepared, updateTransition)
            .delay(updateMarkDelay)
            .attr('cx', layout.x)
            .attr('r', layout.r)
            .attr('fill', (d) => color(d.__row || d))
            .attr('stroke-width', cameraSize(themeValue('--vd-unit-stroke-width', 0.5), camera))
            .style('opacity', opacity);

          if (layout.trajectory) applyForceTrajectory(moveAcross, layout, d3);
          else if (!fallsToAxis || !stage) moveAcross.attr('cy', layout.y);
          else {
            moveAcross
              .transition()
              .delay(perMarkDelay)
              .duration(Math.max(1, stage.markDuration))
              // Falling onto the axis bounces; lifting off it accelerates away.
              // The reverse ease keeps the same route when played backwards.
              .easeVarying(function(unit, index) {
                const fromY = Number((this as Element).getAttribute('cy'));
                const toY = Number(layout.y(unit, index));
                return toY > fromY
                  ? directionalEase(d3.easeBounceOut, d3.easeExpIn)
                  : directionalEase(d3.easeExpOut, d3.easeBounceIn);
              })
              .attr('cy', layout.y);
          }
          return prepared;
        },
        (exit) => {
          motion(exit, chart.transition.exit || updateTransition)
            .delay(layout.trajectory ? 0 : stage ? stage.viewDuration : 0)
            .attr('r', 0)
            .style('opacity', 0)
            .remove();
          return exit;
        }
      );
  }
}

function applyForceTrajectory(transition: UnitMotion, layout: UnitLayoutResult, d3: D3Lib, entryPosition?: EntryPosition): UnitMotion {
  return transition
    // Preserve the shared physical path, but distribute its aggregate motion
    // across progress so raw force cooling does not create long idle ranges.
    .ease(d3.easeSinInOut)
    .attrTween('cx', function(unit, index) {
      const start = entryPosition?.(unit, index);
      return (progress) => forceTrajectoryPosition(layout, unit, progress, start).x;
    })
    .attrTween('cy', function(unit, index) {
      const start = entryPosition?.(unit, index);
      return (progress) => forceTrajectoryPosition(layout, unit, progress, start).y;
    });
}

function trajectoryStart(layout: UnitLayoutResult, unit: UnitDatum, fallback: Point): Point {
  return layout.trajectory?.(unit)?.[0] ?? fallback;
}

function forceTrajectoryPosition(layout: UnitLayoutResult, unit: UnitDatum, progress: number, entryPosition?: Point): Point {
  const target = trajectoryPoint(layout, unit, progress);
  if (!entryPosition) return target;
  return {
    x: entryPosition.x + (target.x - entryPosition.x) * progress,
    y: entryPosition.y + (target.y - entryPosition.y) * progress
  };
}

function unitLineageSources(nodes: UnitNode[]): UnitLineageSource[] {
  return nodes.map((node, index): UnitLineageSource => {
    const unit: Partial<UnitDatum> = node.__data__ || {};
    const x = Number(node.getAttribute('cx'));
    const y = Number(node.getAttribute('cy'));
    const radius = Number(node.getAttribute('r'));
    return {
      key: String(unit.__unitKey ?? node.dataset.key ?? index),
      parentKey: String(unit.__parentKey ?? node.dataset.parentKey ?? ''),
      valueStart: Number(unit.__valueStart) || 0,
      valueEnd: Number(unit.__valueEnd) || 0,
      x, y,
      radius: Number.isFinite(radius) ? radius : 0,
      fill: node.getAttribute('fill'),
      opacity: node.style.opacity || '1'
    };
  }).filter((source) => Number.isFinite(source.x) && Number.isFinite(source.y));
}

function assignUnitValueLineage(units: UnitDatum[], sources: UnitLineageSource[]): UnitDatum[] {
  const sourcesByParent = new Map<string, UnitLineageSource[]>();
  sources.forEach((source) => {
    const values = sourcesByParent.get(source.parentKey) || [];
    values.push(source);
    sourcesByParent.set(source.parentKey, values);
  });
  return units.map((unit, targetIndex): UnitDatum => {
    const candidates = sourcesByParent.get(String(unit.__parentKey)) || [];
    const targetStart = Number(unit.__valueStart) || 0;
    const targetEnd = Number(unit.__valueEnd) || targetStart;
    const targetMiddle = (targetStart + targetEnd) / 2;
    type Best = { candidate: UnitLineageSource; overlap: number; distance: number } | null;
    const source = candidates.reduce<Best>((best, candidate) => {
      const overlap = Math.max(0,
        Math.min(targetEnd, candidate.valueEnd) - Math.max(targetStart, candidate.valueStart));
      const distance = Math.abs(targetMiddle - (candidate.valueStart + candidate.valueEnd) / 2);
      if (!best || overlap > best.overlap || (overlap === best.overlap && distance < best.distance)) {
        return { candidate, overlap, distance };
      }
      return best;
    }, null)?.candidate;
    if (!source) return { ...unit, __targetIndex: targetIndex };
    return {
      ...unit,
      __targetIndex: targetIndex,
      __lineageSourceKey: source.key,
      __lineageAnchor: { x: source.x, y: source.y }
    };
  });
}

/**
 * Unit-value changes use the same handoff as Point Blend: crisp endpoint marks
 * are hidden only during motion while a filtered parent/child silhouette shows
 * quantity being transferred. Every coarse interval owns its overlapping fine
 * intervals, rather than collapsing an entire source row to one centroid.
 */
function drawUnitValueBlend({
  chart, crispLayer, enabled, sourceLineage, units, layout, color, transition, d3
}: {
  chart: ChartContext;
  crispLayer: ChartSelection<SVGGElement, null>;
  enabled: boolean;
  sourceLineage: UnitLineageSource[];
  units: UnitDatum[];
  layout: UnitLayoutResult;
  color: (row: RenderDatum) => string;
  transition: MotionTiming;
  d3: D3Lib;
}): void {
  crispLayer.interrupt().style('visibility', 'visible');
  chart.g.selectAll('g.vd-unit-blend-layer').remove();
  if (!enabled || !sourceLineage.length) return;

  const layer = chart.g.append('g')
    .attr('class', 'vd-unit-blend-layer')
    .style('pointer-events', 'none')
    .style('visibility', 'hidden')
    .raise();
  const filterId = ensureUnitBlendFilter(chart.scene, d3);
  const childrenBySource = d3.group(
    units.filter((unit) => unit.__lineageSourceKey),
    (unit) => unit.__lineageSourceKey
  );
  const groups = sourceLineage
    .map((source) => ({ source, children: childrenBySource.get(source.key) || [] }))
    .filter((entry) => entry.children.length);

  const group = layer.selectAll<SVGGElement, { source: UnitLineageSource; children: UnitDatum[] }>('g.vd-unit-blend-group')
    .data(groups, (entry) => entry.source.key)
    .join('g')
    .attr('class', 'vd-unit-blend-group')
    .attr('data-parent-unit-key', (entry) => entry.source.key)
    .attr('filter', `url(#${filterId})`);

  group.each(function(entry) {
    const parent = d3.select(this).append('circle')
      .attr('class', 'vd-unit-blend')
      .attr('data-blend-role', 'parent')
      .attr('cx', entry.source.x)
      .attr('cy', entry.source.y)
      .attr('r', entry.source.radius)
      .attr('fill', entry.source.fill)
      .style('opacity', entry.source.opacity);
    const childPaths = entry.children.map((unit) => ({
      start: { x: entry.source.x, y: entry.source.y },
      end: { x: layout.x(unit, unit.__targetIndex ?? 0), y: layout.y(unit, unit.__targetIndex ?? 0) },
      radius: Math.max(4, layout.r)
    }));
    motion(parent, transition)
      .attrTween('r', () => (progress) => String(unitBlendParentRadius({
        progress,
        startRadius: entry.source.radius,
        parent: { x: entry.source.x, y: entry.source.y },
        children: childPaths
      })))
      .remove();

    const children = d3.select(this).selectAll<SVGCircleElement, UnitDatum>('circle.vd-unit-blend-child')
      .data(entry.children, (unit) => unit.__unitKey)
      .join('circle')
      .attr('class', 'vd-unit-blend vd-unit-blend-child')
      .attr('data-blend-role', 'child')
      .attr('data-key', (unit) => unit.__unitKey)
      .attr('cx', entry.source.x)
      .attr('cy', entry.source.y)
      .attr('r', Math.max(4, layout.r))
      .attr('fill', (unit) => color(unit.__row || unit));
    motion(children, transition)
      .attrTween('cx', (unit) => (progress) =>
        unitBlendPosition(layout, unit, progress, entry.source).x)
      .attrTween('cy', (unit) => (progress) =>
        unitBlendPosition(layout, unit, progress, entry.source).y);
  });

  motion(layer, transition)
    .styleTween('visibility', () => (progress) =>
      progress > 0 && progress < 1 ? 'visible' : 'hidden');
  motion(crispLayer, transition)
    .styleTween('visibility', () => (progress) =>
      progress > 0 && progress < 1 ? 'hidden' : 'visible');
}

function unitBlendPosition(layout: UnitLayoutResult, unit: UnitDatum, progress: number, source: Point): Point {
  if (layout.trajectory) {
    return forceTrajectoryPosition(layout, unit, progress, source);
  }
  const target = {
    x: layout.x(unit, unit.__targetIndex ?? 0),
    y: layout.y(unit, unit.__targetIndex ?? 0)
  };
  return {
    x: source.x + (target.x - source.x) * progress,
    y: source.y + (target.y - source.y) * progress
  };
}

const UNIT_BLEND_BLUR = 5;
const UNIT_BLEND_REACH = UNIT_BLEND_BLUR * 2;

function unitBlendParentRadius({ progress, startRadius, parent, children }: {
  progress: number;
  startRadius: number;
  parent: Point;
  children: Array<{ start: Point; end: Point; radius: number }>;
}): number {
  const connectionTotal = children.reduce((total, child) => {
    const point = {
      x: child.start.x + (child.end.x - child.start.x) * progress,
      y: child.start.y + (child.end.y - child.start.y) * progress
    };
    const distance = Math.hypot(point.x - parent.x, point.y - parent.y);
    const disconnectAt = child.radius + UNIT_BLEND_REACH;
    const shrinkFrom = disconnectAt * 0.7;
    return total + 1 - smoothStep(shrinkFrom, disconnectAt, distance);
  }, 0);
  const connectedShare = children.length ? connectionTotal / children.length : 0;
  const endpoint = 1 - smoothStep(0.82, 1, progress);
  return startRadius * Math.min(connectedShare, endpoint);
}

function smoothStep(from: number, to: number, value: number): number {
  const progress = Math.max(0, Math.min(1,
    (value - from) / Math.max(Number.EPSILON, to - from)));
  return progress * progress * (3 - 2 * progress);
}

function ensureUnitBlendFilter(scene: ChartSceneContext, d3: D3Lib): string {
  void d3;
  const id = `vd-unit-blend-${scene.clipIdentity}`;
  const defs = scene.svg.selectAll<SVGDefsElement, null>('defs.vd-unit-blend-defs')
    .data([null])
    .join('defs')
    .attr('class', 'vd-unit-blend-defs');
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
    .attr('stdDeviation', UNIT_BLEND_BLUR)
    .attr('result', 'blur');
  filter.append('feColorMatrix')
    .attr('in', 'blur')
    .attr('mode', 'matrix')
    .attr('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8');
  return id;
}

function trajectoryPoint(layout: UnitLayoutResult, unit: UnitDatum, progress: number): Point {
  const frames = layout.trajectory?.(unit);
  if (!frames?.length) return { x: layout.x(unit, unit.__targetIndex ?? 0), y: layout.y(unit, unit.__targetIndex ?? 0) };
  if (frames.length === 1) return frames[0];
  const bounded = Math.max(0, Math.min(1, progress));
  if (bounded === 0) return frames[0];
  if (bounded === 1) return frames[frames.length - 1];
  const timeline = layout.trajectoryTimeline;
  if (!timeline || timeline.length !== frames.length) {
    const scaled = bounded * (frames.length - 1);
    return interpolateTrajectory(frames, Math.floor(scaled), Math.ceil(scaled), scaled % 1);
  }
  let low = 1;
  let high = timeline.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (timeline[middle] < bounded) low = middle + 1;
    else high = middle;
  }
  const upper = low;
  const lower = upper - 1;
  const span = timeline[upper] - timeline[lower];
  const mix = span > Number.EPSILON ? (bounded - timeline[lower]) / span : 1;
  return interpolateTrajectory(frames, lower, upper, mix);
}

function interpolateTrajectory(frames: Point[], lower: number, upper: number, mix: number): Point {
  return {
    x: frames[lower].x + (frames[upper].x - frames[lower].x) * mix,
    y: frames[lower].y + (frames[upper].y - frames[lower].y) * mix
  };
}

function semanticUnitKey(unit: UnitDatum): string {
  return unit.__semanticUnitKey ?? unit.__unitKey;
}

function groupKeyOf(layout: UnitLayoutResult, unit: UnitDatum): string | null {
  if (!layout.groupField) return null;
  const value = unit.__row[layout.groupField];
  return value == null ? null : String(value);
}

function travelDelay(unit: UnitDatum, maxDistance: number, travelWindow: number): number {
  if (!maxDistance) return 0;
  return (Number(unit.__travelDistance) || 0) / maxDistance * travelWindow;
}

// Stage timings are plain descriptors sharing the chart's ease.
function transitionFor(chart: ChartContext, d3: D3Lib, duration: number): MotionTiming {
  void d3;
  return { delay: 0, duration: Math.max(1, duration), ease: chart.transition.base.ease };
}
