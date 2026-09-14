// @ts-nocheck — D3 rendering code; typed via deps injection
import { BaseChart } from '../base.js';
import { cameraPosition, cameraScale, cameraSize, focusCamera, pointBounds, viewSelection } from '../../focus.js';
import { specTransition } from '../../spec-meta.js';
import { directionalEase } from '../../transition-progress.js';
import { unitKey } from './keys.js';
import { clearUnitAxes, drawUnitAxes } from './axes.js';
import {
  expandUnits,
  matchUnitSlotsByIdentityAndTravel,
  unitLayout,
  unitSelectionOpacity,
  unitStageTiming
} from './state.js';

const DEFAULT_UNIT_STAGGER = { step: 4, max: 100 };

export function createUnitRenderer(deps) {
  return new UnitChart(deps).renderer();
}

class UnitChart extends BaseChart {
  render(chart, rows, spec, tooltip, d3) {
    const {
      bandOrLinear,
      bindTooltip,
      chartStyle,
      colorScale,
      drawGrid,
      drawLegend,
      drawXAxis,
      drawYAxis,
      fadeNonUnitShapes,
      niceExtent,
      position,
      staggerDelay,
      themeValue,
      updateGrid
    } = this.deps;

    const enc = spec.encoding || {};
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    let units = expandUnits(rows, spec, d3);
    const color = colorScale(domainRows, enc.color, d3);
    const isUnitValueSplit = chart.transitionPlan?.detailChange?.mode === 'split';
    const sourceLineage = isUnitValueSplit
      ? unitLineageSources(chart.g.selectAll('circle.vd-unit').nodes())
      : [];
    const originalTransition = chart.transition.base;
    const grainTransition = isUnitValueSplit
      ? originalTransition.ease(d3.easeCubicOut)
      : originalTransition;
    const stage = isUnitValueSplit ? null : unitStageTiming(chart);
    if (stage) chart.transition.base = transitionFor(chart, d3, stage.viewDuration);
    const baseLayout = unitLayout(units, chart, spec, {
      bandOrLinear, chartStyle, d3, drawGrid, drawXAxis, drawYAxis, niceExtent, position, updateGrid
    });
    if (baseLayout.trajectory && stage) chart.transition.base = originalTransition;
    const camera = focusCamera(
      units.map((unit, index) => ({
        datum: unit.__row || unit,
        bounds: pointBounds(baseLayout.x(unit, index), baseLayout.y(unit, index), baseLayout.r)
      })),
      viewSelection(spec),
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const layout = {
      ...baseLayout,
      r: cameraSize(baseLayout.r, camera),
      x: (unit, index) => cameraPosition(baseLayout.x(unit, index), camera, 'x'),
      y: (unit, index) => cameraPosition(baseLayout.y(unit, index), camera, 'y'),
      ...(baseLayout.trajectory ? {
        trajectory: (unit) => baseLayout.trajectory(unit).map((point) => ({
          x: cameraPosition(point.x, camera, 'x'),
          y: cameraPosition(point.y, camera, 'y')
        })),
        trajectoryTimeline: baseLayout.trajectoryTimeline
      } : {})
    };
    const baseAxes = {
      x: baseLayout.axes?.x || baseLayout.axis || null,
      y: baseLayout.axes?.y || null
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
      }, d3, {
        chartStyle, drawGrid, drawXAxis, drawYAxis, updateGrid
      }, {
        position: cameraPosition(chart.innerHeight, camera, 'y'),
        anchorsOnly: layout.name === 'force'
      });
    } else {
      clearUnitAxes(chart, d3, { drawXAxis, drawYAxis, updateGrid });
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
    const markDuration = stage?.markDuration;
    const fallsToAxis = Number.isFinite(stage?.moveAcrossDuration);
    const enterDuration = layout.trajectory
      ? Math.max(1, totalDuration - (chart.transition.enterDelay || 0))
      : markDuration;
    const updateDuration = layout.trajectory
      ? Math.max(1, totalDuration - (chart.transition.exitDuration || 0))
      : (fallsToAxis ? stage?.moveAcrossDuration : markDuration);
    const enterTransition = stage
      ? transitionFor(chart, d3, enterDuration)
      : (chart.transition.enter || originalTransition);
    const updateTransition = stage
      ? transitionFor(chart, d3, updateDuration)
      : originalTransition;
    const transitionOptions = specTransition(spec);
    const hasStaggerOverride = Object.prototype.hasOwnProperty.call(transitionOptions, 'stagger');
    const perMarkDelay = (unit, index) => isUnitValueSplit
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
    const baseMarkDelay = (unit, index) => isUnitValueSplit
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
    const enterMarkDelay = (unit, index) =>
      (chart.transition.enterDelay || 0) + baseMarkDelay(unit, index);
    const updateMarkDelay = (unit, index) =>
      (chart.transition.exitDuration || 0) + baseMarkDelay(unit, index);
    const opacity = (unit) => unitSelectionOpacity(
      unit, spec, themeValue('--vd-dim-opacity', 0.22)
    );
    const enterPosition = (unit, index) => unit.__lineageAnchor
      || trajectoryStart(layout, unit, 'position', {
        x: layout.x(unit, index), y: layout.y(unit, index)
      });

    const crispLayer = chart.g.selectAll('g.vd-unit-crisp-layer')
      .data([null])
      .join('g')
      .attr('class', 'vd-unit-crisp-layer');
    drawUnitValueBlend({
      chart, crispLayer, enabled: isUnitValueSplit, sourceLineage, units,
      layout, color, transition: grainTransition, d3
    });

    crispLayer.selectAll('circle.vd-unit')
      .data(units, unitKey)
      .join(
        (enter) => {
          const entered = enter.append('circle')
          .attr('class', 'vd-unit')
          .attr('data-key', semanticUnitKey)
          .attr('data-source-key', (d) => d.__sourceUnitKey)
          .attr('data-travel-distance', (d) => d.__travelDistance || 0)
          .attr('data-matched-by', (d) => d.__matchedBy)
          .attr('data-parent-key', (d) => d.__parentKey)
          .attr('data-unit-index', (d) => d.__unitIndex)
          .attr('data-group-key', (d) => layout.groupField ? d.__row[layout.groupField] : null)
          .attr('cx', (unit, index) => enterPosition(unit, index).x)
          .attr('cy', (unit, index) => enterPosition(unit, index).y)
          .attr('r', 0)
          .attr('fill', (d) => color(d.__row || d))
          .attr('stroke', themeValue('--vd-mark-stroke', 'white'))
          .attr('stroke-width', cameraSize(themeValue('--vd-unit-stroke-width', 0.5), camera))
          .call(bindTooltip, spec, tooltip);
          const entering = entered.transition(enterTransition)
          .delay(enterMarkDelay)
          .attr('r', layout.r)
          .style('opacity', opacity);
          return layout.trajectory
            ? applyForceTrajectory(entering, layout, d3, enterPosition)
            : entering;
        },
        (update) => {
          const moveAcross = update
            .attr('data-key', semanticUnitKey)
            .attr('data-source-key', (d) => d.__sourceUnitKey)
            .attr('data-travel-distance', (d) => d.__travelDistance || 0)
            .attr('data-matched-by', (d) => d.__matchedBy)
            .attr('data-parent-key', (d) => d.__parentKey)
            .attr('data-unit-index', (d) => d.__unitIndex)
            .attr('data-group-key', (d) => layout.groupField ? d.__row[layout.groupField] : null)
            .call(bindTooltip, spec, tooltip)
            .transition(updateTransition)
            .delay(updateMarkDelay)
            .attr('cx', layout.x)
            .attr('r', layout.r)
            .attr('fill', (d) => color(d.__row || d))
            .attr('stroke-width', cameraSize(themeValue('--vd-unit-stroke-width', 0.5), camera))
            .style('opacity', opacity);

          if (layout.trajectory) return applyForceTrajectory(moveAcross, layout, d3);
          if (!fallsToAxis) return moveAcross.attr('cy', layout.y);
          return moveAcross
            .transition()
            .delay(perMarkDelay)
            .duration(Math.max(1, stage.markDuration))
            .easeVarying(function(unit, index) {
              const fromY = Number(this.getAttribute('cy'));
              const toY = Number(layout.y(unit, index));
              return toY > fromY
                ? directionalEase(d3.easeBounceOut, d3.easeExpIn)
                : directionalEase(d3.easeExpOut, d3.easeBounceIn);
            })
            .attr('cy', layout.y);
        },
        (exit) => exit
          .transition(chart.transition.exit || updateTransition)
          .delay(layout.trajectory ? 0 : stage ? stage.viewDuration : 0)
          .attr('r', 0)
          .style('opacity', 0)
          .remove()
      );
  }
}

function applyForceTrajectory(transition, layout, d3, entryPosition) {
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

function trajectoryStart(layout, unit, axis, fallback) {
  if (axis === 'position') return layout.trajectory?.(unit)?.[0] ?? fallback;
  return layout.trajectory?.(unit)?.[0]?.[axis] ?? fallback;
}

function forceTrajectoryPosition(layout, unit, progress, entryPosition) {
  const target = trajectoryPoint(layout, unit, progress);
  if (!entryPosition) return target;
  return {
    x: entryPosition.x + (target.x - entryPosition.x) * progress,
    y: entryPosition.y + (target.y - entryPosition.y) * progress
  };
}

function unitLineageSources(nodes) {
  return nodes.map((node, index) => {
    const unit = node.__data__ || {};
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

function assignUnitValueLineage(units, sources) {
  const sourcesByParent = new Map();
  sources.forEach((source) => {
    const values = sourcesByParent.get(source.parentKey) || [];
    values.push(source);
    sourcesByParent.set(source.parentKey, values);
  });
  return units.map((unit, targetIndex) => {
    const candidates = sourcesByParent.get(String(unit.__parentKey)) || [];
    const targetStart = Number(unit.__valueStart) || 0;
    const targetEnd = Number(unit.__valueEnd) || targetStart;
    const targetMiddle = (targetStart + targetEnd) / 2;
    const source = candidates.reduce((best, candidate) => {
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
}) {
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

  const group = layer.selectAll('g.vd-unit-blend-group')
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
      end: { x: layout.x(unit, unit.__targetIndex), y: layout.y(unit, unit.__targetIndex) },
      radius: Math.max(4, layout.r)
    }));
    parent.transition(transition)
      .attrTween('r', () => (progress) => String(unitBlendParentRadius({
        progress,
        startRadius: entry.source.radius,
        parent: { x: entry.source.x, y: entry.source.y },
        children: childPaths
      })))
      .remove();

    d3.select(this).selectAll('circle.vd-unit-blend-child')
      .data(entry.children, (unit) => unit.__unitKey)
      .join('circle')
      .attr('class', 'vd-unit-blend vd-unit-blend-child')
      .attr('data-blend-role', 'child')
      .attr('data-key', (unit) => unit.__unitKey)
      .attr('cx', entry.source.x)
      .attr('cy', entry.source.y)
      .attr('r', Math.max(4, layout.r))
      .attr('fill', (unit) => color(unit.__row || unit))
      .transition(transition)
      .attrTween('cx', (unit) => (progress) =>
        unitBlendPosition(layout, unit, progress, entry.source).x)
      .attrTween('cy', (unit) => (progress) =>
        unitBlendPosition(layout, unit, progress, entry.source).y);
  });

  layer.transition(transition)
    .styleTween('visibility', () => (progress) =>
      progress > 0 && progress < 1 ? 'visible' : 'hidden');
  crispLayer.transition(transition)
    .styleTween('visibility', () => (progress) =>
      progress > 0 && progress < 1 ? 'hidden' : 'visible');
}

function unitBlendPosition(layout, unit, progress, source) {
  if (layout.trajectory) {
    return forceTrajectoryPosition(layout, unit, progress, source);
  }
  const target = {
    x: layout.x(unit, unit.__targetIndex),
    y: layout.y(unit, unit.__targetIndex)
  };
  return {
    x: source.x + (target.x - source.x) * progress,
    y: source.y + (target.y - source.y) * progress
  };
}

const UNIT_BLEND_BLUR = 5;
const UNIT_BLEND_REACH = UNIT_BLEND_BLUR * 2;

function unitBlendParentRadius({ progress, startRadius, parent, children }) {
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

function smoothStep(from, to, value) {
  const progress = Math.max(0, Math.min(1,
    (value - from) / Math.max(Number.EPSILON, to - from)));
  return progress * progress * (3 - 2 * progress);
}

function ensureUnitBlendFilter(scene, d3) {
  const id = `vd-unit-blend-${scene.clipIdentity}`;
  const defs = scene.svg.selectAll('defs.vd-unit-blend-defs')
    .data([null])
    .join('defs')
    .attr('class', 'vd-unit-blend-defs');
  let filter = defs.select(`#${id}`);
  if (!filter.empty()) return id;

  filter = defs.append('filter')
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

function trajectoryPoint(layout, unit, progress) {
  const frames = layout.trajectory(unit);
  if (!frames?.length) return { x: layout.x(unit), y: layout.y(unit) };
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

function interpolateTrajectory(frames, lower, upper, mix) {
  return {
    x: frames[lower].x + (frames[upper].x - frames[lower].x) * mix,
    y: frames[lower].y + (frames[upper].y - frames[lower].y) * mix
  };
}

function semanticUnitKey(unit) {
  return unit.__semanticUnitKey ?? unit.__unitKey;
}

function travelDelay(unit, maxDistance, travelWindow) {
  if (!maxDistance) return 0;
  return (Number(unit.__travelDistance) || 0) / maxDistance * travelWindow;
}

function transitionFor(chart, d3, duration) {
  const transition = chart.seekable
    ? d3.transition(chart.seekTransitionName)
    : d3.transition();
  return transition.duration(Math.max(1, duration)).ease(chart.transition.base.ease());
}
