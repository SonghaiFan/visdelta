import { bar, compileLineage, correspondLineage, delta, sequence } from 'visdelta';
import { sequence as selectedSequence, transition } from 'visdelta/transition';
import { delta as selectedDelta, applyDeclarationEdits, planDeclarationTransition } from 'visdelta/core';
import { bar as selectedBar, barModule } from 'visdelta/bar';
import { area as selectedArea, areaModule } from 'visdelta/area';
import { point as selectedPoint, pointModule } from 'visdelta/point';
import { line as selectedLine, lineModule } from 'visdelta/line';
import { unit as selectedUnit, unitModule } from 'visdelta/unit';
import {
  ChartState,
  defineChartModule,
  defineChartType,
  defineChartStyle,
  registerChartModule
} from 'visdelta/plugins';
import { composeCanonicalPolicies, composeIntermediatePolicies, encodingWaypoint, minimumTravelMatching, interpolatePathPoints, connectedStretches } from 'visdelta/toolkit';
import * as browser from 'visdelta/browser';
import { bandOrLinear, position, easeFor, staggerDelay } from 'visdelta/toolkit';
import type { ChartTransitionPolicy, IntermediateSpec, Renderer } from 'visdelta/plugins';

defineChartStyle({ key: 'custom-theme', plot: { margin: { left: 24 } } });
const externalScale = bandOrLinear([{ category: 'A' }], { field: 'category', type: 'nominal' }, [0, 100]);
const externalPosition: number = position(externalScale, 'A');
const externalEase: number = easeFor('linear')(0.5);
const externalDelay: number = staggerDelay({}, {}, 2, 10);
const choosePair = composeCanonicalPolicies<{ mark: string; rank: number }>(
  (from, to) => from.rank > to.rank ? { from: to, to: from, reverse: true } : null
);
choosePair({ mark: 'external', rank: 2 }, { mark: 'external', rank: 1 });
composeIntermediatePolicies<{ mark: string; rank: number }>(
  (from, to) => [{ spec: encodingWaypoint(from, to, ['angle']), scene: 'rotation' }]
)({ mark: 'external', rank: 1 }, { mark: 'external', rank: 2 });
minimumTravelMatching([{ x: 0, y: 0 }] as const, [{ x: 1, y: 1 }] as const);
interpolatePathPoints([{ x: 0, y: 0 }], [{ x: 1, y: 1 }])(0.5);
connectedStretches(['a', 'b'] as const, ['a', 'b', 'c'] as const, key => key);
defineChartType({
  key: 'external-services',
  presentation: { plot: { grid: 'none' } },
  createSpecCompiler: () => ({
    stateOrder: ['projection'], base: spec => spec,
    operations: { projection: spec => spec }
  }),
  createRenderer: runtime => (chart, _rows, _spec, tooltip) => {
    runtime.motion(chart.g, chart.transition.base).style('opacity', 1);
    runtime.tooltip.hide(tooltip);
    const frame = chart.g.node();
    if (frame) runtime.tooltip.svgPosition(frame, 0, 0);
  }
});

const waypoint: IntermediateSpec = { spec: { mark: 'custom' } };
const declarationChange = selectedDelta({ mark: 'custom', width: 10 }, { mark: 'custom', width: 20 });
applyDeclarationEdits({ mark: 'custom', width: 10 }, declarationChange.edits);
planDeclarationTransition({ mark: 'custom' }, { mark: 'custom', width: 20 }).stages.forEach(stage => {
  applyDeclarationEdits(stage.from, stage.edits);
});
const policy: ChartTransitionPolicy = {
  declarationPlanning: true,
  resolveTransitionPlan: () => ({}),
  intermediateSpecs: () => [waypoint],
  canonicalTransitionPair: (from, to) => ({ from, to, reverse: false })
};
defineChartType({
  key: 'policy-consumer', renderer() {},
  transition: {
    plan: policy.resolveTransitionPlan,
    intermediateSpecs: policy.intermediateSpecs,
    canonicalPair: policy.canonicalTransitionPair
  }
});

// A renderer receives no D3 object: plugins import the d3-* modules they use.
const rendererShape: Renderer = (chart, rows, spec, tooltip) => { void [chart, rows, spec, tooltip]; };
// @ts-expect-error There is no fifth (d3) parameter any more.
const legacyRenderer: Renderer = (chart, rows, spec, tooltip, d3) => { void [chart, rows, spec, tooltip, d3]; };
void [rendererShape, legacyRenderer];

const a = bar().data([{ id: 'row-a', key: 'A', value: 1, next: 2 }]).datumKey('id').x('key').y('value');
const b = a.y('next');
const themed = a.color('key', { scheme: 'Tableau10' });
const continuous = a.color('value', { type: 'quantitative', scheme: 'Viridis' });
void [themed, continuous];
const semanticChange = delta(a, b);
semanticChange.stateChanges[0]?.category;
selectedDelta(a, b).stateChanges[0]?.action;
const currentRows = a.rows();
currentRows[0]?.value;
const pair = await transition(a, b, { target: '#chart' });
pair.delta.stateChanges[0]?.category;
pair.progress(0.4).play({ duration: 300 }).pause().resize();
pair.destroy();
const journey = await sequence([a, b, a], { target: '#chart' });
journey.progress(1.5).play({ duration: 300 }).pause().resize();
journey.destroy();
await selectedSequence([a, b], { target: '#chart' });
// A chart that stays on screen is a transition held at an endpoint; the
// application owns the current state.
const held = await transition(a, a, { target: '#chart' });
held.progress(1);
held.destroy();
delta(a, b).hasDelta('encoding.y');
const trackedA = compileLineage([{ id: 'A', group: 'x', value: 1 }], [], { key: 'id', grain: ['group'] });
const trackedB = compileLineage([{ id: 'A', group: 'y', value: 1 }], [], { key: 'id', grain: ['group'] });
const correspondence = correspondLineage(trackedA, trackedB, { fromField: 'value', toField: 'value' });
correspondence.edges;
correspondence.components;
selectedDelta(a, b).hasDelta('encoding.y');
selectedBar().data([]).x('key');
selectedPoint().data([]).x('x').y('y').radius(6);
selectedLine().data([]).x('x').y('y').curve('curveMonotoneX').strokeWidth(3).pointSize(4);
selectedArea().data([]).x('x').y('y').curve('curveMonotoneX');
selectedArea().data([]).x('x').y('y').breakdown('industry')
  .layout('stream', { offset: 'silhouette', order: 'ascending' });
selectedUnit().data([]).value('count', { unitValue: 10 }).group('category').layout('bar', { columns: 2 }).radius(4);
selectedUnit().data([]).layout('force', { radius: 5 });
// @ts-expect-error VisDelta uses exact D3 curve names rather than aliases.
selectedLine().curve('smooth');
// @ts-expect-error D3 curveBundle is for Line and does not implement the Area interface.
selectedArea().curve('curveBundle');
registerChartModule(areaModule);
registerChartModule(barModule);
registerChartModule(pointModule);
registerChartModule(lineModule);
registerChartModule(unitModule);
// @ts-expect-error Pair progress accepts only a number.
pair.progress('0.5');
// The bundled runtime supplies D3 and executes transforms; no runtime option is required.
await transition(a, b, { target: '#chart' });
// @ts-expect-error D3 is library-owned, not a public injection option.
await transition(a, b, { target: '#chart', d3: {} });
await browser.transition(a, b, { target: '#chart' });
// @ts-expect-error A target is required.
await browser.transition(a, b);
const customPlugin = defineChartType({ key: 'custom', renderer() {} });
registerChartModule({ plugin: customPlugin });
const customLazyPlugin = defineChartType({ key: 'custom-lazy', renderer() {} });
const customModule = defineChartModule({
  key: 'custom-lazy',
  async load() { return { plugin: customLazyPlugin }; }
});
registerChartModule(customModule);
class CustomState extends ChartState {
  chartModule() { return customModule; }
}
new CustomState({ mark: 'custom-lazy', data: { values: [] }, encoding: {} }).x('value');
