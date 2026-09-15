import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, line, point, sequence, unit, transition } from '../dist/index.js';
import { diffViewStates, sameValue } from '../dist/grammar/diff.js';
import { resolveBarTransitionPlan } from '../dist/charts/bar/state.js';

test('builders accept deferred data and preserve both branches', () => {
  const rows = [{ category: 'A', value: 1, other: 4 }];
  for (const factory of [bar, line, point, unit]) {
    const first = factory().data(rows).x('category').y('value');
    const snapshot = first.toSpec();
    const second = first.y('other');
    assert.notEqual(first, second);
    assert.deepEqual(first.toSpec(), snapshot);
    assert.equal(second.toSpec().encoding.y.field, 'other');
    rows[0].value = 9;
    assert.deepEqual(first.toSpec(), snapshot);
  }
});

test('data is replaced, including URL and inline source metadata', () => {
  const first = bar().data({ url: './before.json', type: 'json' }).x('category').y('value');
  assert.deepEqual(first.data([{ category: 'A', value: 1 }]).toSpec().data, [{ category: 'A', value: 1 }]);
  assert.deepEqual(first.data({ values: [] }).toSpec().data, { values: [] });
  assert.deepEqual(first.data('./after.csv').toSpec().data, { url: './after.csv' });
});

test('diff detects data and every bound encoding channel', () => {
  const a = point().data('one').x('x').y('y');
  assert.equal(diffViewStates(a, a.data('two')).hasDelta('data'), true);
  assert.equal(diffViewStates(a, a.channel('size', 'count')).hasDelta('encoding.size'), true);
  assert.equal(diffViewStates(a, a.tooltip('x')).hasDelta('encoding.tooltip'), true);
});

test('same result has the same delta independent of derivation and property order', () => {
  const a = bar('rows').x('category').y('value');
  const b = a.y('other');
  const c = bar('rows').x('category').y('other');
  assert.deepEqual(diffViewStates(a, b).deltas, diffViewStates(a, c).deltas);
  assert.equal(sameValue({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 }), true);
  assert.equal(sameValue([2, 3], [3, 2]), false);
});

test('pair validation runs before DOM access', async () => {
  await assert.rejects(() => transition(bar('a'), line('a'), {}), /same chart type/);
  await assert.rejects(() => transition(bar('a'), bar('a'), {}), /missing dataset/);
  await assert.rejects(() => transition(bar('a'), bar('a'), {}), /missing dataset/);
  const a = { mark: 'bar', data: [{ category: 'A', value: 1 }] };
  await assert.rejects(() => transition(a, { ...a, transform: [null] }, {}), /transform\[0\]/);
  await assert.rejects(() => transition(a, { ...a, transform: [{ limit: -1 }] }, {}), /transform\[0\]/);
});

test('sequence validates its minimum authored timeline before DOM access', async () => {
  await assert.rejects(
    () => sequence([bar('rows')], { target: '#chart' }),
    /at least two visualization states/
  );
});

test('bar steps keep scale, axis, and marks in one chart-part change', () => {
  const vertical = bar([{ category: 'A', value: 1 }]).x('category').y('value');
  const horizontal = vertical.flip({ order: ['y', 'x'] });
  const plan = resolveBarTransitionPlan(vertical.toSpec(), horizontal.toSpec());

  assert.deepEqual(plan.steps, [
    { part: 'y', changes: ['scale', 'axis', 'marks'] },
    { part: 'x', changes: ['scale', 'axis', 'marks'] }
  ]);
  assert.equal(plan.match, undefined);
});

test('stacked bar filters update surviving stack intervals as well as membership', () => {
  const rows = [
    { id: 'a-low', category: 'A', segment: 'low', value: 4 },
    { id: 'a-high', category: 'A', segment: 'high', value: 6 },
    { id: 'b-low', category: 'B', segment: 'low', value: 3 },
    { id: 'b-high', category: 'B', segment: 'high', value: 5 }
  ];
  const stacked = bar(rows)
    .datumKey('id')
    .x('category')
    .y('value')
    .breakdown('segment');
  const plan = resolveBarTransitionPlan(
    stacked.toSpec(),
    stacked.where({ segment: 'high' }).toSpec()
  );

  assert.deepEqual(plan.steps, [
    { part: 'x', changes: ['scale', 'axis', 'marks'] },
    { part: 'y', changes: ['scale', 'axis', 'marks'] }
  ]);
});
