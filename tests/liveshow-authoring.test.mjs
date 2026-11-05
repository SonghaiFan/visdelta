import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, stringifySpec, visualizationWarnings } from '../dist/index.js';
import { pieSlices } from '../dist/charts/pie/geometry.js';
import { foldedBar } from './fixtures/folded-bar.mjs';
import { states, specs, sales } from '../examples/authoring/complete-states.mjs';

test('complete named declarations round-trip and validate with their real data', async () => {
  for (const [name, spec] of Object.entries(specs)) {
    assert.deepEqual(parseSpec(stringifySpec(spec)), spec, name);
    await visualizationWarnings(states[name].data(sales));
  }
  assert.equal(foldedBar.toSpec().encoding.detail.field, 'product');
  assert.deepEqual(foldedBar.toSpec().meta.object.key, ['measure', 'product']);
  assert.equal(foldedBar.rows(sales).reduce((sum, row) => sum + row.amount, 0), 45);
  assert.equal(foldedBar.rows(sales).length, 4);
});

test('Pie highlight retains the denominator; filtering changes it', () => {
  const base = states.pie.data(sales);
  const highlight = base.highlight({ product: 'Atlas' });
  const filtered = base.where({ product: 'Atlas' });
  const slices = state => pieSlices(state.rows(), state.toSpec());
  assert.deepEqual(slices(highlight).map(s => s.share), slices(base).map(s => s.share));
  assert.equal(slices(filtered)[0].share, 1);
  assert.equal(slices(base)[0].share, 18 / 45);
});

test('cross-type intent audit uses diffViewStates; remove, empty and all highlight differ', async () => {
  const { diffViewStates, delta } = await import('../dist/index.js');
  const source = states.bar.highlight({ product: 'Atlas' });
  const destination = states.pie;
  assert.throws(() => delta(source, destination), /same chart type/);
  assert.ok(diffViewStates(source, destination).hasDelta('highlight', 'remove'));
  const highlighted = destination.highlight({ product: 'Atlas' });
  const cleared = highlighted.with({ scopes: { highlight: null } });
  assert.ok(diffViewStates(highlighted, cleared).hasDelta('highlight', 'remove'));
  const empty = destination.with({ scopes: { highlight: { mode: 'highlight', filters: [] } } });
  assert.ok(diffViewStates(highlighted, empty).hasDelta('highlight', 'change'));
  const all = destination.highlight({ product: sales.map(row => row.product) });
  assert.ok(diffViewStates(highlighted, all).hasDelta('highlight', 'change'));
  assert.notDeepEqual(empty.toSpec(), cleared.toSpec());
  assert.notDeepEqual(all.toSpec(), cleared.toSpec());
  const json = highlighted.toSpec();
  delete json.meta.state.scopes.highlight;
  assert.ok(diffViewStates(highlighted, json).hasDelta('highlight', 'remove'));
});

test('preserved extension metadata is not recognized attention', async () => {
  const { diffViewStates } = await import('../dist/index.js');
  const before = states.pie.toSpec();
  const misplaced = structuredClone(before);
  misplaced.meta.object.state = { scopes: { highlight: { mode: 'highlight', filters: [] } } };
  const transported = parseSpec(stringifySpec(misplaced));
  assert.deepEqual(transported.meta.object.state, misplaced.meta.object.state);
  assert.equal(diffViewStates(before, transported).hasDelta('highlight'), false);
});
