import test from 'node:test';
import assert from 'node:assert/strict';
import { compileViewWithCompiler, defineChartStyle, defineChartType } from '../dist/plugins.js';
import { resolvePlotStyle } from '../dist/toolkit.js';
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
  assert.equal('resolveChartStyle' in runtime, false);
  assert.equal(typeof runtime.motion, 'function');
  assert.equal(typeof runtime.tooltip.svgPosition, 'function');
});

test('a plugin inherits no compiler operations or scene vocabulary', () => {
  const plugin = defineChartType({ key: 'unknown', renderer() {} });
  assert.deepEqual(plugin.scenes, []);
  assert.equal('stateOperations' in plugin, false);
  assert.deepEqual(plugin.createChartType(createChartRuntime()).scenes, []);
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
