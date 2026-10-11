import test from 'node:test';
import assert from 'node:assert/strict';
import { createColors } from '../dist/runtime/colors.js';
import { legendEntries } from '../dist/runtime/legend-layout.js';
import { visualizationWarnings, point } from '../dist/index.js';
const rows = Array.from({ length: 8 }, (_, i) => ({ group: `G${i}`, x: i, y: i + 1 }));
const channel = { field: 'group', type: 'nominal' };
const colors = createColors({}, (_, fallback) => fallback);

test('default keeps a color and legend entry for every category', () => {
  const scale = colors.colorScale(rows, channel);
  const values = rows.map(scale);
  assert.equal(new Set(values).size, 8);
  const entries = legendEntries(rows, channel);
  assert.deepEqual(entries.map(entry => entry.label), rows.map(row => row.group));
  assert.equal(rows.length, 8);
  assert.equal(legendEntries(rows.slice(0, 5), channel).length, 5);
});

test('explicit palettes and domain order keep all categories', () => {
  for (const palette of [{ scheme: 'Tableau10' }, { range: ['red', 'blue', 'green', 'cyan', 'pink', 'orange', 'black', 'gray'] }]) {
    const explicit = { ...channel, ...palette };
    assert.equal(legendEntries(rows, explicit).length, 8);
    assert.equal(new Set(rows.map(colors.colorScale(rows, explicit))).size, 8);
  }
  const ordered = { ...channel, domain: rows.map(row => row.group).reverse() };
  assert.deepEqual(legendEntries(rows, ordered).map(entry => entry.label), rows.map(row => row.group).reverse());
  const scale = colors.colorScale(rows, ordered);
  assert.notEqual(scale(rows[0]), scale(rows[2]));
});

test('registry colors preserve all categories and explicit schemes override the registry', () => {
  const registry = new Map([['group', new Map(rows.map((row, i) => [row.group, `rgb(${i},0,0)`]))]]);
  const registered = createColors({ colors: registry }, (_, fallback) => fallback);
  const scale = registered.colorScale(rows, channel);
  assert.equal(scale(rows[0]), 'rgb(0,0,0)');
  assert.notEqual(scale(rows[5]), scale(rows[7]));
  assert.notEqual(registered.colorScale(rows, { ...channel, scheme: 'Tableau10' })(rows[0]), 'rgb(0,0,0)');
});

test('all category names stay visible; continuous/composite colors stay explicit', () => {
  const data = [{ group: 'others' }, ...rows];
  const entries = legendEntries(data, channel);
  assert.equal(entries.length, 9);
  assert.equal(entries[0].label, 'others');
  const quantitative = { field: 'x', type: 'quantitative' };
  assert.ok(legendEntries(rows, quantitative).every(entry => entry.label !== 'G0'));
  const hue = { ...channel, domain: rows.map(row => row.group) };
  assert.equal(legendEntries(rows, hue).length, 8);
});

test('default grouped colors warn above five categories without changing the palette', async () => {
  const data = Array.from({ length: 12 }, (_, i) => ({ group: `G${i}`, x: i, y: i }));
  const warnings = await visualizationWarnings(point(data).x('x').y('y').color('group'));
  assert.deepEqual(warnings.map(item => item.code), ['color.too-many-categories']);
  assert.deepEqual(warnings[0].evidence, { count: 12, threshold: 5 });
});
