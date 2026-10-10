import { builtInChartModules } from '../dist/charts/builtins.js';
import { createViewCompiler } from '../dist/runtime/view-compile.js';
import { transitionRegistry } from '../dist/runtime/chart-registry.js';
import * as sourceApi from '../dist/index.js';
import * as distApi from '../dist/visdelta.esm.js';
import * as browserApi from '../dist/browser.js';
import * as barApi from '../dist/bar.js';

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
  'createBarGrainDeclarationOperationCodec',
  'detectDataTypes',
  'chartStylePresets',
  'd3ChartStyle',
  'darkChartStyle',
  'delta',
  'declarationEdits',
  'defineChartStyle',
  'defineChartType',
  'diffViewStates',
  'editorialChartStyle',
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

const expectedTypes = ['area', 'bar', 'line', 'point', 'unit'];
const resolvedTypes = [];
const compiledTypes = [];
for (const mark of expectedTypes) {
  const module = builtInChartModules.find((candidate) => candidate.key === mark);
  if (!module) throw new Error(`Missing built-in chart module: ${mark}`);
  const registry = await transitionRegistry({ mark }, undefined, [module]);
  resolvedTypes.push(...registry.types());
  const viewCompiler = createViewCompiler(registry);
  const result = viewCompiler.compileEffectiveView({
    mark,
    data: { values: [] },
    encoding: {},
    selection: { mode: 'focus', field: 'x', equal: 'one' }
  }, { scene: ['selection'] });
  const state = result.effectiveViewSpec?.meta?.state;
  if (
    result.sceneTransition.scene.includes('selection') &&
    state?.sceneState?.selection?.mode === 'focus' &&
    state.selection === undefined
  ) compiledTypes.push(mark);
}

assertSame(Object.keys(sourceApi).sort(), publicApi.sort(), 'source public API');
assertSame(Object.keys(distApi).sort(), publicApi.sort(), 'dist public API');
assertSame(Object.keys(browserApi).sort(), publicApi, 'browser public API');
assertSame(Object.keys(barApi).sort(), [
  'BarState', 'bar', 'barModule', 'createBarGrainDeclarationOperationCodec'
], 'Bar subentry public API');
assertSame(resolvedTypes.sort(), expectedTypes, 'production chart type registries');
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

console.log(JSON.stringify({ types: resolvedTypes.sort(), compiledTypes }, null, 2));

function assertSame(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${label} mismatch: expected ${right}, got ${left}`);
}
