// @ts-nocheck — D3 rendering code; typed via deps injection
import { BaseChart } from '../base.js';
import { cameraScale, cameraSize, focusCamera, matchesSelection, pointBounds } from '../../focus.js';
import { d3Curve } from './curve.js';
import { linePointKeyAccessor, lineSeriesKey } from './keys.js';
import { matchLinePathFrames } from './path.js';
import { connectedLineStretches, lineRowsAtTotal, lineState } from './state.js';
import { drawLineAxes } from './axes.js';

export function createLineRenderer(deps) {
  return new LineChart(deps).renderer();
}

class LineChart extends BaseChart {
  render(chart, rows, spec, tooltip, d3) {
    const {
      bandOrLinear,
      bindTooltip,
      colorScale,
      drawLegend,
      fadeNonLineShapes,
      position,
      staggerDelay,
      themeValue
    } = this.deps;

    const enc = spec.encoding || {};
    const state = lineState(spec, enc);
    const observation = chart.transitionPlan?.observation;
    const addedKeys = new Set((observation?.addedKeys || []).map(String));
    const removedKeys = new Set((observation?.removedKeys || []).map(String));
    const addsObservations = addedKeys.size > 0;
    const addsAndRemoves = addsObservations && removedKeys.size > 0;
    const totalDuration = Number(chart.transitionPlan?.timing?.duration) || 900;
    const scaleDuration = chart.transition.scaleDuration || totalDuration;
    const enterWindow = chart.transition.enterLast
      ? chart.transition.enterDuration
      : totalDuration;
    const pointStart = addsObservations ? Math.round(enterWindow * 0.7) : scaleDuration;
    const lineDuration = addsObservations && !addsAndRemoves
      ? (chart.transition.enterLast ? pointStart : Math.min(pointStart, scaleDuration))
      : scaleDuration;
    const pointDuration = Math.max(1, enterWindow - pointStart);
    // Geometry and axes move together first. New points use the remaining
    // time. Canonical reverse playback makes a removal do the exact opposite.
    // A mark-specific duration must not mutate the shared base transition.
    // Axis ticks, labels, and grid lines receive the same explicit duration
    // below so one scale change remains one synchronized chart-part change.
    const t = chart.transition.base;
    const exitTransition = chart.transition.exit || t;
    const enterTransition = chart.transition.enter || t;
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const plottedRows = state.detailPosition === 'total'
      ? lineRowsAtTotal(rows, enc.x?.field, enc.y?.field, state.detailParentOp)
      : rows;
    const lineageRows = state.detailPosition === 'total'
      ? lineRowsAtTotal(domainRows, enc.x?.field, enc.y?.field, state.detailParentOp)
      : domainRows;
    const filtersRows = Boolean(state.selection?.filter) &&
      state.selection?.mode !== 'focus' && state.selection?.mode !== 'highlight';
    const scaleRows = filtersRows ? lineageRows : plottedRows;
    const baseX = bandOrLinear(scaleRows, enc.x, [0, chart.innerWidth], d3);
    const baseY = bandOrLinear(scaleRows, enc.y, [chart.innerHeight, 0], d3);
    const authoredPointRadius = Number.isFinite(Number(spec.pointSize))
      ? Number(spec.pointSize)
      : themeValue('--vd-line-point-size', 4.5);
    const camera = focusCamera(
      plottedRows.map((row) => ({
        datum: row,
        bounds: pointBounds(
          position(baseX, row[enc.x?.field]),
          position(baseY, row[enc.y?.field]),
          authoredPointRadius
        )
      })),
      state.selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const x = cameraScale(baseX, camera, 'x');
    const y = cameraScale(baseY, camera, 'y');
    chart.camera = camera;
    const color = colorScale(domainRows, enc.color, d3);
    const key = linePointKeyAccessor(spec, enc.x?.field);
    const series = connectedLineStretches(
      plottedRows,
      lineageRows,
      state.seriesField,
      key,
      state.selection,
      state.connect
    );
    const line = d3
      .line()
      .x((d) => position(x, d[enc.x.field]))
      .y((d) => position(y, d[enc.y.field]))
      .curve(d3Curve(spec.curve, d3));
    const pointLine = d3
      .line()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3Curve(spec.curve, d3));
    const pathFrame = (entry) => ({
      path: line(entry.rows) || '',
      curve: spec.curve || 'curveLinear',
      points: entry.rows.map((row, index) => ({
        key: String(key(row, index)),
        x: position(x, row[enc.x.field]),
        y: position(y, row[enc.y.field])
      }))
    });
    const previousPointFrame = chart.g.selectAll('circle.vd-line-point').nodes().map((node) => ({
      key: String(node.getAttribute('data-key')),
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    }));
    const targetPointFrame = plottedRows.map((row, index) => ({
      key: String(key(row, index)),
      x: position(x, row[enc.x.field]),
      y: position(y, row[enc.y.field])
    }));
    const targetPoint = (row, index) => ({
      x: position(x, row[enc.x.field]),
      y: position(y, row[enc.y.field])
    });
    const pointRadius = cameraSize(authoredPointRadius, camera);
    const lineWidth = cameraSize(spec.strokeWidth || themeValue('--vd-line-width', 3), camera);
    const lineIsSplit = state.detailStage === 'segments';
    const visiblePointRadius = lineIsSplit ? 0 : pointRadius;
    const pointOpacity = (row) => lineSelectionOpacity(row, state.highlight, themeValue('--vd-dim-opacity', 0.22));
    const visiblePointOpacity = (row) => lineIsSplit ? 0 : pointOpacity(row);
    const seriesOpacity = (entry) => entry.rows.length
      ? Math.max(...entry.rows.map(pointOpacity))
      : 1;

    fadeNonLineShapes(chart);
    this.setCartesianState(chart, enc, { x, y, color }, {
      x: (d) => position(x, d[enc.x.field]),
      y: (d) => position(y, d[enc.y.field])
    });
    drawLineAxes(chart, x, y, enc, d3, this.deps, { duration: lineDuration });

    chart.g.selectAll('path.vd-line')
      .data(series, lineSeriesKey)
      .join(
        (enter) => {
          const entered = enter
            .append('path')
            .attr('class', 'vd-line')
            .attr('data-key', lineSeriesKey)
            .attr('fill', 'none')
            .attr('stroke', (d) => color(d.rows[0]))
            .attr('stroke-width', lineWidth)
            .attr('d', (d) => line(d.rows))
            .attr('data-line-transition', 'draw-line')
            .each(function(d) { this.__visDeltaLineFrame = pathFrame(d); })
            .attr('data-line-stage', lineIsSplit ? 'segments' : 'connected');
          if (lineIsSplit) {
            applySegmentPattern(entered, d3);
            return entered.style('opacity', 0).transition(t).style('opacity', (d) => seriesOpacity(d));
          }
          return entered
            .call((selection) => drawLinePath(selection, enterTransition, d3, addsObservations ? lineDuration : null))
            // Path drawing owns dash offset only. Selection owns opacity and is
            // applied last so a fresh endpoint cannot reset a dimmed series.
            .style('opacity', (d) => seriesOpacity(d));
        },
        (update) => {
          const wasSplit = update.nodes().some((node) => node.getAttribute('data-line-stage') === 'segments');
          const prepared = update
            .attr('data-key', lineSeriesKey)
            .attr('data-line-stage', lineIsSplit ? 'segments' : 'connected');
          if (lineIsSplit) applySegmentPattern(prepared, d3);
          else if (!wasSplit) prepared.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
          const moving = prepared
            .transition(t)
            .duration(scaleDuration)
            .style('opacity', (d) => seriesOpacity(d))
            .attr('stroke', (d) => color(d.rows[0]))
            .attr('stroke-width', lineWidth)
            .attrTween('d', function(d) {
              const targetFrame = pathFrame(d);
              const match = matchLinePathFrames(
                this,
                this.__visDeltaLineFrame,
                targetFrame,
                (points) => pointLine(points) || ''
              );
              this.__visDeltaLineFrame = targetFrame;
              this.setAttribute('data-line-transition', match.strategy);
              return match.interpolate;
            });
          if (wasSplit && !lineIsSplit) connectSegmentPattern(moving, d3);
          return moving;
        },
        (exit) => exit
          .attr('data-line-transition', 'remove-line')
          .attr('stroke-dasharray', null)
          .attr('stroke-dashoffset', null)
          .transition(exitTransition)
          .duration(chart.transition.exitFirst ? chart.transition.exitDuration : lineDuration)
          // During a filter restore, the disconnected source pieces stay put
          // while the missing connection is drawn over them. The clean target
          // frame removes these duplicate pieces at progress 1.
          .style('opacity', addsObservations ? 1 : 0)
          .remove()
      );

    chart.g.selectAll('circle.vd-line-point')
      .data(plottedRows, key)
      .join(
        (enter) => enter
          .append('circle')
          .attr('class', 'vd-line-point')
          .attr('data-key', (d, i) => key(d, i))
          .attr('cx', (d, i) => targetPoint(d, i).x)
          .attr('cy', (d, i) => targetPoint(d, i).y)
          .attr('r', 0)
          .attr('data-scroll-radius', pointRadius)
          .attr('fill', (d) => color(d))
          .attr('stroke', themeValue('--vd-mark-stroke', 'white'))
          .attr('stroke-width', cameraSize(themeValue('--vd-point-stroke-width', 1.5), camera))
          .call(bindTooltip, spec, tooltip)
          .transition(enterTransition)
          .delay((d, i) => addedKeys.has(String(key(d, i)))
            ? (chart.transition.enterDelay || 0) + pointStart
            : (chart.transition.enterDelay || 0) + 260 + staggerDelay(spec, d, i))
          .duration((d, i) => addedKeys.has(String(key(d, i))) ? pointDuration : lineDuration)
          .style('opacity', (d) => visiblePointOpacity(d))
          .attr('cx', (d, i) => targetPoint(d, i).x)
          .attr('cy', (d, i) => targetPoint(d, i).y)
          .attr('r', visiblePointRadius),
        (update) => update
          .attr('data-key', (d, i) => key(d, i))
          .call(bindTooltip, spec, tooltip)
          .transition(t)
          .duration(scaleDuration)
          .style('opacity', (d) => visiblePointOpacity(d))
          .attr('cx', (d) => position(x, d[enc.x.field]))
          .attr('cy', (d) => position(y, d[enc.y.field]))
          .attr('fill', (d) => color(d))
          .attr('stroke-width', cameraSize(themeValue('--vd-point-stroke-width', 1.5), camera))
          .attr('data-scroll-radius', pointRadius)
          .attr('r', visiblePointRadius),
        (exit) => exit
          .transition(exitTransition)
          .duration((d, i) => chart.transition.exitFirst
            ? chart.transition.exitDuration
            : (removedKeys.has(String(key(d, i))) ? pointDuration : lineDuration))
          .style('opacity', function(d, i) {
            return removedKeys.has(String(key(d, i)))
              ? this.style.opacity || 1
              : 0;
          })
          .attr('r', 0)
          .remove()
      );

    drawLegend(chart, rows, enc.color, d3);
  }
}

export function lineSelectionOpacity(row, selection, dimOpacity = 0.22) {
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(row?.__row || row, selection)
    ? 1
    : Number(selection.opacity ?? dimOpacity);
}

function drawLinePath(selection, transition, d3, duration = null) {
  selection.each(function(d) {
    const path = d3.select(this);
    const total = this.getTotalLength();
    const drawing = path
      .attr('stroke-dasharray', `${total} ${total}`)
      .attr('stroke-dashoffset', total)
      .transition(transition);
    if (Number.isFinite(duration)) drawing.duration(duration);
    drawing
      .attr('stroke-dashoffset', 0)
      .on('end', function() {
        d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      });
  });
}

/** Give each series alternating ownership of short pieces of the parent line. */
function applySegmentPattern(selection, d3) {
  const count = Math.max(1, selection.size());
  selection.each(function(d, index) {
    const length = Math.max(1, this.getTotalLength());
    const pieces = Math.max(4, (d.rows?.length || 2) - 1);
    const piece = length / pieces / count;
    d3.select(this)
      .attr('stroke-dasharray', `${piece} ${piece * (count - 1)}`)
      .attr('stroke-dashoffset', -index * piece);
  });
}

/** Join the already-positioned pieces; geometry does not move in this step. */
function connectSegmentPattern(transition, d3) {
  transition
    .attr('stroke-dasharray', function() {
      const length = Math.max(1, this.getTotalLength());
      return `${length} 0`;
    })
    .attr('stroke-dashoffset', 0)
    .on('end.line-connect', function() {
      d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
    });
}
