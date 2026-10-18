import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Test the actual functions shipped in the single-file page, not a copy of its
// scroll formula. The bounded region contains only the two exported functions.
const html = await readFile(new URL('../examples/templates/scroll-story.html', import.meta.url), 'utf8');
const source = html.split('// BEGIN SCROLL MAPPING')[1].split('// END SCROLL MAPPING')[0];
const { positionForScroll, scrollForPosition } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('measured, unequal scroll intervals hold a state then reach exact keyframes', () => {
  const anchors = [120, 520, 1420, 2020];
  assert.equal(positionForScroll(-500, anchors), 0);
  assert.equal(positionForScroll(120, anchors), 0);
  assert.equal(positionForScroll(290, anchors), 0);
  assert.equal(positionForScroll(300, anchors), 0);
  assert.ok(Math.abs(positionForScroll(410, anchors) - 0.5) < 1e-12);
  assert.equal(positionForScroll(520, anchors), 1);
  assert.equal(positionForScroll(900, anchors), 1);
  assert.equal(positionForScroll(1420, anchors), 2);
  assert.equal(positionForScroll(2020, anchors), 3);
  assert.equal(positionForScroll(9000, anchors), 3);
});

test('scroll and story positions round-trip in either direction without accumulated history', () => {
  const anchors = [37, 411, 1327, 2201];
  const positions = [0, 0.1, 0.5, 1, 1.5, 2, 2.9, 3, 2.5, 1, 0];
  for (const hold of [0, 0.45, 0.8]) {
    for (const value of positions) {
      assert.ok(Math.abs(positionForScroll(scrollForPosition(value, anchors, hold), anchors, hold) - value) < 1e-12);
    }
  }
  assert.equal(scrollForPosition(-1, anchors), anchors[0]);
  assert.equal(scrollForPosition(20, anchors), anchors.at(-1));
});

test('layout remeasurement changes the scroll coordinates without changing leg units', () => {
  const before = [100, 600, 1300];
  const after = [420, 1000, 2000];
  assert.notEqual(scrollForPosition(1.5, before), scrollForPosition(1.5, after));
  assert.equal(positionForScroll(scrollForPosition(1.5, after), after), 1.5);
  assert.deepEqual(before, [100, 600, 1300]);
  assert.deepEqual(after, [420, 1000, 2000]);
});

test('invalid anchors and hold fractions fail instead of producing NaN progress', () => {
  for (const anchors of [[], [1], [0, 0], [1, 0], [0, NaN], [0, Infinity]]) {
    assert.throws(() => positionForScroll(0, anchors));
    assert.throws(() => scrollForPosition(1, anchors));
  }
  for (const hold of [-1, 1, NaN, Infinity]) assert.throws(() => positionForScroll(0, [0, 100], hold));
  for (const p of [NaN, Infinity]) {
    assert.throws(() => positionForScroll(p, [0, 100]));
    assert.throws(() => scrollForPosition(p, [0, 100]));
  }
});
