import { facetDefaultHeight, facetColumns } from './facet-layout.js';
import { select } from 'd3-selection';
import { defineChartType } from './plugin.js';
import { channelDomain } from '../toolkit/scales.js';
import { transitionAxisLabel, timedTransition } from '../runtime/axis-motion.js';
import { placeEdgeXLabel, placeEdgeYLabel, placeYLabel, xLabelSideY } from '../runtime/axis-layout.js';
import { validateFacetLayout } from './facet-layout.js';
import { canonicalFacetPair, panelAxisOrder, panelMotionFrame, containerAxisOrder } from './facet-motion.js';
import type { PanelRect } from './facet-motion.js';
import { captureDomFrame } from '../runtime/dom-frame.js';
import { createSceneTransitionProgress } from '../transition-progress.js';
import type { ChartRuntime } from '../runtime/chart-runtime.js';
import type { FacetedViewState } from '../facet.js';
import type { ChartContext, ChartPlugin, ChartSceneContext, ChartType, DataRow, ViewSpec } from '../types/index.js';

export function facetGroups(rows: readonly DataRow[], field: string): { key: string; label: string; rows: DataRow[] }[] {
  const groups = new Map<string, { key: string; label: string; rows: DataRow[] }>();
  for (const row of rows) {
    const value = row[field];
    if (value == null || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Facet field "${field}" requires finite scalar values in every transformed row.`);
    const key = JSON.stringify([typeof value, value]);
    if (!groups.has(key)) groups.set(key, { key, label: String(value), rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()];
}

/** Chart-owned bridges may seed the compositor with an existing shared frame. */
export interface FacetRenderBridge {
  panelLayout?: (chart: ChartContext, count: number) => PanelRect[] | undefined;
  stageLayout?: () => boolean;
  domainRows?: (chart: ChartContext) => DataRow[] | undefined;
}
export function createFacetPlugin(key: string, mark: string, childPlugin: ChartPlugin, bridge: FacetRenderBridge = {}): ChartPlugin<FacetedViewState> {
  function childSpec(spec: FacetedViewState): ViewSpec {
    const { facetLayout, ...rest } = spec;
    const { facet, ...encoding } = rest.encoding ?? {};
    return { ...rest, mark, encoding };
  }
  let inspect: ChartType['warnings'];
  const plugin = defineChartType<FacetedViewState>({
    key, scenes: [],
    defaultHeight: facetDefaultHeight,
    layoutChannels: spec => ({ x: spec.encoding?.x, y: spec.encoding?.y }),
    presentation: { plot: { grid: 'none', edgeTitles: true } },
    transition: { canonicalPair: (from, to) => from.encoding?.facet?.field === to.encoding?.facet?.field && JSON.stringify(from.facetLayout) !== JSON.stringify(to.facetLayout) ? canonicalFacetPair(from, to) : { from, to, reverse: false } },
    prepareSpec(spec) {
      validateFacetLayout(spec.facetLayout ?? {});
      if (!spec.encoding?.facet?.field) throw new Error('Small multiples requires a facet binding.');
      return spec;
    },
    warnings(spec, rows) {
      if (!inspect) return [];
      return facetGroups(rows, spec.encoding!.facet!.field!).flatMap(group =>
        inspect!(childSpec(spec), group.rows).map(hint => ({ ...hint, message: `${group.label}: ${hint.message}` }))
      );
    },
    createRenderer(runtime) {
      const panelStates = new WeakMap<SVGGElement, ViewSpec>();
      const panelRects = new WeakMap<SVGGElement, PanelRect>();
      const panelContexts = new WeakMap<SVGGElement, ChartContext>();
      let outer: ChartContext;
      let panelIndex = 0;
      const childRuntime: ChartRuntime = { ...runtime,
        drawXAxis(context, scale, title, timing = context.transition.base, options = {}) {
          runtime.drawXAxis(context, scale, undefined, timing, options);
          if (panelIndex !== 0) return;
          if (!scale || !title) { timedTransition(outer.scene.xLabel, timing, options.duration).style('opacity', 0).text(''); return; }
          const label = transitionAxisLabel(outer.scene.xLabel, title, timing, options.duration);
          if (options.edgeTitleInset) placeEdgeXLabel(label, outer, options.edgeTitleInset);
          else {
            const side = options.side === 'top' ? 'top' : 'bottom';
            const offset = Math.min(runtime.themeValue('--vd-axis-label-offset', 48), outer.margin[side] - 4);
            label.attr('x', outer.innerWidth / 2).attr('y', xLabelSideY(outer, side, false, offset))
              .attr('text-anchor', 'middle').attr('transform', `translate(${outer.margin.left},0)`);
          }
        },
        drawYAxis(context, scale, title, timing = context.transition.base, options = {}) {
          runtime.drawYAxis(context, scale, undefined, timing, options);
          if (panelIndex !== 0) return;
          if (!scale || !title) { timedTransition(outer.scene.yLabel, timing, options.duration).style('opacity', 0).text(''); return; }
          const label = transitionAxisLabel(outer.scene.yLabel, title, timing, options.duration);
          if (options.edgeTitleInset) placeEdgeYLabel(label, outer, options.edgeTitleInset);
          else {
            const side = options.side === 'right' ? 'right' : 'left';
            const offset = Math.min(runtime.themeValue('--vd-axis-label-offset', 48), outer.margin[side] - runtime.themeValue('--vd-axis-title-font-size', 11) * 1.2);
            placeYLabel(label, outer, side, offset, false);
          }
        }
      };
      const childType = childPlugin.createChartType(childRuntime);
      inspect = childType.warnings;
      return (chart, rows, spec, tooltip) => {
        outer = chart;
        const groups = facetGroups(rows, spec.encoding!.facet!.field!);
        const layout = spec.facetLayout ?? {};
        const gap = layout.gap ?? 24;
        const columns = facetColumns(layout, groups.length, chart.innerWidth);
        const countRows = Math.ceil(groups.length / columns) || 1;
        const width = Math.max(1, (chart.innerWidth - gap * (columns - 1)) / columns);
        const height = Math.max(1, (chart.innerHeight - gap * (countRows - 1)) / countRows);
        const base = childSpec(spec);
        const domainRows = bridge.domainRows?.(chart) ?? rows;
        // Share declared domains and derive categorical domains from the complete transformed data.
        const encoding = { ...base.encoding };
        for (const channel of ['x', 'y', 'color'] as const) {
          const binding = encoding[channel];
          if (binding?.field && !binding.domain && ['nominal', 'ordinal'].includes(binding.type ?? '')) encoding[channel] = { ...binding, domain: channelDomain(domainRows, binding) };
        }
        const panels = chart.g.selectAll<SVGGElement, typeof groups[number]>('g.vd-facet-panel').data(groups, d => d.key);
        const previous = chart.scene.previousSpec as ViewSpec | null;
        const rearranging = Boolean((bridge.stageLayout?.() || (previous && previous.encoding?.facet?.field === spec.encoding?.facet?.field && JSON.stringify(previous.facetLayout) !== JSON.stringify(spec.facetLayout) && panels.size() === groups.length && panels.enter().size() === 0 && panels.exit().size() === 0)));
        const destinations = bridge.panelLayout?.(chart, groups.length) ?? groups.map((_, index) => ({ x: (index % columns) * (width + gap), y: Math.floor(index / columns) * (height + gap), width, height }));
        const sources = panels.nodes().map(node => panelRects.get(node));
        const containerOrder = rearranging && sources.every(Boolean) ? containerAxisOrder(sources as PanelRect[], destinations, panelAxisOrder(spec)) : panelAxisOrder(spec);
        if (rearranging) {
          const outerFrame = chart.scene.frame as ChartSceneContext['markRoot'];
          const matrix = outerFrame.node()!.transform.baseVal.consolidate()?.matrix;
          const from = { x: matrix?.e ?? 0, y: matrix?.f ?? 0, width: 1, height: 1 };
          const to = { ...from, x: chart.margin.left, y: chart.margin.top };
          runtime.motion(outerFrame, { ...chart.transition.base, ease: t=>t }).attrTween('transform', () => t => {
            const { rect } = panelMotionFrame(from,to,containerOrder,t,chart.transition.base.ease);
            return `translate(${rect.x},${rect.y})`;
          });
        }
        runtime.motion(panels.exit(), chart.transition.exit ?? chart.transition.base).style('opacity', 0).remove();
        const merged = panels.enter().append('g').attr('class', 'vd-facet-panel').style('opacity', 0).merge(panels).attr('data-facet-key', d => d.key);
        runtime.motion(merged, chart.transition.base).style('opacity', 1);
        merged.each(function(group, index) {
          panelIndex = index;
          const panel = select(this);
          const destination = destinations[index];
          const { width, height } = destination;
          const source = panelRects.get(this);
          const staged = rearranging && source;
          if (panel.select('.vd-facet-title').empty()) {
            panel.append('rect').attr('class', 'vd-facet-bounds').attr('fill', 'none').attr('pointer-events', 'none');
            const content = panel.append('g').attr('class', 'vd-facet-content');
            content.append('text').attr('class', 'vd-facet-title').attr('x', 8).attr('y', 18).attr('fill', 'currentColor').style('font-size', '13px').style('font-weight', '600');
            const plot = content.append('g').attr('class', 'vd-facet-plot').attr('transform', 'translate(0,26)');
            const frame = plot.append('g').attr('class', 'vd-facet-frame');
            frame.append('g').attr('class', 'vd-facet-grid vd-grid');
            frame.append('g').attr('class', 'vd-facet-marks');
            for (const name of ['x-axis', 'y-axis', 'legend']) plot.append('g').attr('class', `vd-facet-${name} ${name === 'legend' ? 'vd-legend' : 'vd-axis'}`);
            plot.append('text').attr('class', 'vd-facet-x-label');
            plot.append('text').attr('class', 'vd-facet-y-label');
          }
          panel.select('.vd-facet-title').text(group.label);
          const plot = panel.select<SVGGElement>('g.vd-facet-plot');
          const plotHeight = Math.max(1, height - 26);
          const panelEncoding = { ...encoding };
          // The panel title already names this category; use its common-domain color
          // without repeating the entire category legend inside every panel.
          if (panelEncoding.color?.field === spec.encoding!.facet!.field && group.rows.length) {
            panelEncoding.color = { value: runtime.colorScale(domainRows, panelEncoding.color)(group.rows[0]) };
          }
          const prepared = childType.prepareSpec({ ...base, encoding: panelEncoding });
          // Shared titles and the panel caption already have their own space.
          // Ask the child to budget only its local ticks and legend.
          const localChannels = { ...prepared.encoding };
          for (const channel of ['x', 'y'] as const) {
            if (localChannels[channel]) localChannels[channel] = { ...localChannels[channel], title: '' };
          }
          const font = runtime.themeValue('--vd-axis-font-size', 10);
          const margin = { top: font * 1.2, right: font * 1.2, bottom: font * 3.2, left: font * 3.2,
            ...childType.defaultMargin({ ...prepared, encoding: localChannels }, { width, height: plotHeight, rows: group.rows }), ...prepared.margin };
          const scene = {
            ...chart.scene, previousSpec: panelStates.get(this) ?? null, clipIdentity: chart.scene.clipIdentity * 10000 + index + 1,
            svg: plot as unknown as ChartSceneContext['svg'],
            grid: plot.select('g.vd-facet-grid'), markRoot: plot.select('g.vd-facet-marks'),
            xAxis: plot.select('g.vd-facet-x-axis'), yAxis: plot.select('g.vd-facet-y-axis'),
            xLabel: plot.select('text.vd-facet-x-label'), yLabel: plot.select('text.vd-facet-y-label'),
            legend: plot.select('g.vd-facet-legend'), markLayers: new Map()
          } as ChartSceneContext;
          const context: ChartContext = { g: scene.markRoot, scene, transition: chart.transition, width, height: plotHeight, margin,
            innerWidth: Math.max(1, width - margin.left - margin.right), innerHeight: Math.max(1, plotHeight - margin.top - margin.bottom),
            sourceRows: group.rows, sharedDomains: layout.scales !== 'independent', domainRows: layout.scales === 'independent' ? group.rows : domainRows };
          context.transitionPlan = childType.resolveTransitionPlan?.(
            scene.previousSpec ? childType.prepareSpec(scene.previousSpec as ViewSpec) : null, prepared
          );
          const drawChild = (local: ChartContext, localRows: DataRow[], localSpec: ViewSpec, recorded: boolean) => {
            const sink = {};
            const host = this as SVGGElement & { __visDeltaScene?: object };
            const savedHostScene = host.__visDeltaScene;
            const sharedHost = chart.scene.svg.node()! as SVGSVGElement & { __visDeltaScene?: object };
            const savedSharedScene = sharedHost.__visDeltaScene;
            const clips = new Map(Array.from(plot.node()!.querySelectorAll<SVGRectElement>('clipPath rect'), node => [node.parentElement!.id, Object.fromEntries(['x','y','width','height'].map(key=>[key,node.getAttribute(key)]))]));
            if (recorded) {
              host.__visDeltaScene = sink;
              if (index === 0) sharedHost.__visDeltaScene = sink;
            }
            try {
              local.transitionPlan = childType.resolveTransitionPlan(local.scene.previousSpec as ViewSpec | null, localSpec);
              runtime.motion(plot.select('.vd-facet-frame'), chart.transition.base).attr('transform', `translate(${local.margin.left},${local.margin.top})`);
              childType.renderer(local, localRows, localSpec, tooltip);
              if (recorded) plot.selectAll<SVGRectElement, unknown>('clipPath rect').each(function() {
                const old = clips.get(this.parentElement!.id); if (!old) return;
                const node = select(this); const target = Object.fromEntries(['x','y','width','height'].map(key=>[key,node.attr(key)]));
                for (const key of ['x','y','width','height']) node.attr(key, old[key]);
                const track = runtime.motion(node, chart.transition.base); for (const key of ['x','y','width','height']) track.attr(key,target[key]);
              });
            } finally {
              if (recorded) {
                if (savedHostScene) host.__visDeltaScene = savedHostScene; else delete host.__visDeltaScene;
                if (index === 0) {
                  if (savedSharedScene) sharedHost.__visDeltaScene = savedSharedScene; else delete sharedHost.__visDeltaScene;
                }
              }
            }
            if (!recorded) return null;
            const frames = createSceneTransitionProgress(sink).compile();
            frames.progress(0);
            const topology = captureDomFrame(plot.node()!);
            return { progress(value: number, direction = 1) { topology.restore(); frames.progress(value, direction); } };
          };
          const bounds = panel.select('.vd-facet-bounds');
          panel.select('.vd-facet-content').attr('transform', null);
          if (staged) {
            const oldContext = panelContexts.get(this)!;
            const sourceSpec = panelStates.get(this)!;
            const midpoint = containerOrder === 'x' ? { ...source, width: destination.width } : { ...source, height: destination.height };
            const resized = (rect: PanelRect): ChartContext => ({
              ...context, width: rect.width, height: Math.max(1, rect.height - 26), margin: oldContext.margin,
              innerWidth: Math.max(1, rect.width - oldContext.margin.left - oldContext.margin.right),
              innerHeight: Math.max(1, rect.height - 26 - oldContext.margin.top - oldContext.margin.bottom),
              domainRows: oldContext.domainRows, sourceRows: oldContext.sourceRows, sharedDomains: oldContext.sharedDomains,
              scene: { ...scene, previousSpec: sourceSpec }
            });
            // Resize through actual child geometry, never through an SVG group scale.
            const firstFrames = drawChild(resized(midpoint), oldContext.sourceRows!, sourceSpec, true)!;
            firstFrames.progress(1);
            const secondFrames = drawChild(resized(destination), oldContext.sourceRows!, sourceSpec, true)!;
            secondFrames.progress(1);
            const childFrames = drawChild({ ...context, scene: { ...scene, previousSpec: sourceSpec } }, group.rows, prepared, true)!;
            let lastProgress = 0;
            let childDirection = 1;
            runtime.motion(panel, { ...chart.transition.base, ease: t=>t }).tween('facet-container', () => t => {
              const frame = panelMotionFrame(source, destination, containerOrder, t, chart.transition.base.ease);
              panel.attr('transform', `translate(${frame.rect.x},${frame.rect.y})`);
              bounds.attr('width',frame.rect.width).attr('height',frame.rect.height);
              if (t !== lastProgress) childDirection = t > lastProgress ? 1 : -1;
              lastProgress = t;
              if (t < .25) firstFrames.progress(t * 4, childDirection);
              else if (t < .5) secondFrames.progress((t - .25) * 4, childDirection);
              else childFrames.progress(frame.content, childDirection);
            });
          } else {
            drawChild(context, group.rows, prepared, false);
            runtime.motion(panel,chart.transition.base).attr('transform',`translate(${destination.x},${destination.y})`);
            bounds.attr('width',width).attr('height',height);
          }
          panelContexts.set(this, context);
          panelStates.set(this, prepared);
          panelRects.set(this, destination);
        });
      };
    }
  });
  return { ...plugin, createChartType(runtime) {
    const chart = plugin.createChartType(runtime);
    return { ...chart, transitionEvaluation: childPlugin.createChartType(runtime).transitionEvaluation ?? 'reconstruct' };
  } };
}
