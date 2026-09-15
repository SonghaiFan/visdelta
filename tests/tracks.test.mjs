import test from 'node:test';
import assert from 'node:assert/strict';
import * as d3 from 'd3';
import { createProgressController, directionalEase } from '../dist/runtime/tracks.js';
import { record } from '../dist/runtime/recorder.js';

// Recorded tracks touch nodes only through getAttribute/setAttribute and the
// style property bag, so a plain object stands in for an SVG element here.
function fakeNode(attrs = {}) {
  const attributes = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
  const styles = new Map();
  const node = {
    attributes,
    parent: { removed: [] },
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    style: {
      getPropertyValue: (name) => styles.get(name) ?? '',
      setProperty: (name, value) => styles.set(name, String(value)),
      removeProperty: (name) => styles.delete(name)
    },
    ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } }
  };
  node.parentNode = { removeChild: (child) => node.parent.removed.push(child) };
  return node;
}

function fakeSelection(nodes, data = nodes.map((_, i) => i)) {
  return {
    each(fn) { nodes.forEach((node, i) => fn.call(node, data[i], i, nodes)); },
    filter(predicate) {
      const kept = nodes.filter((node, i) => predicate.call(node, data[i], i, nodes));
      return fakeSelection(kept, kept.map((node) => data[nodes.indexOf(node)]));
    }
  };
}

const timing = (overrides = {}) => ({ time: 0, delay: 0, duration: 100, ease: (t) => t, ...overrides });
const x = (node) => Number(node.getAttribute('x'));

test('attr interpolates from the DOM value present when the track initializes, not when recorded', () => {
  const node = fakeNode({ x: 0 });
  const sink = [];
  record(fakeSelection([node]), sink, timing(), d3).attr('x', 100);
  node.setAttribute('x', 50); // a preceding write lands before compile
  const frame = createProgressController(sink).compile();
  frame.progress(0.5);
  assert.equal(x(node), 75);
  frame.progress(0);
  assert.equal(x(node), 50);
  frame.progress(1);
  assert.equal(x(node), 100);
});

test('chained transition() steps start where the previous one ends and take over the property', () => {
  const node = fakeNode({ x: 0 });
  const sink = [];
  record(fakeSelection([node]), sink, timing(), d3)
    .attr('x', 100)
    .transition()
    .attr('x', 0);
  const controller = createProgressController(sink);
  assert.equal(controller.span, 200);
  const frame = controller.compile();
  frame.progress(0.25); assert.equal(x(node), 50);
  frame.progress(0.5);  assert.equal(x(node), 100);
  frame.progress(0.75); assert.equal(x(node), 50);
  frame.progress(1);    assert.equal(x(node), 0);
  frame.progress(0.25); assert.equal(x(node), 50); // seeking back is history-free
});

test('per-datum delay staggers nodes; a delayed property rewinds to its t=0 value before its start', () => {
  const a = fakeNode({ x: 0 });
  const b = fakeNode({ x: 0 });
  const sink = [];
  record(fakeSelection([a, b]), sink, timing({ duration: 100 }), d3)
    .delay((d, i) => i * 100)
    .attr('x', 100);
  const frame = createProgressController(sink).compile();
  frame.progress(0.5); // 100ms: a done, b about to start
  assert.equal(x(a), 100);
  assert.equal(x(b), 0);
  frame.progress(0.75);
  assert.equal(x(b), 50);
  frame.progress(0.25);
  assert.equal(x(a), 50);
  assert.equal(x(b), 0);
});

test('remove() detaches only when the controller finishes, never while seeking', () => {
  const node = fakeNode({ x: 0 });
  const sink = [];
  record(fakeSelection([node]), sink, timing(), d3).style('opacity', 0).remove();
  const controller = createProgressController(sink);
  controller.progress(1);
  assert.equal(node.parent.removed.length, 0);
  controller.destroy({ finish: false });
  assert.equal(node.parent.removed.length, 0);

  const other = fakeNode({ x: 0 });
  const sink2 = [];
  record(fakeSelection([other]), sink2, timing(), d3).style('opacity', 0).remove();
  createProgressController(sink2).destroy({ finish: true });
  assert.deepEqual(other.parent.removed, [other]);
  assert.equal(other.style.getPropertyValue('opacity'), '0');
});

test('direction-aware easing picks the reverse profile only when seeking backward', () => {
  const node = fakeNode({ x: 0 });
  const sink = [];
  const ease = directionalEase((t) => t, (t) => t * t);
  record(fakeSelection([node]), sink, timing({ ease }), d3).attr('x', 100);
  const frame = createProgressController(sink).compile();
  frame.progress(0.5, 1);
  assert.equal(x(node), 50);
  frame.progress(0.5, -1);
  assert.equal(x(node), 25);
});

test('style() reads the inline style as its start and writes through setProperty', () => {
  const node = fakeNode();
  node.style.setProperty('opacity', '1');
  const sink = [];
  record(fakeSelection([node]), sink, timing(), d3).style('opacity', 0);
  createProgressController(sink).compile().progress(0.5);
  assert.equal(node.style.getPropertyValue('opacity'), '0.5');
});

test('event handlers are rejected: side effects cannot be sought', () => {
  const sink = [];
  const recorder = record(fakeSelection([fakeNode()]), sink, timing(), d3);
  assert.throws(() => recorder.on('end', () => {}), /do not seek/);
  assert.doesNotThrow(() => recorder.on('end', null));
});

test('a later recording of the same property at the same start overrides the earlier one, as a later attr() does in D3', () => {
  // (transform is left out: interpolateTransformSvg needs a DOM to parse it.)
  const node = fakeNode({ x: 0, 'text-anchor': 'middle' });
  const sink = [];
  record(fakeSelection([node]), sink, timing(), d3).attr('x', 100).attr('text-anchor', 'middle');
  record(fakeSelection([node]), sink, timing(), d3).attr('x', 200).attr('text-anchor', null);
  const frame = createProgressController(sink).compile();
  frame.progress(0.5);
  assert.equal(x(node), 100);                       // 0 → 200, not 0 → 100
  assert.equal(node.getAttribute('text-anchor'), null);
  frame.progress(1);
  assert.equal(x(node), 200);
  assert.equal(node.getAttribute('text-anchor'), null);
});
