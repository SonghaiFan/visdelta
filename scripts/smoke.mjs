import { builtInChartModules } from '../dist/charts/builtins.js';
import {
  createChartTypeRegistry,
  registerChartModules
} from '../dist/charts/index.js';
import { createViewCompiler } from '../dist/runtime/view-compile.js';
import * as sourceApi from '../dist/index.js';
import * as distApi from '../dist/visdelta.esm.js';

const publicApi = [
  'D3_AREA_CURVE_NAMES',
  'D3_CURVE_NAMES',
  'UNIT_LAYOUTS',
  'applyDeclarationEdits',
  'area',
  'availableChartTypes',
  'bar',
  'buildGroupingTree',
  'compileLineage',
  'correspondLineage',
  'correspondMarks',
  'detectDataTypes',
  'chartStylePresets',
  'd3ChartStyle',
  'darkChartStyle',
  'delta',
  'declarationEdits',
  'defineChartStyle',
  'defineChartType',
  'diffViewStates',
  'line',
  'lineageMarkKey',
  'markKeyValue',
  'paperChartStyle',
  'planDeclarationTransition',
  'point',
  'registerChartType',
  'registerChartModule',
  'resolveEncodingTypes',
  'resolveMarkIdentity',
  'sequence',
  'transition',
  'unit',
  'viewLineageCorrespondence',
  'visualizationSpec'
];

const chartModules = await Promise.all(builtInChartModules.map((module) => module.load()));
const registry = createChartTypeRegistry();
registerChartModules(registry, chartModules, {});
const expectedTypes = ['area', 'bar', 'line', 'point', 'unit'];
const viewCompiler = createViewCompiler(registry);
const compiledTypes = expectedTypes.filter((mark) => {
  const result = viewCompiler.compileEffectiveView({
    mark,
    data: { values: [] },
    encoding: {},
    selection: { mode: 'focus', field: 'x', equal: 'one' }
  }, { scene: ['selection'] });
  const state = result.effectiveViewSpec?.meta?.state;
  return result.sceneTransition.scene.includes('selection') &&
    state?.sceneState?.selection?.mode === 'focus' &&
    state.selection === undefined;
});

assertSame(Object.keys(sourceApi).sort(), publicApi.sort(), 'source public API');
assertSame(Object.keys(distApi).sort(), publicApi.sort(), 'dist public API');
assertSame(registry.types(), expectedTypes, 'chart type registry');
assertSame(compiledTypes, expectedTypes, 'runtime view compiler consumes a selection state slot');

const first = sourceApi.bar([{ category: 'A', value: 1, other: 2 }])
  .x('category')
  .y('value')
  .key('category');
const second = first.y('other');
if (!sourceApi.delta(first, second).has('encoding.y')) {
  throw new Error('Core delta smoke check did not detect the y encoding change.');
}

const areaDetail = sourceApi.area([
  { period: 'Q1', region: 'North', value: 2 },
  { period: 'Q1', region: 'South', value: 3 }
]).x('period').y('value').breakdown('region');
if (areaDetail.toSpec().meta.state.sceneState.detail.mode !== 'stacked') {
  throw new Error('Area smoke check did not compile stacked detail.');
}

console.log(JSON.stringify({ types: registry.types(), compiledTypes }, null, 2));

function assertSame(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${label} mismatch: expected ${right}, got ${left}`);
}
