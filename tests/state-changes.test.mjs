import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, delta, point, unit } from '../dist/index.js';
import { viewHighlight, viewSelection } from '../dist/focus.js';

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

  const from = legacy('one', 'one');
  const to = legacy('two', 'one');
  assert.deepEqual(viewSelection(from), from.meta.state.selection);
  assert.deepEqual(viewHighlight(from), from.meta.state.sceneState.selection);
  assert.deepEqual(viewSelection(to), to.meta.state.selection);
  assert.deepEqual(viewHighlight(to), to.meta.state.sceneState.selection);
  assert.deepEqual(summary(delta(from, to).stateChanges), [
    { category: 'attention', action: 'shift', target: 'focus' }
  ]);

  const swappedLegacy = (focus, highlight) => ({
    ...baseSpec,
    meta: { state: {
      selection: { mode: 'highlight', field: 'group', equal: highlight },
      sceneState: { selection: { mode: 'focus', field: 'group', equal: focus } }
    } }
  });
  assert.deepEqual(summary(delta(swappedLegacy('one', 'one'), swappedLegacy('one', 'two')).stateChanges), [
    { category: 'attention', action: 'shift', target: 'highlight' }
  ]);
});

test('explicit attention scopes take precedence over legacy selection fields', () => {
  const data = { values: [{ id: 'a', group: 'one', value: 1 }] };
  const baseSpec = { mark: 'point', data, key: 'id', encoding: { x: { field: 'id' }, y: { field: 'value' } } };
  const explicit = (scope, legacy) => ({
    ...baseSpec,
    meta: { state: {
      scopes: { focus: { mode: 'focus', field: 'group', equal: scope } },
      selection: { mode: 'focus', field: 'group', equal: legacy }
    } }
  });

  assert.deepEqual(summary(delta(explicit('one', 'legacy-a'), explicit('two', 'legacy-b')).stateChanges), [
    { category: 'attention', action: 'shift', target: 'focus' }
  ]);
  assert.deepEqual(summary(delta(explicit('one', 'legacy-a'), explicit('one', 'legacy-b')).stateChanges), []);
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

test('title and subtitle are appearance restyles, not data or layout changes', () => {
  const plain = base();
  const headed = plain.title('Sales by state').subtitle('Latest census');

  assert.deepEqual(summary(delta(plain, headed).stateChanges), [
    { category: 'appearance', action: 'restyle', property: 'title' },
    { category: 'appearance', action: 'restyle', property: 'subtitle' }
  ]);
  assert.deepEqual(summary(delta(headed, headed.title('Sales by state')).stateChanges), []);
  assert.deepEqual(summary(delta(headed, headed.title('Revenue by state')).stateChanges), [
    { category: 'appearance', action: 'restyle', property: 'title' }
  ]);
  // The inverse is the same fact: the heading is removed.
  assert.deepEqual(summary(delta(headed, plain).stateChanges), [
    { category: 'appearance', action: 'restyle', property: 'title' },
    { category: 'appearance', action: 'restyle', property: 'subtitle' }
  ]);
  // They are lossless declaration edits too.
  assert.deepEqual(delta(plain, plain.title('A')).edits, [
    { path: ['title'], previous: { present: false }, next: { present: true, value: 'A' } }
  ]);
});

test('title and subtitle are immutable declarations that blank text and null remove', () => {
  const headed = base().title('Sales').subtitle('2024');

  assert.equal(base().toSpec().title, undefined);
  assert.equal(headed.toSpec().title, 'Sales');
  assert.equal(headed.toSpec().subtitle, '2024');
  assert.equal(headed.title('  ').toSpec().title, undefined);
  assert.equal('title' in headed.title(null).toSpec(), false);
  assert.equal(headed.title(null).toSpec().subtitle, '2024');
  // Blank text is the same state as no heading, so it reports no change.
  assert.deepEqual(summary(delta(base(), base().title('   ')).stateChanges), []);
  // The text is kept as written.
  assert.equal(base().title('  Padded ').toSpec().title, '  Padded ');
  assert.throws(() => base().title(3), /\.title\(\) takes text, or null/);
  assert.throws(() => base().subtitle({}), /\.subtitle\(\) takes text, or null/);
  // reset() returns to the declaration before the first scope, heading included.
  assert.equal(headed.where({ state: 'AL' }).reset().toSpec().title, 'Sales');
});
