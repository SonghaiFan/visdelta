// @ts-nocheck — D3 rendering pattern; typed via deps injection
import { matchesSelection, viewHighlight } from '../../focus.js';
import { DIVIDER_DRAW_PROGRESS } from '../detail-timing.js';

export function createBarRenderKit(deps) {
  const { easeFor, staggerDelay, themeValue } = deps;

  function steps(chart, rendererOrientation, d3) {
    const plan = chart.transitionPlan;
    if (!plan?.steps?.length) return null;
    if (plan.target?.renderer !== rendererOrientation) return null;
    const ordered = Array.isArray(plan.steps)
      ? plan.steps.filter((step) =>
          (step.part === 'x' || step.part === 'y') &&
          step.changes.includes('marks'))
      : [];
    if (!ordered.length) return null;
    const timing = plan.timing || {};
    return {
      ordered,
      duration: chart.transition.scaleDuration || timing.duration || chart.transition.duration,
      startDelay: chart.transition.exitDuration || 0,
      ease: easeFor(timing.ease || chart.transition.ease, d3),
      stagger: chart.camera?.bounds ? null : timing.stagger,
      transitionName: chart.seekable ? chart.seekTransitionName : null
    };
  }

  function applyMarkSteps(selection, steps, spec, markGeometry, baseAttrs) {
    let current = null;
    steps.ordered.forEach((step, index) => {
      const applyMarks = markGeometry[step.part];
      if (!applyMarks) return;
      current = index === 0
        ? selection
            .transition(steps.transitionName)
            .duration(steps.duration)
            .ease(steps.ease)
            .delay((d, i) => steps.startDelay + staggerDelay(spec, d, i, steps.stagger))
        : current.transition().duration(steps.duration).ease(steps.ease);
      if (index === 0 && baseAttrs) baseAttrs(current);
      applyMarks(current);
    });
    return current || selection;
  }

  function axisTransition(steps, part, d3) {
    if (!steps?.ordered?.length) return null;
    const index = steps.ordered.findIndex((step) =>
      step.part === part && step.changes.includes('axis'));
    if (index < 0) return null;
      return d3.transition(steps.transitionName)
        .duration(steps.duration)
        .ease(steps.ease)
        .delay(steps.startDelay + index * steps.duration);
  }

  return {
    applyMarkSteps,
    axisTransition,
    baselineEnterPlan,
    baselineExitPlan,
    barSelectionOpacity,
    collapseLineage,
    renderBarJoin,
    renderBarSeams,
    setRectGeometry,
    splitLineage,
    sourceBaselineExit,
    steps
  };

  function renderBarJoin(options) {
    const {
      chart, rows, spec, tooltip, d3, bindTooltip, key, category, className, orientation,
      rx = 3, fill, geometry,
      startGeometry = geometry?.start,
      targetGeometry = geometry?.target,
      steps,
      markGeometry = geometry ? { x: geometry.applyX, y: geometry.applyY } : undefined,
      applyGeometry = geometry?.apply,
      exitGeometry = geometry?.exit
    } = options;
    // A focus change is one rigid camera move. Per-mark staggering would bend
    // the coordinate system: bars would temporarily leave the shared axis
    // baseline even though neither their data nor identity changed.
    const delay = chart.camera?.bounds
      ? () => 0
      : (d, i) => staggerDelay(spec, d, i);

    chart.g.selectAll('rect.vd-bar')
      .data(rows, key)
      .join(
        (enter) => enter
          .append('rect')
          .attr('class', className)
          .attr('data-orientation', orientation)
          .call(options.applyIdentity, spec, key, category)
          .attr('rx', rx)
          .attr('fill', fill)
          .style('opacity', 0)
          .call(bindTooltip, spec, tooltip)
          .each(function(d) { setRectGeometry(d3.select(this), startGeometry(d)); })
          .transition(chart.transition.enter || chart.transition.base)
          .delay((d, i) => (chart.transition.enterDelay || 0) + delay(d, i))
          .style('opacity', (d) => barSelectionOpacity(d, spec, themeValue('--vd-dim-opacity', 0.22)))
          .attr('x', targetGeometry.x)
          .attr('y', targetGeometry.y)
          .attr('width', targetGeometry.width)
          .attr('height', targetGeometry.height),
        (update) => {
          const prepared = update
            .attr('class', className)
            .attr('data-orientation', orientation)
            .call(options.applyIdentity, spec, key, category)
            .call(bindTooltip, spec, tooltip);
          if (steps) {
            return applyMarkSteps(prepared, steps, spec, markGeometry,
              (selection) => selection.style('opacity', (d) => barSelectionOpacity(d, spec, themeValue('--vd-dim-opacity', 0.22))).attr('fill', fill));
          }
          return prepared
            .transition(chart.transition.base)
            .delay((d, i) => (chart.transition.exitDuration || 0) + delay(d, i))
            .style('opacity', (d) => barSelectionOpacity(d, spec, themeValue('--vd-dim-opacity', 0.22)))
            .call(applyGeometry)
            .attr('fill', fill);
        },
        (exit) => {
          // A filtered/deleted bar leaves in the coordinate system where it
          // was read. Only after it is gone may the shared scale move.
          const leaving = exit.transition(chart.transition.exit || chart.transition.base).style('opacity', 0);
          if (exitGeometry && !chart.transition.exitFirst) exitGeometry(leaving);
          return leaving.remove();
        }
      );
  }

  function renderBarSeams({ chart, path = '', startPath = path, draw = false }) {
    const seams = chart.g.selectAll('path.vd-bar-seam').data(path ? [path] : []);
    seams.exit().transition(chart.transition.base).style('opacity', 0).remove();
    const seam = seams.enter().append('path')
      .attr('class', 'vd-bar-seam')
      .style('opacity', 0)
      .attr('d', startPath)
      .merge(seams);
    if (!draw) return;
    const drawDuration = Math.max(1, chart.transition.duration * DIVIDER_DRAW_PROGRESS);
    seam
      .transition(chart.transition.base)
      .duration(drawDuration)
      .style('opacity', 1)
      .attr('d', (d) => d)
      .transition()
      .duration(Math.max(1, chart.transition.duration - drawDuration))
      .style('opacity', 0)
      .remove();
  }
}

export function setRectGeometry(selection, geometry) {
  const rect = geometry || {};
  selection
    .attr('x', rect.x)
    .attr('y', rect.y)
    .attr('width', Math.max(0, rect.width))
    .attr('height', Math.max(0, rect.height));
}

export function collapseLineage(chart, parentField) {
  const enterPlan = chart.transitionPlan?.enter;
  if (enterPlan?.mode !== 'parent-child-lineage' || enterPlan.from !== 'child-bounds' || !parentField) return null;
  const bounds = new Map();
  chart.g.selectAll('rect.vd-bar').each(function() {
    const node = this;
    const parent = node.dataset.category || parentFromChildKey(node.dataset.key);
    const box = rectGeometry(node);
    if (!parent || !box) return;
    const current = bounds.get(parent);
    bounds.set(parent, current ? unionRect(current, box) : box);
  });
  if (!bounds.size) return null;
  return { start(d) { return bounds.get(String(d[parentField])) || null; } };
}

export function splitLineage(chart) {
  const enterPlan = chart.transitionPlan?.enter;
  if (enterPlan?.mode !== 'parent-child-lineage' || enterPlan.from !== 'parent-bounds' || !enterPlan.parentKey) return null;
  const bounds = new Map();
  chart.g.selectAll('rect.vd-bar').each(function() {
    const node = this;
    const parent = node.dataset.category || node.dataset.key;
    const box = rectGeometry(node);
    if (parent && box) bounds.set(parent, box);
  });
  return {
    start(d) { return bounds.get(String(d[enterPlan.parentKey])) || null; }
  };
}

export function baselineEnterPlan(chart, from) {
  const enterPlan = chart.transitionPlan?.enter;
  return enterPlan?.mode === 'baseline' && enterPlan.from === from ? enterPlan : null;
}

export function baselineExitPlan(chart, to) {
  const exitPlan = chart.transitionPlan?.exit;
  return exitPlan?.mode === 'baseline' && exitPlan.to === to ? exitPlan : null;
}

export function sourceBaselineExit(selection, { horizontal = false, plan = null, value = null } = {}) {
  return selection
    .attr('x', function(d) {
      const rect = currentRect(this);
      const sourceHorizontal = sourceRectIsHorizontal(this, plan, horizontal);
      if (!sourceHorizontal) return rect.x;
      return sourceValue(d, value) < 0 ? rect.x + rect.width : rect.x;
    })
    .attr('width', function() { return sourceRectIsHorizontal(this, plan, horizontal) ? 0 : currentRect(this).width; })
    .attr('y', function(d) {
      const rect = currentRect(this);
      const sourceHorizontal = sourceRectIsHorizontal(this, plan, horizontal);
      if (sourceHorizontal) return rect.y;
      return sourceValue(d, value) < 0 ? rect.y : rect.y + rect.height;
    })
    .attr('height', function() { return sourceRectIsHorizontal(this, plan, horizontal) ? currentRect(this).height : 0; });
}

function currentRect(node) {
  return {
    x: Number(node.getAttribute('x')) || 0,
    y: Number(node.getAttribute('y')) || 0,
    width: Number(node.getAttribute('width')) || 0,
    height: Number(node.getAttribute('height')) || 0
  };
}

function sourceRectIsHorizontal(node, plan, fallbackHorizontal) {
  const orientation = String(node.getAttribute('data-orientation') || plan?.sourceOrientation || '');
  if (orientation.includes('horizontal')) return true;
  if (orientation.includes('vertical')) return false;
  return fallbackHorizontal;
}

function sourceValue(d, value) {
  if (typeof value !== 'function') return 1;
  const resolved = Number(value(d));
  return Number.isFinite(resolved) ? resolved : 1;
}

export function barSelectionOpacity(row, spec = {}, dimOpacity = 0.22) {
  const selection = viewHighlight(spec);
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(row?.__row || row, selection) ? 1 : Number(selection.opacity ?? dimOpacity);
}

function rectGeometry(node) {
  const x = rectNumber(node, 'x'), y = rectNumber(node, 'y');
  const width = rectNumber(node, 'width'), height = rectNumber(node, 'height');
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function rectNumber(node, attr) {
  const value = Number(node.getAttribute(attr));
  return Number.isFinite(value) ? value : NaN;
}

function unionRect(a, b) {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function parentFromChildKey(key = '') {
  return String(key).includes('|') ? String(key).split('|')[0] : null;
}
