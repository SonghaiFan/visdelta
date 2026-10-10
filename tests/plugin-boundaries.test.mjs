import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { availableChartTypes, compileViewWithCompiler } from '../dist/plugins.js';
import { resolveMarkRendererKey } from '../dist/charts/index.js';
import { resolveSceneTransition } from '../dist/transitions/index.js';

test('core, runtime, SDK and toolkit do not import any official chart implementation', async () => {
  for (const entry of ['core', 'transition-entry', 'plugins', 'toolkit']) {
    const result = await build({ entryPoints: [`dist/${entry}.js`], bundle: true, write: false, metafile: true });
    const families = Object.keys(result.metafile.inputs).filter(path => /charts\/(area|bar|line|point|unit)\//.test(path));
    assert.deepEqual(families, [], entry);
  }
  assert.deepEqual(availableChartTypes(), []);
  await import('../dist/index.js');
  assert.deepEqual(availableChartTypes(), [], 'convenience exports must not register defaults');
});

test('metadata cannot change a chart identity and scene names belong to the plugin', () => {
  assert.equal(resolveMarkRendererKey({ mark: 'radial', meta: { unit: { value: 'count' } } }), 'radial');
  assert.deepEqual(resolveSceneTransition({ meta: { state: { packing: { gap: 2 } } } },
    { scene: ['packing', 'axis'] }, { scenes: ['packing'] }), { scene: ['packing'], packing: { gap: 2 } });
  assert.deepEqual(resolveSceneTransition({}, { scene: ['axis'] }).scene, []);
});

test('compilation detaches custom state inputs and preserves unconsumed state', () => {
  const source = { mark: 'custom', meta: { state: { packing: { gap: 2 }, retained: false } } };
  const result = compileViewWithCompiler(source, {}, {
    stateOrder: ['packing'], base: spec => spec,
    operations: { packing(spec, value) { value.gap = 99; return spec; } }
  });
  assert.equal(source.meta.state.packing.gap, 2);
  assert.deepEqual(result.meta.state, { retained: false });
});

test('compiler input cloning detaches nested transforms, channels, rows and metadata', () => {
  const source = {
    mark: 'custom',
    data: { values: [{ id: 'a', value: 1 }] },
    encoding: { x: { field: 'id', scale: { range: ['#111'] } } },
    transform: [{ aggregate: { groupby: ['id'], fields: [{ op: 'sum', field: 'value', as: 'total' }] } }],
    meta: { state: { packing: { gap: 2 } } }
  };
  compileViewWithCompiler(source, {}, {
    stateOrder: [],
    base(spec) {
      spec.data.values[0].value = 99;
      spec.encoding.x.scale.range[0] = '#fff';
      spec.transform[0].aggregate.fields[0].as = 'changed';
      spec.meta.state.packing.gap = 9;
      return spec;
    },
    operations: {}
  });
  assert.equal(source.data.values[0].value, 1);
  assert.equal(source.encoding.x.scale.range[0], '#111');
  assert.equal(source.transform[0].aggregate.fields[0].as, 'total');
  assert.equal(source.meta.state.packing.gap, 2);
});

test('pure scale and timing tools have no executable host dependencies', async () => {
  for (const entry of ['scales', 'motion-timing', 'cartesian']) {
    const result = await build({ entryPoints: [`dist/toolkit/${entry}.js`], bundle: true, write: false, metafile: true });
    const host = Object.keys(result.metafile.inputs).filter(path => /dist\/runtime\//.test(path));
    assert.deepEqual(host, [], entry);
  }
});
