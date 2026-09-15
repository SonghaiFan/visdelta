import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, line, point, unit } from '../dist/index.js';
import { inferTransition } from '../dist/grammar/infer-transition.js';

test('scene inference ignores operation history and agrees with raw endpoints', () => {
  for (const factory of [bar, line, point, unit]) {
    const a = factory({ name: 'rows' }).x('category').y('value');
    const b = a.highlight({ category: 'A' });
    const repeated = b.highlight({ category: 'A' });
    assert.deepEqual(b.toSpec(), repeated.toSpec());
    assert.deepEqual(inferTransition(b, repeated), []);
    for (const target of [a.y('other'), b, a.where({ category: 'A' }), a.axis({ x: { scale: { type: 'log' } } })]) {
      assert.deepEqual(inferTransition(a, target), inferTransition(a.toSpec(), target.toSpec()));
      const wrapped = { toSpec: () => target.toSpec(), operations: () => ['fake'], capabilities: () => ({ mapping: false }) };
      assert.deepEqual(inferTransition(a, target), inferTransition(a, wrapped));
    }
  }
});

test('measure changes, row filters and pure axis swaps have distinct endpoint semantics', () => {
  for (const factory of [bar, line, point]) {
    const a = factory({ name: 'rows' }).x('category').y('value');
    assert.deepEqual(inferTransition(a, a.y('other')), ['mapping']);
    assert.deepEqual(inferTransition(a, a.where({ category: 'A' })), ['selection']);
    assert.deepEqual(inferTransition(a, a.where({ category: 'A' }).y('other')), ['selection', 'mapping']);
    assert.deepEqual(inferTransition(a, a.flip()), ['axis']);
    assert.deepEqual(inferTransition(a, a.highlight({ category: 'A' }).y('other')), ['selection', 'mapping']);
  }
});

test('grouping changes remain detail and layout-only changes remain axis', () => {
  const a = bar({ name: 'rows' }).x('category').y('value');
  const split = a.breakdown('kind');
  assert.deepEqual(inferTransition(a, split), ['detail']);
  assert.deepEqual(inferTransition(split, split.layout('grouped')), ['axis']);
  for (const [first, second] of [
    [line({ name: 'rows' }).x('time').y('value'), view => view.breakdown('kind')],
    [point({ name: 'rows' }).x('x').y('y'), view => view.rollup('kind')]
  ]) assert.deepEqual(inferTransition(first, second(first)), ['detail']);
});

test('initial state has no inferred transition', () => {
  assert.deepEqual(inferTransition(null, bar({ name: 'rows' }).x('category').y('value')), []);
});
