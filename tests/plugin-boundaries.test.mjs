import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { availableChartTypes, compileViewWithCompiler } from '../dist/plugins.js';
import { defineChartType, registerChartModule, registerChartType } from '../dist/plugins.js';
import { transitionRegistry } from '../dist/runtime/chart-registry.js';
import { resolveMarkRendererKey } from '../dist/charts/index.js';
import { createDefaultTransitionPlan } from '../dist/charts/transition-plan.js';
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

test('shared default plans contain only Core evidence and generic phases', () => {
  const plan = createDefaultTransitionPlan({ mark: 'custom' }, { mark: 'custom' }, { reason: 'test' });
  assert.deepEqual(plan, {
    reason: 'test',
    steps: [{ changes: ['scale', 'axis', 'marks', 'exit', 'enter'] }]
  });
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

function chartPlugin(key, renderer, createCalls = []) {
  return defineChartType({
    key,
    renderer() {},
    createRenderer(runtime) {
      createCalls.push(runtime);
      return (...args) => renderer(runtime, ...args);
    }
  });
}

test('one normalized registration slot supports type, plugin and lazy module replacement', async () => {
  const key = `registry-replace-${Date.now()}`;
  const makeType = renderer => ({ key, renderer, scenes: [], prepareSpec: spec => spec });
  const firstType = makeType(() => 'type');
  const firstPlugin = chartPlugin(key, () => 'plugin');
  let moduleLoads = 0;
  const lazyModule = { key: ` ${key} `, async load() {
    moduleLoads++;
    return { plugin: chartPlugin(key, () => 'lazy') };
  } };

  registerChartType(firstType);
  assert.equal((await transitionRegistry({ mark: key })).get(key).renderer(), 'type');
  registerChartModule({ plugin: firstPlugin });
  assert.equal((await transitionRegistry({ mark: key })).get(key).renderer(), 'plugin');
  registerChartModule(lazyModule);
  assert.equal((await transitionRegistry({ mark: key })).get(key).renderer(), 'lazy');
  registerChartType(makeType(() => 'last-type'));
  assert.equal((await transitionRegistry({ mark: key })).get(key).renderer(), 'last-type');
  assert.equal(moduleLoads, 1);
  assert.equal(availableChartTypes().filter(candidate => candidate === key).length, 1);
});

test('plugin factories are delayed until a host transition and isolated per host; snapshots stay stable', async () => {
  const key = `registry-host-${Date.now()}`;
  const hosts = [];
  registerChartModule({ plugin: chartPlugin(key, runtime => runtime.token, hosts) });
  assert.deepEqual(hosts, [], 'registration must not instantiate a plugin');

  const hostA = { token: 'host-a' };
  const hostB = { token: 'host-b' };
  const snapshotA = await transitionRegistry({ mark: key }, hostA);
  const snapshotB = await transitionRegistry({ mark: key }, hostB);
  assert.deepEqual(hosts, [hostA, hostB]);
  assert.equal(snapshotA.get(key).renderer(), 'host-a');
  assert.equal(snapshotB.get(key).renderer(), 'host-b');

  registerChartType({ key, renderer: () => 'replacement', scenes: [], prepareSpec: spec => spec });
  assert.equal(snapshotA.get(key).renderer(), 'host-a');
  assert.equal((await transitionRegistry({ mark: key })).get(key).renderer(), 'replacement');
});

test('an explicit registration made during lazy loading takes precedence', async () => {
  const key = `registry-race-${Date.now()}`;
  let finishLoad;
  let staleFactoryCalls = 0;
  const module = {
    key,
    load: () => new Promise(resolve => { finishLoad = resolve; })
  };
  registerChartModule(module);
  const pending = transitionRegistry({ mark: key });
  await new Promise(resolve => setImmediate(resolve));
  registerChartModule({ plugin: defineChartType({
    key,
    renderer() { return 'explicit'; },
    createChart(runtime) {
      return {
        key, renderer() { return 'explicit'; }, scenes: [], prepareSpec: spec => spec,
        defaultMargin: () => ({}),
        runtime
      };
    }
  }) });
  finishLoad({ plugin: chartPlugin(key, () => 'stale', { push() { staleFactoryCalls++; } }) });
  const registry = await pending;
  assert.equal(registry.get(key).renderer(), 'explicit');
  assert.equal(staleFactoryCalls, 0);
});

test('stale lazy mismatch and rejection are ignored after explicit replacement', async () => {
  const replacementWins = async (load) => {
    const key = `registry-stale-${Date.now()}-${Math.random()}`;
    let finishLoad;
    registerChartModule({ key, load: () => new Promise((resolve, reject) => { finishLoad = { resolve, reject }; }) });
    const pending = transitionRegistry({ mark: key });
    await new Promise(resolve => setImmediate(resolve));
    registerChartType({ key, renderer: () => 'replacement', scenes: [], prepareSpec: spec => spec });
    load(finishLoad);
    const registry = await pending;
    assert.equal(registry.get(key).renderer(), 'replacement');
  };

  await replacementWins(({ resolve }) => resolve({ plugin: chartPlugin('stale-wrong-key', () => 'stale') }));
  await replacementWins(({ reject }) => reject(new Error('stale load failure')));
});

test('a current lazy module mismatch or rejection still surfaces its error', async () => {
  const mismatchKey = `registry-current-mismatch-${Date.now()}`;
  registerChartModule({ key: mismatchKey, load: async () => ({ plugin: chartPlugin('wrong-current-key', () => 'stale') }) });
  await assert.rejects(transitionRegistry({ mark: mismatchKey }), /loaded plugin "wrong-current-key"/);

  const rejectKey = `registry-current-reject-${Date.now()}`;
  registerChartModule({ key: rejectKey, load: async () => { throw new Error('current load failure'); } });
  await assert.rejects(transitionRegistry({ mark: rejectKey }), /current load failure/);
});

test('per-transition modules precede registered lazy modules, while explicit charts win', async () => {
  const key = `registry-local-module-${Date.now()}`;
  registerChartModule({ key, load: async () => ({ plugin: chartPlugin(key, () => 'registered-lazy') }) });
  const local = { key, load: async () => ({ plugin: chartPlugin(key, () => 'local') }) };
  assert.equal((await transitionRegistry({ mark: key }, undefined, [local])).get(key).renderer(), 'local');

  registerChartType({ key, renderer: () => 'explicit', scenes: [], prepareSpec: spec => spec });
  assert.equal((await transitionRegistry({ mark: key }, undefined, [local])).get(key).renderer(), 'explicit');
});

test('pure scale and timing tools have no executable host dependencies', async () => {
  for (const entry of ['scales', 'motion-timing', 'cartesian']) {
    const result = await build({ entryPoints: [`dist/toolkit/${entry}.js`], bundle: true, write: false, metafile: true });
    const host = Object.keys(result.metafile.inputs).filter(path => /dist\/runtime\//.test(path));
    assert.deepEqual(host, [], entry);
  }
});
