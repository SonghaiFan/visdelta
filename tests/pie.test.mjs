import test from 'node:test';
import assert from 'node:assert/strict';
import { pie, delta, visualizationWarnings } from '../dist/index.js';
import { pieSlices } from '../dist/charts/pie/geometry.js';
const data = [{ category: 'A', n: 25 }, { category: 'B', n: 75 }];
const chart = () => pie(data).value('n').color('category').key('category');

test('pie preserves rows and encodes the declared measure as angle', () => {
  const state = chart();
  const before = structuredClone(data);
  const slices = pieSlices(state.rows(), state.toSpec());
  assert.deepEqual(data, before);
  assert.equal(slices.length, 2);
  assert.equal(slices[0].key, 'A');
  assert.equal(slices[0].share, 0.25);
  assert.ok(Math.abs(slices[0].endAngle - Math.PI / 2) < 1e-10);
  assert.ok(Math.abs(slices[1].endAngle - Math.PI * 2) < 1e-10);
  assert.equal(state.toSpec().encoding.angle.field, 'n');
});
test('pie rejects invalid component values and duplicate slice keys', () => {
  for (const n of [-1, Infinity, NaN, null]) {
    const state = pie([{ category: 'A', n }]).value('n').key('category');
    assert.throws(() => pieSlices(state.rows(), state.toSpec()), /finite, nonnegative/);
  }
  const state = pie([{ category: 'A', n: 0 }]).value('n').key('category');
  assert.throws(() => pieSlices(state.rows(), state.toSpec()), /positive total/);
  const huge = pie([{ category: 'A', n: 1e308 }, { category: 'B', n: 1e308 }]).value('n').key('category');
  assert.throws(() => pieSlices(huge.rows(), huge.toSpec()), /finite positive total/);
  const repeated = pie(data.concat(data)).value('n').key('category');
  assert.throws(() => pieSlices(repeated.rows(), repeated.toSpec()), /aggregate repeated/);
});
test('pie filters and sorts explicitly; warnings preserve every slice', async () => {
  const many = pie(Array.from({ length: 6 }, (_, i) => ({ category: String(i), n: i + 1 }))).value('n').key('category').color('category');
  const before = many.toSpec();
  const warnings = await visualizationWarnings(many);
  assert.deepEqual(warnings.map(d => d.code), ['color.too-many-categories', 'pie.too-many-slices']);
  assert.match(warnings[1].source, /datawrapper.*pie-chart$/);
  assert.deepEqual(many.toSpec(), before);
  assert.equal(pieSlices(many.rows(), many.toSpec()).length, 6);
  assert.equal(chart().where({ category: 'A' }).rows().length, 1);
  const sorted = chart().sort('n', 'descending');
  assert.equal(pieSlices(sorted.rows(), sorted.toSpec())[0].key, 'B');
});
test('pie public bindings and label controls use the existing ontology', () => {
  const a = chart();
  assert.ok(delta(a, a.value('other')).stateChanges.some(d => d.category === 'encoding' && d.channel === 'angle'));
  assert.ok(delta(a, a.labels('inside')).stateChanges.some(d => d.category === 'appearance' && d.property === 'labels'));
  assert.throws(() => a.labels('bad'), /inside, outside or none/);
});

test('donut hole is an independently authored, bounded appearance control', () => {
  assert.equal(chart().innerRadius(0.75).toSpec().innerRadius, 0.75);
  assert.ok(delta(chart(), chart().innerRadius(0.75)).stateChanges.some(d => d.category === 'appearance' && d.property === 'innerRadius'));
  for (const ratio of [-1, 1, Infinity, NaN]) assert.throws(() => chart().innerRadius(ratio), /fraction/);
});

test('unsupported Pie positional controls and angle scales fail explicitly', async () => {
  await assert.rejects(visualizationWarnings(chart().x('category')), /does not support the x channel/);
  await assert.rejects(visualizationWarnings(chart().value('n', { domain: [0, 100] })), /do not support scales/);
  await assert.rejects(visualizationWarnings(chart().focus({ category: 'A' })), /focus cameras/);
});
