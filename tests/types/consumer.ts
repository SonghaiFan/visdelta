import { bar, delta, mount, select, sequence } from 'visdelta';
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

declare const d3: Record<string, unknown>;
const a = bar().data([{ key: 'A', value: 1, next: 2 }]).x('key').y('value');
const b = a.y('next');
const pair = await transition(a, b, { target: '#chart', d3 });
pair.progress(0.4).play({ duration: 300 }).pause().resize();
pair.destroy();
const journey = await sequence([a, b, a], { target: '#chart', d3 });
journey.progress(1.5).play({ duration: 300 }).pause().resize();
journey.destroy();
await selectedSequence([a, b], { target: '#chart', d3 });
await mount(a, { target: '#chart', d3 });
await select<typeof a>('#chart').update(view => view.focus({ key: 'A' })).play({ duration: 300 });
await select<typeof a>('#chart').sequence([
  view => view.focus({ key: 'A' }),
  view => view.highlight({ key: 'A' })
]).play({ duration: 300 });
delta(a, b).hasDelta('encoding.y');
selectedDelta(a, b).hasDelta('encoding.y');
selectedBar().data([]).x('key');
selectedPoint().data([]).x('x').y('y').radius(6);
selectedLine().data([]).x('x').y('y').curve('curveMonotoneX').strokeWidth(3).pointSize(4);
selectedArea().data([]).x('x').y('y').curve('curveMonotoneX');
selectedUnit().data([]).value('count').group('category').layout('bar', { columns: 2 }).radius(4);
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
// @ts-expect-error ESM dependencies are explicit.
await transition(a, b, { target: '#chart' });
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
