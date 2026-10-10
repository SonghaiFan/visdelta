import test from 'node:test';
import assert from 'node:assert/strict';
import { area } from '../dist/index.js';
import { areaLayers, areaState, rankedAreaSeries } from '../dist/charts/area/state.js';
import { areaLayoutChannels } from '../dist/charts/area/style.js';
const rows = [
  { x: 1, group: 'Small', y: 1 }, { x: 1, group: 'Large', y: 20 }, { x: 1, group: 'Tie', y: 1 },
  { x: 2, group: 'Small', y: 8 }, { x: 2, group: 'Large', y: 2 }, { x: 2, group: 'Tie', y: 8 }
];
const chart = area(rows).x('x').y('y').breakdown('group').color('group');

test('default stacked area ranks whole-range totals, with stable ties and conserved boundaries', () => {
  const before = structuredClone(rows);
  const spec = chart.toSpec();
  const state = areaState(spec, spec.encoding);
  const layers = areaLayers(rows, 'x', 'y', state);
  assert.deepEqual(layers.map(layer => layer.value), ['Large', 'Small', 'Tie']);
  assert.deepEqual(layers[0].points.map(point => [point.y0, point.y1]), [[0, 20], [0, 2]]);
  assert.deepEqual(layers[2].points.map(point => point.y1), [22, 18]);
  assert.deepEqual(rows, before);
  assert.deepEqual(rankedAreaSeries(rows, 'group', 'y'), ['Large', 'Small', 'Tie']);
});

test('filtered geometry can retain the complete-domain ranking', () => {
  const spec = chart.toSpec();
  const layers = areaLayers(rows.filter(row => row.x === 2), 'x', 'y', areaState(spec, spec.encoding),
    row => String(row.x), rankedAreaSeries(rows, 'group', 'y'));
  assert.deepEqual(layers.map(layer => layer.value), ['Large', 'Small', 'Tie']);
  assert.equal(layers[0].points[0].y0, 0);
});

test('default area colors follow ranking while explicit domains and palettes retain their meaning', () => {
  const viewport = { width: 700, height: 400, rows };
  const spec = chart.toSpec();
  const before = structuredClone(spec);
  assert.deepEqual(areaLayoutChannels(spec, viewport).color.domain, ['Large', 'Small', 'Tie']);
  assert.deepEqual(spec, before);
  for (const options of [{ domain: ['Small', 'Large', 'Tie'] }, { scheme: 'Tableau10' }, { range: ['red', 'blue', 'green'] }]) {
    const authored = chart.color('group', options).toSpec();
    assert.deepEqual(areaLayoutChannels(authored, viewport), authored.encoding);
  }
  const uncolored = area(rows).x('x').y('y').breakdown('group').toSpec();
  assert.equal(areaLayoutChannels(uncolored, viewport).color, undefined);
});

test('explicit stream order with a fixed baseline preserves input order', () => {
  const spec = chart.layout('stream', { offset: 'none', order: 'none' }).toSpec();
  const layers = areaLayers(rows, 'x', 'y', areaState(spec, spec.encoding));
  assert.equal(layers.find(layer => layer.value === 'Small').points[0].y0, 0);
});

test('custom plugin presentation channels receive the same viewport rows used for layout', async () => {
  const { defineChartType } = await import('../dist/index.js');
  const viewport = { width: 600, height: 300, rows };
  let observed;
  const plugin = defineChartType({ key: 'ranked-presentation', renderer() {},
    layoutChannels: (_spec, dimensions) => {
      assert.equal(dimensions, viewport);
      return { color: { field: 'group', domain: rankedAreaSeries(dimensions.rows, 'group', 'y') } };
    }
  });
  const chart = plugin.createChartType({ layoutMargins: (encoding, dimensions) => {
    observed = { encoding, dimensions };
    return { top: 20, bottom: 20, left: 20, right: 20 };
  } });
  chart.defaultMargin({ mark: 'ranked-presentation' }, viewport);
  assert.equal(observed.dimensions, viewport);
  assert.deepEqual(observed.encoding.color.domain, ['Large', 'Small', 'Tie']);
});
