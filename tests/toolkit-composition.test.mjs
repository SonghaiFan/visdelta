import test from 'node:test';
import assert from 'node:assert/strict';
import { minimumTravelMatching, keyFirstTravelMatching, interpolatePathPoints, connectedStretches, composeCanonicalPolicies, composeIntermediatePolicies, encodingWaypoint } from '../dist/toolkit.js';

test('intermediate policies choose one complete route, including explicit direct routes', () => {
  const from = { mark: 'external', encoding: { angle: { field: 'a' } } };
  const to = { mark: 'external', encoding: { angle: { field: 'b' } } };
  const waypoint = { spec: encodingWaypoint(from, to, ['angle']), scene: 'rotation' };
  const selected = composeIntermediatePolicies(() => null, () => [waypoint], () => { throw Error('must not append'); });
  assert.deepEqual(selected(from, to), [waypoint]);
  assert.deepEqual(composeIntermediatePolicies(() => [], () => { throw Error('direct is a decision'); })(from, to), []);
  assert.deepEqual(composeIntermediatePolicies(() => null)(from, to), []);
  assert.deepEqual(composeIntermediatePolicies()(from, to), []);
});

test('encoding waypoints preserve complete destination state without inventing channels or sharing mutable inputs', () => {
  const from = { mark: 'external', encoding: { angle: { field: 'old', scale: { domain: [0, 10] } } } };
  const to = { mark: 'external', data: { values: [{ value: 3 }] }, transform: [{ filter: { value: 3 } }], meta: { state: { packing: { gap: 2 } } }, encoding: { angle: { field: 'new' }, color: { value: 'red' }, radius: { field: 'r' } } };
  const before = structuredClone({ from, to });
  const result = encodingWaypoint(from, to, ['angle', 'color']);
  assert.deepEqual(result.encoding, { angle: from.encoding.angle, radius: to.encoding.radius });
  assert.deepEqual(result.data, to.data);
  assert.deepEqual(result.transform, to.transform);
  assert.deepEqual(result.meta, to.meta);
  result.encoding.angle.scale.domain[0] = -1;
  result.data.values[0].value = 4;
  result.meta.state.packing.gap = 99;
  assert.deepEqual({ from, to }, before);
  assert.deepEqual(encodingWaypoint({}, { encoding: { color: { value: 'red' } } }, ['color']).encoding, {});
});

test('geometric matching minimizes rectangular assignment without mutating inputs', () => {
  const sources = Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 10, y: 0 })]);
  const targets = [{ x: 9, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 }];
  for (const [a, b] of [[sources, targets], [targets, sources]]) {
    const pairs = minimumTravelMatching(a, b);
    assert.equal(pairs.length, 2);
    assert.equal(new Set(pairs.map(p => p.sourceIndex)).size, 2);
    assert.equal(new Set(pairs.map(p => p.targetIndex)).size, 2);
    assert.equal(pairs.reduce((sum, p) => sum + p.distance, 0), 2);
  }
  assert.deepEqual(minimumTravelMatching([], targets), []);
  assert.throws(() => minimumTravelMatching([{ x: NaN, y: 0 }], targets), /finite/);
  assert.throws(() => minimumTravelMatching([{ x: 1e308, y: 0 }], [{ x: -1e308, y: 0 }]), /finite/);
});

test('keys constrain geometric fallback; fallback does not claim identity', () => {
  const pairs = keyFirstTravelMatching(
    [{ key: 'a', x: 0, y: 0 }, { key: 'b', x: 10, y: 0 }],
    [{ key: 'a', x: 10, y: 0 }, { key: 'c', x: 0, y: 0 }]
  );
  assert.deepEqual(pairs.map(p => [p.sourceIndex, p.targetIndex, p.matchedBy]), [[0, 0, 'key'], [1, 1, 'travel']]);
  assert.throws(() => keyFirstTravelMatching([{ key: 'a', x: Infinity, y: 0 }], [{ key: 'a', x: 0, y: 0 }]), /finite/);
  const duplicates = keyFirstTravelMatching(
    [{ key: 1, x: 0, y: 0 }, { key: '1', x: 2, y: 0 }],
    [{ key: '1', x: 2, y: 0 }, { key: 1, x: 0, y: 0 }]
  );
  assert.deepEqual(duplicates.map(p => p.matchedBy), ['key', 'travel']);
  assert.throws(() => keyFirstTravelMatching([{ key: 'a', x: 1e308, y: 0 }], [{ key: 'a', x: -1e308, y: 0 }]), /finite/);
});

test('rectangular assignments agree with exhaustive search on small point sets', () => {
  const optimum = (sources, targets) => {
    if (sources.length > targets.length) return optimum(targets, sources);
    const search = (index, used) => index === sources.length ? 0 : Math.min(...targets.flatMap((target, j) =>
      used.has(j) ? [] : [Math.hypot(sources[index].x - target.x, sources[index].y - target.y) + search(index + 1, new Set([...used, j]))]));
    return search(0, new Set());
  };
  for (let n = 1; n <= 4; n++) for (let m = 1; m <= 4; m++) {
    const a = Array.from({ length: n }, (_, i) => ({ x: (i * 7) % 5, y: i % 2 }));
    const b = Array.from({ length: m }, (_, i) => ({ x: (i * 3) % 7, y: i % 3 }));
    const cost = minimumTravelMatching(a, b).reduce((sum, p) => sum + p.distance, 0);
    assert.ok(Math.abs(cost - optimum(a, b)) < 1e-9, `${n} x ${m}`);
  }
});

test('geometry is seekable in arbitrary order and preserves topology gaps', () => {
  const from = [{ x: 0, y: 0 }, { x: 2, y: 4 }];
  const to = [{ x: 4, y: 2 }, { x: 6, y: 8 }];
  const forward = interpolatePathPoints(from, to);
  const reverse = interpolatePathPoints(to, from);
  for (const p of [1, 0.25, 0, 0.75, 0.5, 0.25]) assert.equal(forward(p), reverse(1 - p));
  assert.equal(forward(0.5), 'M2,1L4,6');
  assert.throws(() => interpolatePathPoints([], []), /non-empty/);
  assert.deepEqual(connectedStretches(['a', 'b', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], x => x), [['a', 'b'], ['d', 'e']]);
});

test('policy composition is ordered, lazy, and honors explicit forward decisions', () => {
  const a = Object.freeze({ mark: 'custom', rank: 1 });
  const b = Object.freeze({ mark: 'custom', rank: 2 });
  const calls = [];
  const choose = composeCanonicalPolicies(
    () => { calls.push('decline'); return null; },
    (from, to) => { calls.push('rank'); return from.rank > to.rank ? { from: to, to: from, reverse: true } : { from, to, reverse: false }; },
    () => { throw new Error('Must not run after a decision'); }
  );
  assert.deepEqual(choose(a, b), { from: a, to: b, reverse: false });
  assert.deepEqual(choose(b, a), { from: a, to: b, reverse: true });
  assert.deepEqual(calls, ['decline', 'rank', 'decline', 'rank']);
  assert.deepEqual(composeCanonicalPolicies(() => null)(a, b), { from: a, to: b, reverse: false });
});
