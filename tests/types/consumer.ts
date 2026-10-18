import { bar, compileLineage, correspondLineage, delta, sequence } from 'visdelta';
import type { DeclarationCodecResult as EntryCodecResult, DeclarationOperationChange as EntryOperationChange } from 'visdelta';
import { sequence as selectedSequence, transition } from 'visdelta/transition';
import { delta as selectedDelta, applyDeclarationEdits, planDeclarationTransition } from 'visdelta/core';
import type { DeclarationCodecResult, DeclarationOperationChange, DeclarationOperationCodec, DeclarationPlanOptions } from 'visdelta/core';
import { bar as selectedBar, barModule, createBarGrainDeclarationOperationCodec } from 'visdelta/bar';
import type { BarTransitionPlan } from 'visdelta/bar';
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
import type { ChartTransitionPolicy, DeclarationCodecResult as PluginCodecResult, DeclarationOperationChange as PluginOperationChange, IntermediateSpec, Renderer, TransitionPlan } from 'visdelta/plugins';

const corePlan: TransitionPlan = { reason: 'generic-plugin-plan' };
// Bar renderer choices are exposed by the Bar entry only.
// @ts-expect-error Core transition plans do not encode Bar layout.
corePlan.source;
const barPlan: BarTransitionPlan = {
  source: { orientation: 'vertical', layout: 'simple', renderer: 'bar-simple-vertical' },
  enter: { mode: 'baseline', reason: 'detail-enter-baseline' }
};
void barPlan;

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
const customCodec: DeclarationOperationCodec = {
  decompose(spec) {
    return { status: 'ok', value: typeof spec.width === 'number' ? [{
      id: 'width', path: ['width'], value: { present: true, value: spec.width }
    }] : [] };
  },
  evaluate(template, operations) {
    const result = { ...template };
    const width = operations.find(operation => operation.id === 'width');
    if (width?.value.present) result.width = width.value.value;
    else delete result.width;
    return { status: 'ok', value: result };
  },
  normalize(spec) { return { status: 'ok', value: spec }; },
  validate(spec) { return spec.mark === 'custom' ? { status: 'ok', value: undefined } : { status: 'unsupported', reason: 'wrong mark' }; },
  validateStep(from, to, endpoints) {
    return from.mark === endpoints.from.mark && to.mark === endpoints.to.mark
      ? { status: 'ok', value: undefined }
      : { status: 'unsupported', reason: 'route must preserve endpoint marks' };
  }
};
const planOptions: DeclarationPlanOptions = { maxSearchStates: 32 };
const codecResult: DeclarationCodecResult<number> = { status: 'ok', value: 1 };
const operationChange: DeclarationOperationChange = {
  id: 'width', action: 'insert', next: { id: 'width', path: ['width'], value: { present: true, value: 20 } }
};
const pluginCodecResult: PluginCodecResult<void> = { status: 'ok', value: undefined };
const pluginOperationChange: PluginOperationChange = operationChange;
const entryCodecResult: EntryCodecResult<boolean> = { status: 'ok', value: true };
const entryOperationChange: EntryOperationChange = operationChange;
const customPlan = planDeclarationTransition(
  { mark: 'custom' }, { mark: 'custom', width: 20 }, customCodec, planOptions
);
const grainRows = [
  { state: 'A', age: 'young', population: 1 },
  { state: 'A', age: 'old', population: 2 }
];
const grainFrom = selectedBar(grainRows).x('state').y('population', { label: 'Metric' })
  .rollup({ label: 'Metric' }).toSpec();
const grainTo = selectedBar(grainRows).x('state').y('population', { label: 'Metric' })
  .breakdown('age', { label: 'Metric' }).toSpec();
const publicGrainPlan = planDeclarationTransition(
  grainFrom, grainTo, createBarGrainDeclarationOperationCodec()
);
publicGrainPlan.stages[0]?.operation.id;
customPlan.stages.forEach(stage => {
  applyDeclarationEdits(stage.from, stage.edits);
});
const browserPlanOptions: browser.DeclarationPlanOptions = { maxSearchStates: 16 };
const browserCodecResult: browser.DeclarationCodecResult<string> = { status: 'unsupported', reason: 'unsupported' };
const browserOperationChange: browser.DeclarationOperationChange = operationChange;
void [customPlan.status, browserPlanOptions, codecResult, operationChange, pluginCodecResult, pluginOperationChange, entryCodecResult, entryOperationChange, browserCodecResult, browserOperationChange];
const policy: ChartTransitionPolicy = {
  declarationPlanning: true,
  declarationPlanningOrder: 'before-chart',
  declarationOperations: customCodec,
  resolveTransitionPlan: () => ({}),
  intermediateSpecs: () => [waypoint],
  canonicalTransitionPair: (from, to) => ({ from, to, reverse: false })
};
defineChartType({
  key: 'policy-consumer', renderer() {},
  declarationPlanningOrder: policy.declarationPlanningOrder,
  transition: {
    plan: policy.resolveTransitionPlan,
    intermediateSpecs: policy.intermediateSpecs,
    canonicalPair: policy.canonicalTransitionPair,
    declarationOperations: policy.declarationOperations
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
pair.stageChanges()[0]?.[0]?.category;
pair.stageOperations()[0]?.action;
pair.progress(0.4).play({ duration: 300 }).pause().resize();
const inspectedPair = await pair.inspect();
inspectedPair.stages[0]?.properties[0]?.selector;
inspectedPair.stages[0]?.properties[0]?.node.getAttribute('x');
pair.destroy();
const journey = await sequence([a, b, a], { target: '#chart' });
journey.progress(1.5).play({ duration: 300 }).pause().resize();
(await journey.inspect()).stages[0]?.start;
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
selectedArea().data([]).x('x').y('y').curve('curveMonotoneX').labels('inside').labels('none');
// @ts-expect-error Area direct labels support only inside or none.
selectedArea().labels('outside');
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

import { pie as selectedPie, pieModule } from 'visdelta/pie';
import type { PieViewState } from 'visdelta/pie';
const pieState: PieViewState = selectedPie([{ part: 'A', n: 1 }]).value('n').key('part').label('part').innerRadius(0.75).labels('outside').toSpec();
void pieState; void pieModule;

import type { FacetLayout, FacetedViewState } from 'visdelta/facet';
const facetLayout: FacetLayout = { columns: 2, gap: 24, minWidth: 240 };
const facetState: FacetedViewState = selectedBar([{ p: 'A', x: 'one', y: 2 }]).x('x').y('y').repeat('p', facetLayout).toSpec();
void facetState;

// Repeat is native Line layout syntax and retains Line-specific fluent methods.
import { line as nativeLine } from 'visdelta/line';
const nativeRepeatedLine = nativeLine([{ date: 1, ticker: 'A', close: 20 }])
  .x('date').y('close').key(['date', 'ticker']).breakdown('ticker')
  .repeat('ticker', { direction: 'y', scales: 'independent' }).curve('curveStep');
const nativeLineMark: 'line' = nativeRepeatedLine.toSpec().mark;
void nativeLineMark;

const autoHeightLine = nativeRepeatedLine.repeat("ticker", { autoHeight: true, minHeight: 240 });
void autoHeightLine;

import type { VisualizationTransition as ResizableTransition } from "visdelta/transition";
function resizeCanvas(change: ResizableTransition) { return change.resize({ height: 640 }); }
void resizeCanvas;
function playTime(change: ResizableTransition, duration: number): number { return change.stageCount() * duration; }
void playTime;
import type { CanvasSize, TransitionOptions as SizedOptions, VisualizationSequence as SizedSequence } from "visdelta/transition";
const fixedSize: SizedOptions = { target: "#chart", width: 640, height: 360 };
const fitSize: SizedOptions = { target: "#chart", width: "auto", height: "auto" };
function fitContainer(change: ResizableTransition, story: SizedSequence, size: CanvasSize) {
  change.resize({ width: size, height: "auto" });
  return story.resize({ width: "auto", height: size });
}
void fixedSize; void fitSize; void fitContainer;
const headed = bar([{ city: 'Oslo', visitors: 31 }]).x('city').y('visitors');

selectedUnit([{ x: 1, y: 2 }]).layout('beeswarm', { x: 'x', radius: 5 });
selectedUnit([{ x: 1, y: 2 }]).layout('force', { x: { field: 'x', label: 'X' }, y: 'y' });
selectedUnit([{ x: 1, y: 2 }]).size(6).layout('beeswarm', { x: 'x' }).x('y');

selectedBar([{ hp: 1, mpg: 2 }]).x('hp', { label: 'Horsepower' });
// @ts-expect-error Channel names use label, not the figure title property.
selectedBar([{ hp: 1 }]).x('hp', { title: 'Horsepower' });

import { parseSpec, stringifySpec, type ViewSpec } from 'visdelta';
const jsonSpec: ViewSpec = { mark: 'bar', data: [{ x: 'A', y: 1 }] };
const restoredSpec: ViewSpec = parseSpec(stringifySpec(jsonSpec));
void restoredSpec;

import { render as renderChart, type ChartView } from 'visdelta';
import { createRenderer as scopedRenderer } from 'visdelta/render';
import { barModule as renderBarModule } from 'visdelta/bar';
async function persistentChart(): Promise<ChartView> {
  const view = await renderChart('#chart', JSON.stringify(jsonSpec), { updates: { policy: 'latest', duration: 600 } });
  const result = await view.update(jsonSpec, { animate: false, data: { sales: [] } });
  const status: 'applied' | 'superseded' | 'destroyed' = result.status;
  const revision: number = view.snapshot().revision;
  const manual = await view.transition(jsonSpec);
  manual.progress(1);
  view.resize({ width: 'auto' });
  void status; void revision;
  return view;
}
void persistentChart;
void scopedRenderer({ modules: [renderBarModule] });

import type { EditMessage, FluentEdit } from 'visdelta/render';
const fluentCall: FluentEdit = { method: 'flip', args: [] };
const editMessage: EditMessage = { requestId: 'consumer', baseRevision: 0, edits: [fluentCall] };
void editMessage;

// @ts-expect-error Figure headings belong in the surrounding page.
bar([]).title('Title');
// @ts-expect-error Figure headings belong in the surrounding page.
bar([]).subtitle('Subtitle');
