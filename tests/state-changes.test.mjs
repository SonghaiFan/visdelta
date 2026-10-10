import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, delta, point, unit } from '../dist/index.js';

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

test('composite datum keys classify value changes and stable no-op filters stay data-neutral', () => {
  const sourceRows = [
    { state: 'AL', age: 'young', value: 10 },
    { state: 'AL', age: 'old', value: 20 }
  ];
  const chart = rows => bar(rows).datumKey(['state', 'age']).x('age').y('value').key(['state', 'age']);
  assert.deepEqual(summary(delta(chart(sourceRows), chart([{ ...sourceRows[0], value: 11 }, sourceRows[1]])).stateChanges), [
    { category: 'data', action: 'update' }
  ]);
  const allMatch = bar(sourceRows).datumKey(['state', 'age']).x('age').y('value').key(['state', 'age']);
  assert.deepEqual(summary(delta(allMatch, allMatch.where({ state: 'AL' })).stateChanges), []);
});

test('grain topology and reducer changes are both reported for one endpoint pair', () => {
  const source = bar(rows).datumKey('id').x('state').y('value').rollup('state', { op: 'sum' });
  const target = bar(rows).datumKey('id').x('state').y('value').rollup(['state', 'age'], { op: 'mean' });
  assert.deepEqual(summary(delta(source, target).stateChanges).filter(change => change.category === 'grain'), [
    { category: 'grain', action: 'split' },
    { category: 'grain', action: 'change-reducer' }
  ]);
});

test('legacy focus and highlight selectors normalize to attention changes', () => {
  const data = { values: [{ id: 'a', group: 'one', value: 1 }] };
  const baseSpec = { mark: 'point', data, key: 'id', encoding: { x: { field: 'id' }, y: { field: 'value' } } };
  const focused = { ...baseSpec, selection: { mode: 'focus', field: 'group', equal: 'one' } };
  const highlighted = { ...baseSpec, selection: { mode: 'highlight', field: 'group', equal: 'one' } };
  assert.deepEqual(summary(delta(baseSpec, focused).stateChanges), [
    { category: 'attention', action: 'enter', target: 'focus' }
  ]);
  assert.deepEqual(summary(delta(baseSpec, highlighted).stateChanges), [
    { category: 'attention', action: 'enter', target: 'highlight' }
  ]);
});

test('legacy focus and highlight fields do not mask one another during normalization', () => {
  const data = { values: [{ id: 'a', group: 'one', value: 1 }] };
  const baseSpec = { mark: 'point', data, key: 'id', encoding: { x: { field: 'id' }, y: { field: 'value' } } };
  const legacy = (focus, highlight) => ({
    ...baseSpec,
    meta: { state: {
      selection: { mode: 'focus', field: 'group', equal: focus },
      sceneState: { selection: { mode: 'highlight', field: 'group', equal: highlight } }
    } }
  });

  assert.deepEqual(summary(delta(legacy('one', 'one'), legacy('two', 'one')).stateChanges), [
    { category: 'attention', action: 'shift', target: 'focus' }
  ]);
});

test('axis swaps still report scale changes against the destination channels', () => {
  const data = { values: [{ id: 'a', x: 0, y: 1 }] };
  const source = {
    mark: 'point', data, key: 'id',
    encoding: {
      x: { field: 'x', type: 'quantitative', scale: { domain: [0, 1] } },
      y: { field: 'y', type: 'quantitative', scale: { domain: [0, 2] } }
    }
  };
  const target = {
    ...source,
    encoding: {
      x: { field: 'y', type: 'quantitative', scale: { domain: [0, 3] } },
      y: { field: 'x', type: 'quantitative', scale: { domain: [0, 4] } }
    }
  };
  assert.deepEqual(summary(delta(source, target).stateChanges), [
    { category: 'coordinate', action: 'reorient' },
    { category: 'coordinate', action: 'rescale', channel: 'x' },
    { category: 'coordinate', action: 'rescale', channel: 'y' }
  ]);
});

test('an inferred categorical datum identity classifies value updates', () => {
  const before = bar([{ category: 'A', value: 1 }]).x('category').y('value');
  const after = before.data([{ category: 'A', value: 2 }]);

  assert.deepEqual(summary(delta(before, after).stateChanges), [
    { category: 'data', action: 'update' }
  ]);
  assert.equal(delta(before, after).hasDelta('data'), true);
});

test('the public ontology vocabulary is covered by reachable state differences', () => {
  const chart = base();
  const detailed = chart.breakdown('age');
  const points = point(rows).datumKey('id').x('value').y('other').key('id');
  const pairs = [
    [chart.where({ state: 'AL' }), chart],
    [chart, chart.where({ state: 'AL' })],
    [chart, chart.data(rows.map(row => row.id === 'al-young' ? { ...row, value: 11 } : row))],
    [detailed.rollup(), detailed],
    [detailed, detailed.rollup()],
    [chart.rollup('state', { op: 'sum' }), chart.rollup('age', { op: 'sum' })],
    [chart.rollup('state', { op: 'sum' }), chart.rollup('state', { op: 'mean' })],
    [chart, chart.color('state')],
    [chart.color('state'), chart],
    [chart, chart.y('other')],
    [chart, chart.x('state', { domain: ['AL', 'NY'] })],
    [chart, chart.flip()],
    [chart, chart.sort('value', 'descending')],
    [detailed, detailed.layout('grouped')],
    [points, points.connector({ from: 0 })],
    [chart, chart.focus({ state: 'AL' })],
    [chart.focus({ state: 'AL' }), chart],
    [chart.focus({ state: 'AL' }), chart.focus({ state: 'NY' })],
    [chart.color('#111111'), chart.color('#eeeeee')],
    [points, points.pointSize(9)]
  ];

  const vocabulary = new Set(pairs.flatMap(([from, to]) =>
    delta(from, to).stateChanges.map(change => `${change.category}.${change.action}`)
  ));

  assert.deepEqual([...vocabulary].sort(), [
    'appearance.reshape',
    'appearance.restyle',
    'attention.enter',
    'attention.exit',
    'attention.shift',
    'coordinate.reorient',
    'coordinate.rescale',
    'data.add',
    'data.remove',
    'data.update',
    'encoding.bind',
    'encoding.remap',
    'encoding.unbind',
    'grain.change-reducer',
    'grain.merge',
    'grain.reaggregate',
    'grain.split',
    'layout.rearrange',
    'layout.reconnect',
    'layout.reorder'
  ]);
});
