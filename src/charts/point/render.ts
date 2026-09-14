// @ts-nocheck — D3 rendering code; typed via deps injection
import { BaseChart } from '../base.js';
import { cameraScale, cameraSize, focusCamera, matchesSelection, pointBounds, viewHighlight, viewSelection } from '../../focus.js';
import { applyTransforms } from '../../data/transforms.js';
import { drawPointAxes } from './axes.js';
import { applyPointIdentity, pointKeyAccessor, pointStoredKey } from './keys.js';
import { defaultPointRadius, parentAnchors, parentKey, pointState, radiusScale } from './state.js';

export function createPointRenderer(deps) {
  return new PointChart(deps).renderer();
}

class PointChart extends BaseChart {
  render(chart, rows, spec, tooltip, d3) {
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
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const state = pointState(spec, enc);
    const viewEnc = state.view?.encoding || enc;
    const viewRows = state.view
      ? applyTransforms(chart.sourceRows, state.view.transform || [], chart.aq)
      : rows;
    const selection = viewSelection(spec);
    const movesPoints = state.detailMode === 'detail' && !state.view;
    // Summary -> detail is the canonical path. Giving that path ease-out makes
    // its exact reverse (detail -> summary) ease-in: gather starts slowly and
    // accelerates as the points converge.
    const t = movesPoints
      ? chart.transition.base.ease(d3.easeCubicOut)
      : chart.transition.base;
    const baseX = bandOrLinear(viewRows, viewEnc.x, [0, chart.innerWidth], d3);
    const baseY = bandOrLinear(viewRows, viewEnc.y, [chart.innerHeight, 0], d3);
    const color = colorScale(domainRows, enc.color, d3);
    const fallbackRadius = Number.isFinite(Number(spec.size))
      ? Number(spec.size)
      : defaultPointRadius(rows.length);
    const baseRadius = radiusScale(domainRows, enc.size, fallbackRadius, d3, quantitativeDomain);
    const camera = focusCamera(
      viewRows.map((row) => ({
        datum: row,
        bounds: pointBounds(
          position(baseX, row[viewEnc.x?.field]),
          position(baseY, row[viewEnc.y?.field]),
          baseRadius(row)
        )
      })),
      selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const x = cameraScale(baseX, camera, 'x');
    const y = cameraScale(baseY, camera, 'y');
    const radius = (row) => cameraSize(baseRadius(row), camera);
    chart.camera = camera;
    const markDelay = camera.bounds
      ? () => 0
      : (row, index) => staggerDelay(spec, row, index);
    const scaleMarkDelay = (row, index) =>
      (chart.transition.exitDuration || 0) + markDelay(row, index);
    const opacity = (row) => pointSelectionOpacity(row, spec, themeValue('--vd-dim-opacity', 0.22));
    const key = pointKeyAccessor(spec, enc.x?.field || enc.y?.field);

    // Anchor tracking for gather/scatter animation across detail transitions.
    // When rolling up (detail → aggregate), exiting points fly to the next cluster centroid.
    // When breaking down (aggregate → detail), entering points start at the previous cluster centroid.
    const previousAnchors = chart.scene.pointAnchors || { byParent: new Map() };

    function chartPosition(row) {
      return {
        x: position(x, row[enc.x?.field]),
        y: position(y, row[enc.y?.field])
      };
    }

    const nextParentAnchors = parentAnchors(rows, state.parentField, chartPosition);

    function enterAnchor(row) {
      const parent = parentKey(row, state.parentField);
      return previousAnchors.byParent?.get(parent) || chartPosition(row);
    }

    function pointEnterPosition(row) {
      // An added observation has no meaningful journey from another datum:
      // it is born at its target and grows there. A summary/detail change is
      // different—the parent centroid is meaningful data, so children may
      // spread from it.
      return movesPoints ? enterAnchor(row) : chartPosition(row);
    }

    function exitAnchor(row) {
      const parent = parentKey(row, state.parentField);
      return nextParentAnchors.get(parent) || chartPosition(row);
    }

    fadeNonPointShapes(chart);
    this.setCartesianState(chart, viewEnc, { x, y, color }, {
      x: (d) => position(x, d[enc.x?.field]),
      y: (d) => position(y, d[enc.y?.field])
    });
    drawPointAxes(chart, x, y, viewEnc, d3, { chartStyle, drawGrid, drawXAxis, drawYAxis });
    drawLegend(chart, rows, enc.color, d3);

    const crispLayer = chart.g.selectAll('g.vd-point-crisp-layer')
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

    crispLayer.selectAll('circle.vd-point')
      .data(rows, (d, i) => pointStoredKey(d, i, key))
      .join(
        (enter) => enter
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
          .call(bindTooltip, spec, tooltip)
          .transition(chart.transition.enter || t)
          .delay((d, i) => (chart.transition.enterDelay || 0) + markDelay(d, i))
          .attr('cx', (d) => chartPosition(d).x)
          .attr('cy', (d) => chartPosition(d).y)
          .attr('r', (d) => radius(d))
          .style('opacity', (d) => opacity(d)),
        (update) => update
          .call(applyPointIdentity, key)
          .call(bindTooltip, spec, tooltip)
          .transition(t)
          .delay(scaleMarkDelay)
          .attr('cx', (d) => chartPosition(d).x)
          .attr('cy', (d) => chartPosition(d).y)
          .attr('r', (d) => radius(d))
          .attr('fill', (d) => color(d))
          .attr('stroke-width', cameraSize(themeValue('--vd-point-stroke-width', 1.5), camera))
          .style('opacity', (d) => opacity(d)),
        (exit) => {
          const leaving = exit
            .transition(chart.transition.exit || t)
            .delay(markDelay)
            .style('opacity', 0)
          if (!chart.transition.exitFirst) {
            leaving
              .attr('cx', (d) => exitAnchor(d).x)
              .attr('cy', (d) => exitAnchor(d).y);
          }
          if (blendMotion) leaving.attrTween('r', blendMotion.parentRadiusTween);
          else leaving.attr('r', 0);
          return leaving.remove();
        }
      );

    // Persist per-step anchor positions for the next transition.
    chart.scene.pointAnchors = {
      byKey: new Map(rows.map((row, index) => [String(key(row, index)), chartPosition(row)])),
      byParent: nextParentAnchors
    };

    // Clean up any stale parent-centroid markers from previous renders.
    chart.g.selectAll('circle.vd-point-parent')
      .transition(t)
      .attr('r', 0)
      .style('opacity', 0)
      .remove();
  }
}

/** A deterministic, decorative layer for summary/detail movement. */
function drawPointBlend({
  chart, rows, state, key, radius, color, enterAnchor, exitAnchor,
  chartPosition, crispLayer, blendMotion, movesPoints, transition, d3
}) {
  const enabled = state.effect === 'blend';
  crispLayer.interrupt().style('visibility', 'visible');
  const layer = chart.g.selectAll('g.vd-point-blend-layer')
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
  const group = layer.selectAll('g.vd-point-blend-group')
    .data(groups, (entry) => entry.parent)
    .join(
      (enter) => enter.append('g').attr('class', 'vd-point-blend-group'),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr('filter', `url(#${filterId})`);

  group.each(function(entry) {
    d3.select(this).selectAll('circle.vd-point-blend')
      .data(entry.values, (row, index) => pointStoredKey(row, index, key))
      .join(
        (enter) => enter.append('circle')
          .attr('class', 'vd-point-blend')
          .attr('data-blend-role', state.detailMode === 'aggregate' ? 'summary' : 'child')
          .attr('cx', (row) => enterAnchor(row).x)
          .attr('cy', (row) => enterAnchor(row).y)
          .attr('r', (row) => Math.max(4, radius(row)))
          .attr('fill', (row) => color(row))
          .transition(transition)
          .attr('cx', (row) => chartPosition(row).x)
          .attr('cy', (row) => chartPosition(row).y),
        (update) => update
          .attr('data-blend-role', state.detailMode === 'aggregate' ? 'summary' : 'child')
          .transition(transition)
          .attr('cx', (row) => chartPosition(row).x)
          .attr('cy', (row) => chartPosition(row).y)
          .attr('r', (row) => Math.max(4, radius(row)))
          .attr('fill', (row) => color(row)),
        (exit) => {
          const leaving = exit
            .attr('data-blend-role', 'parent')
            .transition(transition)
            .attr('cx', (row) => exitAnchor(row).x)
            .attr('cy', (row) => exitAnchor(row).y);
          if (blendMotion) leaving.attrTween('r', blendMotion.parentRadiusTween);
          else leaving.attr('r', 0);
          return leaving.remove();
        }
      );
  });

  layer.interrupt().style('visibility', 'hidden');
  if (movesPoints) {
    layer.transition(transition)
      .styleTween('visibility', () => (progress) =>
        pointBlendVisibility(progress));
    crispLayer.transition(transition)
      .styleTween('visibility', () => (progress) =>
        pointCrispVisibility(progress));
  }
}

function pointBlendVisibility(progress) {
  return progress > 0 && progress < 1 ? 'visible' : 'hidden';
}

function pointCrispVisibility(progress) {
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
}) {
  if (state.effect !== 'blend' || state.detailMode !== 'detail' || state.view) return null;

  const childrenByParent = new Map();
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
    parentRadiusTween: function parentRadiusTween(row) {
      const startRadius = Math.max(0, Number(this.getAttribute('r')) || 0);
      const parentStart = {
        x: Number(this.getAttribute('cx')) || 0,
        y: Number(this.getAttribute('cy')) || 0
      };
      const parentEnd = exitAnchor(row);
      const children = childrenByParent.get(parentKey(row, state.parentField)) || [];
      return (progress) => String(pointBlendParentRadius({
        progress, startRadius, parentStart, parentEnd, children
      }));
    }
  };
}

function pointBlendParentRadius({
  progress, startRadius, parentStart, parentEnd, children
}) {
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

function interpolatePoint(from, to, progress) {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress
  };
}

function smoothStep(from, to, value) {
  const progress = Math.max(0, Math.min(1, (value - from) / Math.max(Number.EPSILON, to - from)));
  return progress * progress * (3 - 2 * progress);
}

function ensurePointBlendFilter(scene, d3) {
  const id = `vd-point-blend-${scene.clipIdentity}`;
  const defs = scene.svg.selectAll('defs.vd-point-blend-defs')
    .data([null])
    .join('defs')
    .attr('class', 'vd-point-blend-defs');
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
    .attr('stdDeviation', 5)
    .attr('result', 'blur');
  filter.append('feColorMatrix')
    .attr('in', 'blur')
    .attr('mode', 'matrix')
    .attr('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8');
  return id;
}

export function pointSelectionOpacity(row, spec = {}, dimOpacity = 0.22) {
  const selection = viewHighlight(spec);
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(row?.__row || row, selection)
    ? 1
    : Number(selection.opacity ?? dimOpacity);
}
