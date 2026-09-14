import test from 'node:test';
import assert from 'node:assert/strict';
import * as d3 from 'd3';
import { D3_CURVE_NAMES, d3Curve } from '../dist/charts/line/curve.js';
import { interpolateLinePoints, matchLinePathFrames, matchLineZipperFrames } from '../dist/charts/line/path.js';

const short = value => Math.round(value * 1000) / 1000;
const renderPoints = points => points
  .map((point, index) => `${index ? 'L' : 'M'}${short(point.x)},${short(point.y)}`)
  .join('');
const frame = (points, curve = 'curveLinear') => ({
  curve,
  path: renderPoints(points),
  points
});

test('every supported curve name resolves directly to the same D3 export', () => {
  assert.equal(D3_CURVE_NAMES.length, 20);
  assert.equal(d3Curve(undefined, d3), d3.curveLinear);
  for (const name of D3_CURVE_NAMES) assert.equal(d3Curve(name, d3), d3[name]);
});

test('matched line points move without reversing their x order', () => {
  const straight = [
    { x: 0, y: 10 },
    { x: 100, y: 30 },
    { x: 200, y: 20 }
  ];
  const step = [
    { x: 0, y: 10 },
    { x: 50, y: 10 },
    { x: 200, y: 20 }
  ];
  const interpolate = interpolateLinePoints(straight, step);
  const numbers = interpolate(0.5).match(/-?[\d.]+/g).map(Number);
  const xValues = numbers.filter((_, index) => index % 2 === 0);

  assert.deepEqual(xValues, [...xValues].sort((a, b) => a - b));
});

test('matched line point interpolation clamps seek progress', () => {
  const from = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  const to = [{ x: 0, y: 10 }, { x: 10, y: 0 }];
  const interpolate = interpolateLinePoints(from, to);

  assert.equal(interpolate(-1), 'M0,0L10,10');
  assert.equal(interpolate(2), 'M0,10L10,0');
});

test('matched line point interpolation is the same transition in reverse', () => {
  const from = [{ x: 0, y: 0 }, { x: 20, y: 40 }, { x: 80, y: 10 }];
  const to = [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 90, y: 50 }];
  const forward = interpolateLinePoints(from, to);
  const reverse = interpolateLinePoints(to, from);

  for (const progress of [0, 0.17, 0.5, 0.83, 1]) {
    assert.equal(forward(progress), reverse(1 - progress));
  }
});

test('line paths move observations by key when their positions change', () => {
  const from = frame([
    { key: 'A', x: 0, y: 30 },
    { key: 'B', x: 20, y: 10 }
  ]);
  const to = frame([
    { key: 'A', x: 10, y: 20 },
    { key: 'B', x: 40, y: 30 }
  ]);
  const match = matchLinePathFrames(null, from, to, renderPoints);

  assert.equal(match.strategy, 'move-points');
  assert.equal(match.interpolate(0.5), 'M5,25L30,20');
});

test('adding and removing a keyed point use the same local path in reverse', () => {
  const fewer = frame([
    { key: 'A', x: 0, y: 0 },
    { key: 'C', x: 20, y: 20 }
  ]);
  const more = frame([
    { key: 'A', x: 0, y: 0 },
    { key: 'B', x: 10, y: 20 },
    { key: 'C', x: 20, y: 20 }
  ]);
  const add = matchLinePathFrames(null, fewer, more, renderPoints);
  const remove = matchLinePathFrames(null, more, fewer, renderPoints);

  assert.equal(add.strategy, 'add-points');
  assert.equal(remove.strategy, 'remove-points');
  assert.equal(add.interpolate(0.5), 'M0,0L10,15L20,20');
  for (const progress of [0, 0.17, 0.5, 0.83, 1]) {
    assert.equal(add.interpolate(progress), remove.interpolate(1 - progress));
  }
});

test('a shifted key window combines add and remove timing', () => {
  const first = frame([
    { key: 'A', x: 0, y: 10 },
    { key: 'B', x: 10, y: 20 },
    { key: 'C', x: 20, y: 30 }
  ]);
  const next = frame([
    { key: 'B', x: 0, y: 20 },
    { key: 'C', x: 10, y: 30 },
    { key: 'D', x: 20, y: 15 }
  ]);
  const forward = matchLinePathFrames(null, first, next, renderPoints);
  const reverse = matchLinePathFrames(null, next, first, renderPoints);

  assert.equal(forward.strategy, 'add-remove-points');
  assert.equal(reverse.strategy, 'add-remove-points');
  assert.equal(forward.interpolate(0.5), 'M0,12.857L5,20L15,30L20,19.286');
  for (const progress of [0, 0.17, 0.5, 0.83, 1]) {
    assert.equal(forward.interpolate(progress), reverse.interpolate(1 - progress));
  }
});

test('line zipper attaches in x order and accelerates into the aggregate path', () => {
  const aggregate = frame([
    { key: 'Q1|A', x: 0, y: 0 },
    { key: 'Q2|A', x: 10, y: 0 },
    { key: 'Q3|A', x: 20, y: 0 }
  ]);
  const series = frame([
    { key: 'Q1|A', x: 0, y: 12 },
    { key: 'Q2|A', x: 10, y: 12 },
    { key: 'Q3|A', x: 20, y: 12 }
  ]);
  const zipper = matchLineZipperFrames(aggregate, series, points => JSON.stringify(points));
  const mergeFrame = progress => JSON.parse(zipper.interpolate(1 - progress));
  const start = series.points;
  const slow = mergeFrame(0.2);
  const fast = mergeFrame(0.4);
  const middle = mergeFrame(0.6);

  assert.equal(zipper.strategy, 'zipper');
  assert.equal(start[0].y, 12);
  assert.ok(start[0].y - slow[0].y < slow[0].y - fast[0].y);
  assert.ok(middle[0].y < middle[1].y);
  assert.ok(middle[1].y <= middle[2].y);
  assert.equal(zipper.interpolate(0), aggregate.path);
  assert.equal(zipper.interpolate(1), series.path);
});
