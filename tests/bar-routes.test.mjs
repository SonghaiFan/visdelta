import test from 'node:test';
import assert from 'node:assert/strict';
import { bar } from '../dist/bar.js';
import { barIntermediateSpecs, canonicalBarTransitionPair } from '../dist/charts/bar/state.js';
import { viewSelection } from '../dist/focus.js';
import { sameValue } from '../dist/grammar/diff.js';

const rows = [
  { id: 'a1', state: 'AL', age: 'young', value: 3 },
  { id: 'a2', state: 'AL', age: 'old', value: 5 },
  { id: 'b1', state: 'CA', age: 'young', value: 7 },
  { id: 'b2', state: 'CA', age: 'old', value: 11 }
];
const detail = (op = 'sum', layout = 'stacked') => bar(rows)
  .x('state').y('value').key(['state', 'age'])
  .breakdown('age', { op, layout }).color('age');
const phases = (a, b) => barIntermediateSpecs(a.toSpec(), b.toSpec());
const grain = spec => spec.transform.find(t => t.aggregate).aggregate.groupby;

test('reaggregation preserves declared endpoint colors rather than coloring its refinement', () => {
  const base = bar(rows).datumKey('id').y('value');
  for (const color of ['#cc3366', 'var(--vd-series-2)']) {
    const from = base.color(color).x('age').rollup('age').toSpec();
    const to = base.color(color).x('state').rollup('state').toSpec();
    const original = JSON.stringify([from, to]);
    const route = barIntermediateSpecs(from, to);
    assert.equal(route.length, 4);
    assert.ok(route.every(phase => sameValue(phase.spec.encoding.color, from.encoding.color)));
    assert.equal(JSON.stringify([from, to]), original);
  }
});

for (const op of ['sum', 'count']) {
  for (const layout of ['stacked', 'grouped']) {
    test(`${op} ${layout}: sorted detail unsorts at its own grain before merging`, () => {
      const detailed = detail(op, layout);
      const from = detailed.sort('value', 'descending');
      const to = detailed.rollup({ op });
      const originals = JSON.stringify([from.toSpec(), to.toSpec()]);
      const forward = phases(from, to);
      assert.equal(forward.length, layout === 'grouped' ? 2 : 1);
      assert.deepEqual(forward[0].spec, detailed.toSpec());
      assert.deepEqual(forward.map(p => p.spec), phases(to, from).map(p => p.spec).reverse());
      assert.equal(JSON.stringify([from.toSpec(), to.toSpec()]), originals);
    });

    test(`${op} ${layout}: merge keeps focus until the rollup, split reverses that route`, () => {
      const detailed = detail(op, layout);
      const from = detailed.focus({ state: 'AL' });
      const to = detailed.rollup({ op });
      const originals = JSON.stringify([from.toSpec(), to.toSpec()]);
      const forward = phases(from, to);
      const backward = phases(to, from);
      assert.equal(forward.length, layout === 'grouped' ? 2 : 1);
      assert.deepEqual(forward.map(p => p.spec), backward.map(p => p.spec).reverse());
      const middle = forward.at(-1).spec;
      const expected = to.focus({ state: 'AL' }).toSpec();
      assert.deepEqual(grain(middle), ['state']);
      assert.deepEqual(viewSelection(middle), viewSelection(expected));
      assert.deepEqual(middle.transform, expected.transform);
      assert.deepEqual(middle.encoding, expected.encoding);
      assert.deepEqual(middle.meta.object, expected.meta.object);
      if (layout === 'grouped') {
        assert.equal(forward[0].spec.meta.state.sceneState.detail.layout, 'stacked');
        assert.deepEqual(viewSelection(forward[0].spec), viewSelection(expected));
      }
      assert.equal(JSON.stringify([from.toSpec(), to.toSpec()]), originals);
      assert.deepEqual(phases(from, to), forward);
    });
  }

  test(`${op}: merge then sort is inferred from endpoint specs`, () => {
    const detailed = detail(op);
    const total = detailed.rollup({ op });
    const route = phases(detailed, total.sort('value'));
    assert.equal(route.length, 1);
    assert.deepEqual(route[0].spec.transform, total.toSpec().transform);
    assert.deepEqual(grain(route[0].spec), ['state']);
    assert.deepEqual(route.map(p => p.spec), phases(total.sort('value'), detailed).map(p => p.spec).reverse());
  });

  test(`${op}: rollup-to-rollup composes sorting with the common-grain bridge`, () => {
    const base = bar(rows).datumKey('id').y('value');
    const a = base.x('age').rollup('age', { op });
    const b = base.x('state').rollup('state', { op }).sort('value');
    const forward = phases(a, b);
    assert.equal(forward.length, 5);
    assert.deepEqual(forward.map(p => p.spec), phases(b, a).map(p => p.spec).reverse());
    assert.equal(forward.filter(p => grain(p.spec).length === 2).length, 4);
  });
}

test('focus and sorting become distinct presentation legs around one grain change', () => {
  const detailed = detail();
  const route = phases(detailed.focus({ state: 'AL' }), detailed.rollup().sort('value'));
  assert.equal(route.length, 2);
  assert.deepEqual(grain(route[0].spec), ['state']);
  assert.deepEqual(viewSelection(route[0].spec).filter, { field: 'state', equal: 'AL' });
  assert.equal('sort' in route[0].spec.transform.at(-1), false);
  assert.equal('sort' in route[1].spec.transform.at(-1), true);
  assert.ok(viewSelection(route[1].spec));
});

test('input and output sorts stay at their own grains, with focus retained through merge', () => {
  const detailed = detail();
  const from = detailed.sort('value').focus({ state: 'AL' });
  const to = detailed.rollup().sort('value', 'descending');
  const forward = phases(from, to);
  assert.equal(forward.length, 3);
  assert.deepEqual(forward[0].spec, detailed.focus({ state: 'AL' }).toSpec());
  assert.deepEqual(forward.map(p => grain(p.spec)), [['state', 'age'], ['state'], ['state']]);
  assert.deepEqual(forward.map(p => p.spec), phases(to, from).map(p => p.spec).reverse());
});

test('input sorts are not isolated across membership-changing operations', () => {
  const detailed = detail();
  const total = detailed.rollup();
  assert.deepEqual(phases(detailed.sort('value').where({ state: 'AL' }), total), []);
  const filtered = detailed.where({ state: 'AL' });
  assert.equal(phases(filtered.sort('value'), filtered.rollup()).length, 1);
  const from = detailed.sort('value').toSpec();
  // An intervening filter must not be stripped even when both endpoints
  // share the filter; the input pipeline is not a presentation-only leg.
  from.transform.splice(1, 0, { filter: { field: 'state', equal: 'AL' } });
  assert.deepEqual(barIntermediateSpecs(from, filtered.rollup().toSpec()), []);
  const limited = detailed.sort('value').toSpec();
  limited.transform.push({ limit: 1 });
  const limitedTotal = total.toSpec();
  limitedTotal.transform.push({ limit: 1 });
  assert.deepEqual(barIntermediateSpecs(limited, limitedTotal), []);
});

test('a shared input sort stays in place without unnecessary unsort and re-sort legs', () => {
  const sorted = detail().sort('value');
  assert.deepEqual(phases(sorted, sorted.rollup()), []);
});

test('non-additive measures, changed rows/preparation/identity and lost focus fields keep direct fallback', () => {
  const detailed = detail();
  const total = detailed.rollup();
  assert.deepEqual(phases(detailed.focus({ age: 'young' }), total), []);
  assert.deepEqual(phases(detailed.focus({ state: 'AL' }), total.data(rows.slice(1))), []);
  assert.deepEqual(phases(detailed.where({ state: 'AL' }).focus({ state: 'AL' }), total), []);
  assert.deepEqual(phases(detailed.datumKey('id').focus({ state: 'AL' }), total), []);
  const mean = detail('mean');
  assert.deepEqual(phases(mean.focus({ state: 'AL' }), mean.rollup({ op: 'mean' })), []);
  assert.deepEqual(phases(mean.sort('value'), mean.rollup({ op: 'mean' })), []);
  assert.deepEqual(phases(detailed, total.sort('age')), []);
});

test('equivalent JSON endpoints infer the same route without builder history', () => {
  const detailed = detail();
  const a = detailed.focus({ state: 'AL' }).toSpec();
  const b = detailed.rollup().toSpec();
  assert.ok(sameValue(barIntermediateSpecs(a, b), barIntermediateSpecs(
    JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))
  )));
});

test('presentation direction does not depend on JSON property order', () => {
  const total = detail().rollup();
  const a = total.focus({ state: 'AL' }).toSpec();
  const b = total.focus({ state: 'CA' }).toSpec();
  const reordered = JSON.parse(JSON.stringify(b, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value));
  assert.equal(canonicalBarTransitionPair(a, b).reverse, canonicalBarTransitionPair(a, reordered).reverse);
});
