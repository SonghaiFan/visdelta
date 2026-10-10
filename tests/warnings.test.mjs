import test from 'node:test';
import assert from 'node:assert/strict';
import { area, bar, line, point, unit, visualizationWarnings, defineChartType, registerChartModule } from '../dist/index.js';
import { reportVisualizationWarnings } from '../dist/runtime/warnings.js';
const codes = async chart => (await visualizationWarnings(chart)).map(item => item.code);
const rows = [{ label: 'A', value: 12 }, { label: 'B', value: 14 }];

test('bar baseline warns in both orientations without changing the declaration', async () => {
  const chart = bar(rows).x('label').y('value', { domain: [10, 20] });
  const before = chart.toSpec();
  assert.deepEqual(await codes(chart), ['bar.truncated-baseline']);
  assert.deepEqual(await codes(chart.flip()), ['bar.truncated-baseline']);
  assert.deepEqual(chart.toSpec(), before);
  assert.deepEqual(await codes(bar(rows).x('label').y('value', { domain: [0.01, 20] })), []);
  assert.deepEqual(await codes(bar(rows).x('label').y('value', { domain: [0, 20] })), []);
  assert.deepEqual(await codes(bar(rows).x('label').y('value', { domain: [-20, 20] })), []);
});

test('nominal connections warn; explicitly ordered and temporal axes and focused line ranges do not', async () => {
  for (const factory of [line, area]) {
    assert.ok((await codes(factory(rows).x('label').y('value'))).includes('connection.unordered-axis'));
    assert.deepEqual(await codes(factory(rows).x('label', { type: 'ordinal' }).y('value')), []);
    assert.deepEqual(await codes(factory([{ date: '2025-01-01', y: 12 }, { date: '2025-01-02', y: 14 }]).x('date').y('y')), []);
  }
  assert.deepEqual(await codes(line(rows).x('label', { type: 'ordinal' }).y('value', { domain: [10, 20] })), []);
});

test('color and series thresholds use transformed data and ignore constant color', async () => {
  const data = Array.from({ length: 11 }, (_, i) => ({ x: 1, y: i + 1, group: `G${i}` }));
  const chart = line(data).x('x').y('y').color('group', { scheme: 'Tableau10' });
  assert.deepEqual(await codes(chart), ['color.too-many-categories', 'line.too-many-series']);
  assert.deepEqual(await codes(chart.where({ field: 'y', lte: 10 })), ['color.too-many-categories']);
  assert.deepEqual(await codes(chart.where({ field: 'y', lt: 0 })), []);
  assert.deepEqual(await codes(line(data).x('x').y('y').color('#333333')), []);
});

test('area uses its actual layer state, including uncolored detail', async () => {
  const data = Array.from({ length: 7 }, (_, i) => ({ x: 1, y: i === 0 ? -1 : i + 1, group: `G${i}` }));
  assert.deepEqual(await codes(area(data).x('x').y('y').breakdown('group')), ['area.too-many-series', 'area.negative-components']);
  assert.deepEqual(await codes(area(data.slice(0, 6)).x('x').y('y').breakdown('group')), ['area.negative-components']);
});

test('scatter warnings distinguish dot plots and exact coincidence from general density', async () => {
  assert.deepEqual(await codes(point(rows).x('label').y('value')), []);
  assert.deepEqual(await codes(point([{ x: 1, y: 2 }, { x: 1, y: 2 }]).x('x').y('y')), ['point.small-sample', 'point.coincident-positions']);
  assert.deepEqual(await codes(point(Array.from({ length: 5 }, (_, x) => ({ x, y: x }))).x('x').y('y')), []);
  assert.ok((await codes(point([{ x: 1, y: 2, n: -1 }]).x('x').y('y').size('n'))).includes('point.negative-size'));
});

test('custom plugins own advisory rules and receive transformed rows', async () => {
  registerChartModule({ plugin: defineChartType({ key: 'advisory-test', renderer() {}, warnings(spec, data) {
    return [{ code: 'custom.count', severity: 'warning', message: 'Example', suggestion: 'Inspect', evidence: { count: data.length } }];
  } }) });
  const warnings = await visualizationWarnings({ mark: 'advisory-test', data: { name: 'table' }, transform: [{ filter: { field: 'value', gt: 12 } }] }, { table: rows });
  assert.equal(warnings[0].evidence.count, 1);
});

test('automatic reporting deduplicates consecutive frames, exposes clearing and re-warns on recurrence', () => {
  const attributes = new Map();
  const events = [];
  const host = { setAttribute: (key, value) => attributes.set(key, value), ownerDocument: { defaultView: { CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  } } }, dispatchEvent: event => events.push(event) };
  const warning = { code: 'test', severity: 'warning', message: 'Test', suggestion: 'Inspect', evidence: {} };
  const original = console.warn;
  const logs = [];
  console.warn = (...args) => logs.push(args);
  try {
    reportVisualizationWarnings(host, [warning]);
    reportVisualizationWarnings(host, [warning]);
    reportVisualizationWarnings(host, []);
    assert.equal(attributes.get('data-visdelta-warnings'), '[]');
    reportVisualizationWarnings(host, [warning]);
    assert.equal(logs.length, 2);
    assert.equal(events.length, 3);
    assert.equal(events[1].type, 'visdelta:warnings');
    assert.deepEqual(events[1].detail, []);
  } finally { console.warn = original; }
});


test('shared color advice covers each built-in and custom plugins can omit inspection', async () => {
  const data = Array.from({ length: 11 }, (_, i) => ({ x: i, y: i + 1, group: `G${i}` }));
  for (const factory of [bar, line, area, point, unit]) {
    assert.ok((await codes(factory(data).x('x').y('y').color('group', { scheme: 'Tableau10' }))).includes('color.too-many-categories'));
  }
  registerChartModule({ plugin: defineChartType({ key: 'no-advice', renderer() {} }) });
  assert.deepEqual(await visualizationWarnings({ mark: 'no-advice', data: rows }), []);
});


test('plain declarations run chart compiler slots before inspection', async () => {
  registerChartModule({ plugin: defineChartType({ key: 'compiled-advice', renderer() {},
    createSpecCompiler: () => ({ stateOrder: ['selection'], base: spec => spec,
      operations: { selection: (spec, value) => ({ ...spec, transform: [{ filter: value }] }) } }),
    warnings: (spec, data) => [{ code: 'compiled.count', severity: 'warning', message: 'Count', suggestion: 'Inspect', evidence: { count: data.length } }]
  }) });
  const spec = { mark: 'compiled-advice', data: rows, meta: { state: { selection: { field: 'value', gt: 12 } } } };
  const before = structuredClone(spec);
  assert.equal((await visualizationWarnings(spec))[0].evidence.count, 1);
  assert.deepEqual(spec, before);
});
