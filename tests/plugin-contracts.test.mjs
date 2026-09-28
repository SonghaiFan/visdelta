import test from 'node:test';
import assert from 'node:assert/strict';
import { compileViewWithCompiler, defineChartStyle, defineChartType } from '../dist/plugins.js';
import { resolveChartPresentation, resolvePlotStyle } from '../dist/toolkit.js';
import { createChartRuntime } from '../dist/runtime/chart-runtime.js';

test('custom compiler state slots execute in declared order and are consumed', () => {
  const calls = [];
  const compiler = {
    stateOrder: ['packing', 'projection'],
    base: spec => spec,
    operations: {
      packing(spec, value) { calls.push(['pack', value]); return spec; },
      projection(spec, value) { calls.push(['project', value]); return spec; }
    }
  };
  const result = compileViewWithCompiler({
    mark: 'custom', meta: { state: { packing: { gap: 2 }, projection: { angle: 30 }, retained: true } }
  }, {}, compiler);
  assert.deepEqual(calls, [['pack', { gap: 2 }], ['project', { angle: 30 }]]);
  assert.equal(result.meta.state.packing, undefined);
  assert.equal(result.meta.state.projection, undefined);
  assert.equal(result.meta.state.retained, true);
});

test('plot composition has no chart names and merges each margin field', () => {
  const theme = defineChartStyle({ key: 'external', plot: { grid: 'both', margin: { left: 37 } } });
  const local = { margin: { top: 71, left: 15 }, openYDomain: true };
  const resolved = resolvePlotStyle(local, theme);
  assert.equal(resolved.margin.top, 71);
  assert.equal(resolved.margin.left, 37);
  assert.equal(resolved.openYDomain, true);
  assert.equal(resolved.grid, 'both');
  assert.equal('charts' in theme, false);
  const runtime = createChartRuntime({ chartStyle: theme });
  assert.equal(runtime.theme, theme);
  assert.equal('chartStyle' in runtime, false);
  assert.equal('resolveChartStyle' in runtime, false);
  assert.equal(typeof runtime.motion, 'function');
  assert.equal(typeof runtime.tooltip.svgPosition, 'function');
});

test('host color registries remain isolated after service composition', () => {
  const registry = color => new Map([['group', new Map([['A', color]])]]);
  const first = createChartRuntime({ colors: registry('#123456') });
  const second = createChartRuntime({ colors: registry('#abcdef') });
  const channel = { field: 'group', type: 'nominal' };
  const row = { group: 'A' };
  const a = first.colorScale([row], channel);
  const b = second.colorScale([row], channel);
  assert.equal(b(row), '#abcdef');
  assert.equal(a(row), '#123456');
  for (const name of ['bandOrLinear', 'position', 'easeFor', 'staggerDelay']) {
    assert.equal(name in first, false);
  }
});

test('a plugin resolves one presentation for its margin and renderer', () => {
  const theme = defineChartStyle({ key: 'host', plot: { grid: 'vertical', margin: { left: 90 } } });
  const runtime = createChartRuntime({ chartStyle: theme });
  let received;
  const plugin = defineChartType({
    key: 'presented',
    presentation: { plot: { grid: 'horizontal', margin: { top: 44, left: 30 } } },
    createRenderer(_runtime, presentation) {
      received = presentation;
      return () => {};
    }
  });
  const chart = plugin.createChartType(runtime);
  assert.equal(received.theme, theme);
  assert.equal(received.plot.grid, 'vertical');
  assert.deepEqual(chart.defaultMargin({}), received.plot.margin);
  assert.deepEqual(resolveChartPresentation({ plot: { margin: { top: 44 } } }, theme).plot.margin, {
    top: 44, right: 20, bottom: 20, left: 90
  });
});

test('a plugin inherits no compiler operations or scene vocabulary', () => {
  const plugin = defineChartType({ key: 'unknown', renderer() {} });
  assert.deepEqual(plugin.scenes, []);
  assert.equal('stateOperations' in plugin, false);
  assert.deepEqual(plugin.createChartType(createChartRuntime()).scenes, []);
});

test('both creation paths share resolved margins even without local presentation', () => {
  const theme = defineChartStyle({ key: 'margin-contract', plot: { margin: { left: 83 } } });
  for (const hook of ['createRenderer', 'createChart']) {
    for (const local of [undefined, { plot: { margin: { top: 42 } } }]) {
      let received;
      let calls = 0;
      const plugin = defineChartType({
        key: 'custom', presentation: local,
        [hook](_runtime, presentation) {
          received = presentation;
          calls++;
          if (hook === 'createRenderer') return () => {};
          return { key: 'custom', scenes: [], renderer() {}, prepareSpec: spec => spec, resolveTransitionPlan: () => ({}) };
        }
      });
      const instance = plugin.createChartType(createChartRuntime({ chartStyle: theme }));
      assert.equal(calls, 1);
      assert.equal(instance.defaultMargin({}), received.plot.margin);
      assert.equal(instance.defaultMargin({}), received.plot.margin);
      assert.deepEqual(received.plot.margin, { top: local ? 42 : 20, right: 20, bottom: 20, left: 83 });
      assert.throws(() => { received.plot.margin.left = 1; }, TypeError);
      assert.throws(() => { received.plot.grid = 'both'; }, TypeError);
    }
  }
});

test('missing handlers and duplicate compiler slots are rejected', () => {
  assert.throws(() => compileViewWithCompiler({ mark: 'custom' }, {}, {
    stateOrder: ['layout'], base: spec => spec, operations: {}
  }), /requires an operation/);
  assert.throws(() => compileViewWithCompiler({ mark: 'custom' }, {}, {
    stateOrder: ['x', 'x'], base: spec => spec, operations: { x: spec => spec }
  }), /unique stateOrder/);
});

test('custom compiler slots preserve zero and false values', () => {
  const calls = [];
  compileViewWithCompiler({ mark: 'custom', meta: { state: { offset: 0, enabled: false } } }, {}, {
    stateOrder: ['offset', 'enabled'],
    base: spec => spec,
    operations: {
      offset(spec, value) { calls.push(value); return spec; },
      enabled(spec, value) { calls.push(value); return spec; }
    }
  });
  assert.deepEqual(calls, [0, false]);
});
