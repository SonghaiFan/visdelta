import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, stringifySpec, delta, visualizationSpec } from '../dist/core.js';
import { bar } from '../dist/bar.js';
import { line } from '../dist/line.js';
import { area } from '../dist/area.js';
import { point } from '../dist/point.js';
import { pie } from '../dist/pie.js';
import { unit } from '../dist/unit.js';

const rows = [{ category: 'A', value: 2, next: 5 }, { category: 'B', value: 4, next: 1 }];
test('JSON round trips builder declarations without adding a second representation', () => {
  for (const builder of [bar, line, area, point, pie, unit]) {
    const state = builder(rows);
    const json = stringifySpec(state, 2);
    const spec = parseSpec(json);
    assert.deepEqual(spec, state.toSpec());
    assert.equal(stringifySpec(spec, 2), json);
    assert.deepEqual(visualizationSpec(spec), visualizationSpec(state));
  }
  const from = bar(rows).x('category').y('value');
  const to = from.y('next');
  const original = delta(from, to);
  const restored = delta(parseSpec(stringifySpec(from)), parseSpec(stringifySpec(to)));
  assert.deepEqual(restored.edits, original.edits);
  assert.deepEqual(restored.stateChanges, original.stateChanges);
});

test('JSON preserves extension fields, transform order and authored declarations', () => {
  const spec = { mark: 'custom', data: { name: 'sales' }, encoding: { custom: { field: 'value' } }, key: 'category', transform: [{ filter: { field: 'value', gt: 1 } }, { limit: 1 }], extension: { enabled: true } };
  const before = structuredClone(spec);
  const parsed = parseSpec(stringifySpec(spec));
  assert.deepEqual(parsed, visualizationSpec(spec));
  assert.deepEqual(parsed.transform, spec.transform);
  assert.deepEqual(spec, before);
  parsed.extension.enabled = false;
  assert.equal(spec.extension.enabled, true);
  assert.equal(parseSpec('{"mark":"custom","data":{"url":"sales.csv"}}').data.url, 'sales.csv');
});

test('JSON transport rejects lossy values with their path', () => {
  for (const value of [NaN, Infinity, 1n, () => {}, Symbol('x'), new Map(), new Date('invalid')]) {
    assert.throws(() => stringifySpec({ mark: 'custom', extension: value }), /\$\["extension"\]/);
  }
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => stringifySpec({ mark: 'custom', extension: cycle }), /circular/);
  assert.throws(() => stringifySpec({ mark: 'custom', data: [undefined] }), /\[0\]/);
  assert.throws(() => parseSpec('{"mark":"custom","value":1e999}'), /JSON value/);
  const date = new Date('2026-01-01T00:00:00Z');
  assert.equal(parseSpec(stringifySpec({ mark: 'custom', date, optional: undefined })).date, date.toISOString());
});

test('JSON validates common structure without claiming plugin validity', () => {
  for (const json of ['null', '[]', '{}', '{"mark":1}', '{"mark":"bar","encoding":[]}', '{"mark":"bar","encoding":{"x":"value"}}', '{"mark":"bar","transform":[{"limit":-1}]}']) {
    assert.throws(() => parseSpec(json));
  }
  assert.throws(() => parseSpec('{'), SyntaxError);
  assert.throws(() => parseSpec({ mark: 'bar' }), /JSON string/);
  assert.throws(() => parseSpec('{"mark":"bar","meta":{"transform":[{"limit":-1}]}}'), /limit/);
  assert.deepEqual(parseSpec('{"mark":"unregistered-plugin"}'), { mark: 'unregistered-plugin' });
});
