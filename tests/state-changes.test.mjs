import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, delta, unit } from '../dist/index.js';

const rows = [
  { id: 'al-young', state: 'AL', age: 'young', value: 10, other: 2 },
  { id: 'al-old', state: 'AL', age: 'old', value: 20, other: 4 },
  { id: 'ny-young', state: 'NY', age: 'young', value: 30, other: 6 },
  { id: 'ny-old', state: 'NY', age: 'old', value: 40, other: 8 }
];

function base() {
  return bar(rows).datumKey('id').x('state').y('value').key('id');
}

function summary(changes) {
  return changes.map(({ category, action, target, channel, property }) => ({
    category,
    action,
    ...(target ? { target } : {}),
    ...(channel ? { channel } : {}),
    ...(property ? { property } : {})
  }));
}

test('focused detail to total reports grain merge and focus exit without prescribing order', () => {
  const detailed = base().breakdown('age');
  const result = delta(
    detailed.focus({ state: 'AL' }),
    detailed.rollup()
  );

  assert.deepEqual(summary(result.stateChanges), [
    { category: 'grain', action: 'merge' },
    { category: 'attention', action: 'exit', target: 'focus' }
  ]);
  assert.deepEqual(result.stateChanges[0].previous.groupby, ['age', 'state']);
  assert.deepEqual(result.stateChanges[0].next.groupby, ['state']);
  assert.equal(result.stateChanges[0].previous.measures[0].op, 'sum');
  assert.equal(result.stateChanges[0].next.measures[0].op, 'sum');
});

test('same grouping with a different aggregate operator changes the reducer', () => {
  const sum = base().rollup('state', { op: 'sum' });
  const mean = base().rollup('state', { op: 'mean' });
  const grain = delta(sum, mean).stateChanges.find((change) => change.category === 'grain');

  assert.equal(grain.action, 'change-reducer');
  assert.equal(grain.previous.measures[0].op, 'sum');
  assert.equal(grain.next.measures[0].op, 'mean');
});

test('Unit contribution size is part of grain rather than appearance', () => {
  const units = unit(rows).datumKey('id').value('value');
  const grain = delta(units, units.value('value', { unitValue: 5 })).stateChanges;

  assert.deepEqual(summary(grain), [{ category: 'grain', action: 'merge' }]);
  assert.equal(grain[0].previous.unitValue, 1);
  assert.equal(grain[0].next.unitValue, 5);
});

test('Unit value field is part of the grain measure description', () => {
  const units = unit(rows).datumKey('id').value('value');
  const grain = delta(units, units.value('other')).stateChanges;

  assert.deepEqual(summary(grain), [{ category: 'grain', action: 'reaggregate' }]);
  assert.equal(grain[0].previous.measures[0].field, 'value');
  assert.equal(grain[0].next.measures[0].field, 'other');
});

test('the normalized ontology distinguishes all non-grain state dimensions', () => {
  assert.deepEqual(summary(delta(base(), base().where({ state: 'AL' })).stateChanges), [
    { category: 'data', action: 'remove' }
  ]);
  assert.deepEqual(summary(delta(base(), base().y('other')).stateChanges), [
    { category: 'encoding', action: 'remap', channel: 'y' }
  ]);
  assert.deepEqual(summary(delta(base(), base().flip()).stateChanges), [
    { category: 'coordinate', action: 'reorient' }
  ]);

  const detailed = base().breakdown('age');
  assert.deepEqual(summary(delta(detailed, detailed.layout('grouped')).stateChanges), [
    { category: 'layout', action: 'rearrange' }
  ]);
  assert.deepEqual(summary(delta(base(), base().highlight({ state: 'AL' })).stateChanges), [
    { category: 'attention', action: 'enter', target: 'highlight' }
  ]);
  assert.deepEqual(summary(delta(base().color('#111111'), base().color('#eeeeee')).stateChanges), [
    { category: 'appearance', action: 'restyle', property: 'color' }
  ]);
});

test('stable datum identity distinguishes value updates from membership changes', () => {
  const changed = rows.map((row) => row.id === 'al-young' ? { ...row, value: 11 } : row);
  assert.deepEqual(summary(delta(base(), base().data(changed)).stateChanges), [
    { category: 'data', action: 'update' }
  ]);
});

test('data updates stay unclassified when source identity is only row position', () => {
  const before = bar([{ category: 'A', value: 1 }]).x('category').y('value');
  const after = before.data([{ category: 'A', value: 2 }]);

  assert.deepEqual(delta(before, after).stateChanges, []);
  assert.equal(delta(before, after).hasDelta('data'), true);
});
