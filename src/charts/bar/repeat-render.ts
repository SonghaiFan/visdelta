import { select } from 'd3-selection';
import { createFacetPlugin } from '../facet.js';
import { createSceneTransitionProgress } from '../../transition-progress.js';
import { createBarRenderer } from './render.js';
import { barAxisStepOrder, resolveBarTransitionPlan } from './state.js';
import { semanticBarState } from './semantic.js';
import { cloneSpec } from '../../runtime/utils.js';
import type { ChartPresentation } from '../style.js';
import type { ChartContext, ChartPlugin, ChartRuntime, Renderer, ViewSpec } from '../../types/index.js';
import type { FacetedViewState } from '../../facet.js';

type Rect = { key: string; x: number; y: number; width: number; height: number; fill: string | null };
function rectangles(chart: ChartContext): Rect[] {
  const root = chart.g.node()!.getCTM()!;
  return Array.from(chart.g.node()!.querySelectorAll<SVGRectElement>('rect.vd-bar'), node => {
    const matrix = root.inverse().multiply(node.getCTM()!);
    const point = new DOMPoint(+node.getAttribute('x')!, +node.getAttribute('y')!).matrixTransform(matrix);
    return { key: node.getAttribute('data-key')!, x: point.x, y: point.y,
      width: +node.getAttribute('width')! * Math.abs(matrix.a), height: +node.getAttribute('height')! * Math.abs(matrix.d), fill: node.getAttribute('fill') };
  });
}

/** Bar owns continuity between stack segments and their repeated baselines. */
export function createRepeatedBarRenderer(runtime: ChartRuntime, presentation: ChartPresentation, flat: Renderer<any>, prepare: (spec: any) => any): Renderer<any> {
  let repeatField: string | undefined;
  const child: ChartPlugin = { key: 'bar', scenes: [], createChartType: childRuntime => ({
    key: 'bar', scenes: [], renderer: createBarRenderer(childRuntime, presentation), resolveTransitionPlan: (previous, next) => resolveBarTransitionPlan(previous, next),
    prepareSpec(spec) {
      const panel = cloneSpec(spec);
      if (panel.encoding?.detail && panel.encoding.detail.field === repeatField) {
        delete panel.encoding.detail;
        // A one-component panel has simple bars. Drop the parent stack layout
        // while retaining its independently authored orientation and order.
        const state = panel.meta?.state;
        for (const controls of [state, state?.sceneState]) {
          if (!controls) continue;
          if (controls.axis) {
            delete controls.axis.layout;
            if (!Object.keys(controls.axis).length) delete controls.axis;
          }
          if (controls.detail?.segmentField === repeatField) delete controls.detail;
        }
      }
      return prepare(panel);
    },
    defaultMargin: (spec, viewport) => viewport ? runtime.layoutMargins(spec.encoding ?? {}, viewport, presentation.plot) : presentation.plot.margin
  }) };
  const facet = createFacetPlugin('bar', 'bar', child).createChartType(runtime).renderer;
  function draw(chart: ChartContext, rows: Record<string, unknown>[], spec: ViewSpec, tooltip: HTMLElement) {
    if (spec.encoding?.facet) {
      repeatField = spec.encoding.facet.field;
      chart.g.attr('clip-path', null);
      facet(chart, rows, spec as FacetedViewState, tooltip);
    } else flat(chart, rows, spec, tooltip);
  }
  return (chart, rows, spec, tooltip) => {
    const previous = chart.scene.previousSpec as ViewSpec | undefined;
    const changeMode = previous && Boolean(previous.encoding?.facet) !== Boolean(spec.encoding?.facet);
    if (!changeMode) { draw(chart, rows, spec, tooltip); return; }
    if (semanticBarState(previous).orientation !== semanticBarState(spec).orientation) throw new Error('Repeat bridge does not combine axis reorientation with panel expansion or rearrangement.');
    const source = rectangles(chart);
    if (new Set(source.map(rect => rect.key)).size !== source.length) throw new Error('Repeat bridge requires unique mark keys across panels.');
    const oldPanels = Array.from(chart.g.node()!.querySelectorAll('.vd-facet-panel'), node => {
      const clone = node.cloneNode(true) as Element; clone.querySelectorAll('.vd-facet-marks, defs').forEach(n => n.remove()); return clone;
    });
    const guides = [chart.scene.grid, chart.scene.xAxis, chart.scene.yAxis, chart.scene.legend].map(group => select(group.node()! as SVGElement));
    const oldGuides = oldPanels.length ? [] : guides.map(group => group.node()!.cloneNode(true));
    chart.g.selectAll('*').remove();
    guides.forEach(group => { group.selectAll('*').remove(); if (group.node()?.tagName === 'text') group.text(''); });
    // Finish the destination renderer in its own recorder. This obtains actual
    // plugin geometry without contributing enter/collapse tracks to the bridge.
    const host = chart.scene.svg.node()! as SVGSVGElement & { __visDeltaScene?: object };
    const saved = host.__visDeltaScene;
    const sink = {};
    host.__visDeltaScene = sink;
    try {
      draw({ ...chart, transitionPlan: {} }, rows, spec, tooltip);
      const endpoint = createSceneTransitionProgress(sink); endpoint.progress(1); endpoint.destroy({ finish: true });
    } finally { if (saved) host.__visDeltaScene = saved; else delete host.__visDeltaScene; }
    const target = rectangles(chart);
    const byKey = new Map(source.map(rect => [rect.key, rect]));
    if (target.length !== source.length || target.some(rect => !byKey.has(rect.key))) throw new Error('Repeat bridge currently requires unchanged mark membership and grain.');
    const root = chart.g.node()!.getCTM()!;
    const expanding = Boolean(spec.encoding?.facet);
    const repeated = (expanding ? spec : previous) as FacetedViewState;
    const semantic = semanticBarState(repeated);
    const firstAxis = barAxisStepOrder(semantic.axis ?? {}, semantic.orientation)[0];
    const byTargetKey = new Map(target.map(rect => [rect.key, rect]));
    chart.g.selectAll<SVGRectElement, Record<string, unknown>>('rect.vd-bar').each(function() {
      const original = byKey.get(this.getAttribute('data-key')!)!;
      const matrix = (this.parentNode as SVGGElement).getCTM()!.inverse().multiply(root);
      const destination = byTargetKey.get(original.key)!;
      const flatRect = expanding ? original : destination;
      const panelRect = expanding ? destination : original;
      // Coordinate stages move the complete x or y geometry together, exactly
      // as ordinary Bars do. Never resize width and height in one shared phase.
      const first = firstAxis === 'x'
        ? { ...flatRect, x: panelRect.x, width: panelRect.width }
        : { ...flatRect, y: panelRect.y, height: panelRect.height };
      const frames = [flatRect, first, panelRect];
      const node = select(this).attr('fill', original.fill);
      const timing = chart.transition.base;
      const track = runtime.motion(node, { ...timing, ease: t => t });
      for (const attribute of ['x', 'y', 'width', 'height'] as const) {
        track.attrTween(attribute, () => t => {
          const progress = expanding ? t : 1 - t;
          const index = Math.min(1, Math.floor(progress * 2));
          const local = timing.ease(progress * 2 - index);
          const value = frames[index][attribute] + (frames[index + 1][attribute] - frames[index][attribute]) * local;
          if (attribute === 'x') return value * matrix.a + matrix.e;
          if (attribute === 'y') return value * matrix.d + matrix.f;
          return value * Math.abs(attribute === 'width' ? matrix.a : matrix.d);
        });
      }
      runtime.motion(node, timing).attr('fill', destination.fill);
    });
    chart.g.attr('clip-path', null);
    chart.g.selectAll('.vd-facet-marks').attr('clip-path', null);
    const old = (oldPanels.length ? chart.g : chart.scene.svg).append('g').attr('class', 'vd-repeat-old-guides');
    [...oldPanels, ...oldGuides].forEach(node => {
      if (node instanceof Element) { node.removeAttribute('clip-path'); node.querySelectorAll('[clip-path]').forEach(child => child.removeAttribute('clip-path')); }
      old.node()!.appendChild(node);
    });
    runtime.motion(old, { ...chart.transition.base, duration: chart.transition.base.duration / 2 }).style('opacity', 0).remove();
    const nextGuides = chart.g.selectAll('.vd-facet-title, .vd-facet-x-axis, .vd-facet-y-axis, .vd-facet-x-label, .vd-facet-y-label');
    const guideTiming = { ...chart.transition.base, delay: chart.transition.base.delay + chart.transition.base.duration / 2, duration: chart.transition.base.duration / 2 };
    if (spec.encoding?.facet) {
      nextGuides.style('opacity', 0);
      runtime.motion(nextGuides, guideTiming).style('opacity', 1);
    } else {
      for (const group of guides) { group.style('opacity', 0); runtime.motion(group, guideTiming).style('opacity', 1); }
    }
  };
}
