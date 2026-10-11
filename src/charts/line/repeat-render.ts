import { specObjectKey } from '../../spec-meta.js';
import { select } from 'd3-selection';
import { linePointKeyAccessor } from './keys.js';
import { createFacetPlugin, facetGroups } from '../facet.js';
import { createSceneTransitionProgress } from '../../transition-progress.js';
import { createLineRenderer } from './render.js';
import { lineSeriesKey, lineState } from './state.js';
import type { ChartPresentation } from '../style.js';
import type { ChartPlugin, ChartRuntime, ChartType, Renderer } from '../../types/index.js';
import type { LineViewState } from './authoring.js';

/** Line owns the shared-frame to panel-frame bridge; every child keeps real axes. */
export function createRepeatedLineRenderer(runtime: ChartRuntime, presentation: ChartPresentation, flat: Renderer<LineViewState>, resolvePlan: ChartType<LineViewState>['resolveTransitionPlan']): Renderer<LineViewState> {
  let seed = false;
  let stage = false;
  const child: ChartPlugin = { key: 'line', scenes: [], createChartType: childRuntime => ({
    key: 'line', scenes: [], resolveTransitionPlan: (from, to) => resolvePlan(from as LineViewState | null, to as LineViewState | null), renderer: createLineRenderer(childRuntime, presentation) as Renderer<any>,
    prepareSpec: spec => spec,
    defaultMargin: (spec, viewport) => viewport ? runtime.layoutMargins(spec.encoding ?? {}, viewport, presentation.plot) : presentation.plot.margin
  }) };
  const facet = createFacetPlugin('line', 'line', child, {
    panelLayout: (chart, count) => seed ? Array.from({ length: count }, () => ({
      x: -chart.margin.left, y: -chart.margin.top - 26,
      width: chart.width, height: chart.height + 26
    })) : undefined,
    stageLayout: () => stage,
    domainRows: chart => chart.domainRows
  }).createChartType(runtime).renderer;
  return (chart, rows, spec, tooltip) => {
    const previous = chart.scene.previousSpec as LineViewState | null;
    if (!previous || Boolean(previous.encoding?.facet) === Boolean(spec.encoding?.facet)) {
      if (spec.encoding?.facet) { chart.g.attr('clip-path', null); facet(chart, rows, spec, tooltip); }
      else flat(chart, rows, spec, tooltip);
      return;
    }
    // Canonical direction is ordinary -> repeated; reverse samples this route backward.
    if (!spec.encoding?.facet?.field) throw new Error('Line repeat bridge requires its canonical expansion direction.');
    const field = spec.encoding.facet.field;
    if (lineSeriesKey(lineState(previous, previous.encoding)) !== field || lineSeriesKey(lineState(spec, spec.encoding)) !== field) throw new Error('Line repeat bridge requires repeating the existing breakdown series field.');
    for (const axis of ['x', 'y'] as const) {
      if (JSON.stringify(previous.encoding?.[axis]) !== JSON.stringify(spec.encoding?.[axis])) throw new Error('Line repeat bridge keeps x/y bindings and declared domains unchanged; use separate sequence legs.');
    }
    facetGroups(rows, field);
    if (JSON.stringify(previous.data) !== JSON.stringify(spec.data) || JSON.stringify(previous.transform) !== JSON.stringify(spec.transform) || JSON.stringify(specObjectKey(previous)) !== JSON.stringify(specObjectKey(spec))) throw new Error('Line repeat bridge requires unchanged observations and series membership.');
    const observationKey = linePointKeyAccessor(previous, previous.encoding?.x?.field);
    if (new Set(rows.map(observationKey)).size !== rows.length) throw new Error('Line repeat bridge requires globally unique observation keys.');
    chart.g.selectAll('*').remove();
    chart.g.attr('clip-path', null);
    const guideRoots = [chart.scene.grid, chart.scene.xAxis, chart.scene.yAxis, chart.scene.legend];
    const oldLegend = chart.scene.legend.node()!.cloneNode(true) as Element;
    guideRoots.forEach(group => group.node()!.replaceChildren());
    const host = chart.scene.svg.node()! as SVGSVGElement & { __visDeltaScene?: object };
    const saved = host.__visDeltaScene;
    const sink = {};
    const sharedSpec: LineViewState = { ...previous, margin: { ...chart.margin }, encoding: { ...previous.encoding, facet: spec.encoding.facet }, facetLayout: { ...spec.facetLayout, scales: 'shared' } };
    seed = true;
    host.__visDeltaScene = sink;
    try {
      facet({ ...chart, scene: { ...chart.scene, previousSpec: null } }, rows, sharedSpec, tooltip);
      const endpoint = createSceneTransitionProgress(sink); endpoint.progress(1); endpoint.destroy({ finish: true });
    } finally {
      seed = false;
      if (saved) host.__visDeltaScene = saved; else delete host.__visDeltaScene;
    }
    const panels = chart.g.selectAll<SVGGElement, unknown>('.vd-facet-panel');
    panels.select('.vd-facet-title').style('opacity', 0);
    // Coincident source guides have one visible owner; each separated panel then owns its guides.
    panels.each(function(_, index) {
      const parts = this.querySelectorAll<SVGElement>('.vd-facet-grid, .vd-facet-x-axis, .vd-facet-y-axis');
      parts.forEach(node => node.style.opacity = index === 0 ? '1' : '0');
    });
    stage = true;
    try { facet({ ...chart, scene: { ...chart.scene, previousSpec: sharedSpec } }, rows, spec, tooltip); }
    finally { stage = false; }
    runtime.motion(panels.select('.vd-facet-title'), chart.transition.base).style('opacity', 1);
    panels.each(function(_, index) {
      if (!index) return;
      const parts = this.querySelectorAll<SVGElement>('.vd-facet-grid, .vd-facet-x-axis, .vd-facet-y-axis');
      runtime.motion(select(this), { ...chart.transition.base, ease: t => t }).tween('line-repeat-guides', () => t => {
        parts.forEach(node => node.style.opacity = t === 0 ? '0' : '1');
      });
    });
    // Keep the ordinary chart's legend until panels identify their series.
    chart.scene.legend.node()!.append(...Array.from(oldLegend.childNodes));
    runtime.motion(chart.scene.legend, chart.transition.base).style('opacity', 0);
  };
}
