import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFrames } from '../dist/runtime/inspection.js';

function node(tagName, classes = [], parentElement = null) {
  const result = { tagName, parentElement, children: [], classList: Object.assign(classes, { contains: name => classes.includes(name) }), getAttribute: () => '1' };
  parentElement?.children.push(result);
  return result;
}

test('inspection retains real ancestry when seeking detaches a phase node', () => {
  const svg = node('svg');
  const axis = node('g', ['vd-axis', 'vd-x-axis'], svg);
  const tick = node('g', ['tick'], axis);
  const line = node('line', [], tick);
  const evaluator = {
    span: 1,
    recordings: [{ item: { node: line, duration: 1 }, start: 0, tweens: [{ name: 'x2' }] }],
    progress() { line.parentElement = null; },
  };
  const frame = { start: 0, end: 1, reverse: false, evaluator, dom: { restore() { line.parentElement = tick; } } };
  for (const reverse of [false, true]) {
    const property = inspectFrames([frame], reverse).stages[0].properties[0];
    assert.equal(line.parentElement, null);
    assert.deepEqual(property.ancestry, [
      { tag: 'svg', classes: [] }, { tag: 'g', classes: ['vd-axis', 'vd-x-axis'] },
      { tag: 'g', classes: ['tick'] }, { tag: 'line', classes: [] },
    ]);
    assert.equal(property.selector, 'svg:nth-of-type(1) > g:nth-of-type(1) > g:nth-of-type(1) > line:nth-of-type(1)');
  }
});

test('detached nodes do not produce a global tag ancestry', () => {
  const line = node('line');
  const result = inspectFrames([{ start: 0, end: 1, reverse: false, dom: { restore() {} }, evaluator: {
    span: 1, progress() {}, recordings: [{ item: { node: line, duration: 1 }, start: 0, tweens: [{ name: 'x2' }] }],
  } }], false);
  assert.deepEqual(result.stages[0].properties[0].ancestry, []);
});
