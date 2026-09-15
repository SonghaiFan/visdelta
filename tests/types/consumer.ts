import { bar, compileLineage, correspondLineage, delta, mount, select, sequence } from 'visdelta';
import { sequence as selectedSequence, transition } from 'visdelta/transition';
import { delta as selectedDelta } from 'visdelta/core';
import { bar as selectedBar, barModule } from 'visdelta/bar';
import { area as selectedArea, areaModule } from 'visdelta/area';
import { point as selectedPoint, pointModule } from 'visdelta/point';
import { line as selectedLine, lineModule } from 'visdelta/line';
import { unit as selectedUnit, unitModule } from 'visdelta/unit';
import {
  ChartState,
  defineChartModule,
  defineChartType,
  registerChartModule
} from 'visdelta/plugins';
import * as browser from 'visdelta/browser';
import type { D3Runtime, ChartTransitionPolicy, IntermediateSpec } from 'visdelta/plugins';

const waypoint: IntermediateSpec = { spec: { mark: 'custom' } };
const policy: ChartTransitionPolicy = {
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

declare const pluginD3: D3Runtime;
pluginD3.scaleLinear().domain([0, 1]);
// @ts-expect-error The renderer capability boundary does not expose all of D3.
pluginD3.geoMercator();

const a = bar().data([{ id: 'row-a', key: 'A', value: 1, next: 2 }]).datumKey('id').x('key').y('value');
const b = a.y('next');
const currentRows = a.rows();
currentRows[0]?.value;
const pair = await transition(a, b, { target: '#chart' });
pair.progress(0.4).play({ duration: 300 }).pause().resize();
pair.destroy();
const journey = await sequence([a, b, a], { target: '#chart' });
journey.progress(1.5).play({ duration: 300 }).pause().resize();
journey.destroy();
await selectedSequence([a, b], { target: '#chart' });
await mount(a, { target: '#chart' });
await select<typeof a>('#chart').update(view => view.focus({ key: 'A' })).play({ duration: 300 });
await select<typeof a>('#chart').sequence([
  view => view.focus({ key: 'A' }),
  view => view.highlight({ key: 'A' })
]).play({ duration: 300 });
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
