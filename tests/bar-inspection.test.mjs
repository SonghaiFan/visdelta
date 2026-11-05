import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, BarState, inspectBarSpec } from '../dist/bar.js';

const rows = [
  { measure: 'revenue', product: 'Atlas', amount: 84 },
  { measure: 'revenue', product: 'Beacon', amount: 62 },
  { measure: 'revenue', product: 'Comet', amount: 96 },
  { measure: 'revenue', product: 'Drift', amount: 48 }
];
const base = bar(rows).x('measure').y('amount', { label: 'Revenue ($k)' }).breakdown('product').color('product');

test('public Bar inspection distinguishes layout from color and orientation', () => {
  for (const layout of ['stacked', 'grouped']) for (const horizontal of [false, true]) {
    const chart = base.layout(layout);
    const spec = (horizontal ? chart.flip() : chart).toSpec();
    const original = structuredClone(spec);
    const facts = inspectBarSpec(spec);
    assert.equal(facts.status, 'known');
    assert.equal(facts.layout, layout);
    assert.equal(facts.orientation, horizontal ? 'horizontal' : 'vertical');
    assert.equal(facts.offsetChannel, layout === 'grouped' ? (horizontal ? 'yOffset' : 'xOffset') : null);
    assert.equal(facts.categoryField, 'measure');
    assert.equal(facts.measureField, 'amount');
    assert.equal(facts.segmentField, 'product');
    assert.deepEqual(spec, original);
  }
  assert.equal(inspectBarSpec(bar(rows).x('product').y('amount').color('product').toSpec()).layout, 'simple');
});

test('Bar inspection does not guess with unresolved or contradictory channels', () => {
  assert.equal(inspectBarSpec({ mark: 'pie' }).status, 'unknown');
  assert.equal(inspectBarSpec({ mark: 'bar', encoding: { x: { field: 'a' }, y: { field: 'b' } } }).status, 'unknown');
  const horizontal = base.flip().toSpec();
  horizontal.encoding.xOffset = { field: 'product', type: 'nominal' };
  assert.equal(inspectBarSpec(horizontal).diagnostics[0].path, '/encoding/xOffset');
  const mismatch = base.layout('grouped').toSpec();
  mismatch.encoding.xOffset.field = 'other';
  assert.equal(inspectBarSpec(mismatch).status, 'unknown');
  const facts = inspectBarSpec({ ...base.toSpec(), data: { name: 'not-loaded' } });
  assert.equal(facts.layout, 'stacked', 'declaration facts do not claim data validity');
});

test('complete grouped JSON in reference docs is generated from the executable builder fixture', async () => {
  const { readFile } = await import('node:fs/promises');
  const { layouts } = await import('../examples/authoring/bar-layouts.mjs');
  for (const file of ['../dist/docs/reference.md', '../website/content/docs/charts/bar.mdx']) {
    const text = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const [title, name] of [['Vertical grouped', 'verticalGrouped'], ['Horizontal grouped', 'horizontalGrouped']]) {
      const section = text.slice(text.indexOf(`### ${title}`));
      const json = section.match(/```json\n([\s\S]*?)\n```/)[1];
      assert.deepEqual(JSON.parse(json), layouts[name].toSpec());
    }
  }
});

 test('serialized grouped Bars retain layout through flip without caller repair', () => {
  for (const horizontal of [false, true]) {
    const chart = base.layout('grouped');
    const source = JSON.parse(JSON.stringify((horizontal ? chart.flip() : chart).toSpec()));
    // Canonical offsets suffice even when optional scene metadata is absent.
    delete source.meta?.state;
    const result = new BarState(source).flip().toSpec();
    assert.equal(inspectBarSpec(result).layout, 'grouped');
    assert.equal(result.encoding[horizontal ? 'xOffset' : 'yOffset'].field, 'product');
    assert.equal(result.encoding[horizontal ? 'yOffset' : 'xOffset'], undefined);
    assert.deepEqual(result.transform, source.transform);
    assert.deepEqual(result.data, source.data);
  }
});
