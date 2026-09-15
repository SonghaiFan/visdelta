import test from 'node:test';
import assert from 'node:assert/strict';
import { bar } from '../dist/bar.js';
import { canonicalBarTransitionPair, barIntermediateSpecs } from '../dist/charts/bar/state.js';
import { canonicalTransitionPair, resolveTransitionRoute } from '../dist/charts/transition-route.js';
import { inferTransition } from '../dist/grammar/infer-transition.js';
import { viewLineageCorrespondence } from '../dist/data/view-lineage.js';

const detailed = bar([
  { id: 'a', state: 'AL', age: 'young', value: 3 },
  { id: 'b', state: 'AL', age: 'old', value: 7 },
  { id: 'c', state: 'CA', age: 'young', value: 5 },
  { id: 'd', state: 'CA', age: 'old', value: 9 }
]).datumKey('id').x('state').y('value').breakdown('age');
const policy = { canonicalTransitionPair: canonicalBarTransitionPair };
const a = detailed.focus({ state: 'AL' }).toSpec();
const middle = detailed.rollup().focus({ state: 'AL' }).toSpec();
const b = detailed.rollup().toSpec();

test('a route preserves authored endpoints and derives each leg independently', () => {
  const route = resolveTransitionRoute(policy, a, b, [{ spec: middle }]);
  assert.equal(route.from, a);
  assert.equal(route.to, b);
  assert.equal(route.legs.length, 2);
  assert.equal(route.legs[0].from, a);
  assert.equal(route.legs[0].to, route.legs[1].from);
  assert.equal(route.legs[1].to, b);
  assert.ok(route.legs[0].scenes.includes('detail'));
  assert.deepEqual(route.legs[1].scenes, ['selection']);
  for (const leg of route.legs) {
    assert.deepEqual(leg.scenes, inferTransition(leg.canonical.from, leg.canonical.to));
  }
});

test('endpoint facts give the same route without builder history', () => {
  const route = (from, to) => resolveTransitionRoute(policy, from, to, barIntermediateSpecs(from, to));
  assert.deepEqual(route(a, b), route(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))));
});

test('correspondence is evidence: the same merge admits explicit or inferred waypoints', () => {
  assert.equal(viewLineageCorrespondence(a, b).mode, 'merge');
  assert.equal(resolveTransitionRoute(policy, a, b).legs.length, 1);
  assert.equal(resolveTransitionRoute(policy, a, b, [{ spec: middle }]).legs.length, 2);
  assert.equal(resolveTransitionRoute(policy, a, b, barIntermediateSpecs(a, b)).legs.length, 2);
});

test('canonical direction does not replace authored endpoints or change route order', () => {
  const forward = resolveTransitionRoute(policy, a, b, [{ spec: middle }]);
  const backward = resolveTransitionRoute(policy, b, a, [{ spec: middle }]);
  for (const [i, leg] of forward.legs.entries()) {
    const reverse = backward.legs[backward.legs.length - 1 - i];
    assert.deepEqual(leg.canonical.from, reverse.canonical.from);
    assert.deepEqual(leg.canonical.to, reverse.canonical.to);
    assert.notEqual(leg.canonical.reverse, reverse.canonical.reverse);
    assert.equal(leg.from, reverse.to);
    assert.equal(leg.to, reverse.from);
  }
});

test('route assembly does not recursively choose waypoints or execute motion plans', () => {
  const chart = {
    ...policy,
    intermediateSpecs() { throw new Error('Do not expand generated states again'); },
    resolveTransitionPlan() { throw new Error('Execution planning is separate'); }
  };
  const waypoints = Object.freeze([Object.freeze({ spec: middle, scene: 'selection' })]);
  const original = JSON.stringify([a, b, waypoints]);
  const route = resolveTransitionRoute(chart, a, b, waypoints);
  assert.equal(route.legs.length, 2);
  assert.equal(JSON.stringify([a, b, waypoints]), original);
  // A hint augments only its own leg and never suppresses the derived detail.
  assert.ok(route.legs[0].scenes.includes('detail'));
  assert.equal(route.legs[0].scenes.filter(scene => scene === 'selection').length, 1);
});

test('no policy or no source retains the ordinary direct/initialization behavior', () => {
  assert.deepEqual(canonicalTransitionPair(undefined, a, b), { from: a, to: b, reverse: false });
  assert.deepEqual(canonicalTransitionPair(policy, null, b), { from: b, to: b, reverse: false });
  const route = resolveTransitionRoute(undefined, null, b);
  assert.equal(route.legs.length, 1);
  assert.equal(route.from, null);
  assert.equal(route.to, b);
  assert.deepEqual(route.legs[0].scenes, []);
});
