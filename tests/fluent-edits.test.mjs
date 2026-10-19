import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, barModule } from '../dist/bar.js';
const rows = [{ product: 'A', revenue: 12, profit: 3 }, { product: 'B', revenue: 20, profit: 8 }];
const base = () => bar(rows).x('product').y('revenue');
const apply = (spec, method, ...args) => barModule.edit(spec, [{ method, args }], spec);

test('Bar fluent edits preserve chains, identity, scopes, margins and caller input', async () => {
  const source = base().toSpec();
  const frozen = structuredClone(source);
  const flipped = await apply(source, 'flip');
  assert.deepEqual(flipped, base().flip().toSpec());
  assert.deepEqual(await apply(flipped, 'flip'), source);
  const remapped = await apply(source, 'y', 'profit');
  assert.deepEqual(remapped, base().y('profit').toSpec());
  const highlighted = await apply(source, 'highlight', { product: 'A' });
  assert.deepEqual(await apply(highlighted, 'highlight', { product: 'B' }), base().highlight({ product: 'A' }).highlight({ product: 'B' }).toSpec());
  const horizontalProfit = await apply(flipped, 'x', 'profit', { type: 'quantitative' });
  assert.equal(horizontalProfit.encoding.x.field, 'profit');
  assert.equal(horizontalProfit.encoding.y.field, 'product');
  assert.equal(horizontalProfit.meta.object.semantic.measure.value, 'profit');
  assert.deepEqual((await apply(highlighted, 'color', '#4269d0')).meta.state, highlighted.meta.state);
  const margin = { ...source, margin: { left: 48 } };
  assert.deepEqual((await apply(margin, 'color', '#4269d0')).margin, margin.margin);
  assert.deepEqual(source, frozen);
});

test('Bar fluent edits reject unsupported calls and invalid complete states atomically', async () => {
  const source = base().toSpec();
  for (const [method, args] of [['title', ['Caption']], ['subtitle', ['Source']], ['constructor', []], ['flip', [true]], ['y', ['missing']], ['x', ['revenue', { type: 'quantitative' }]], ['rollup', []]]) {
    await assert.rejects(apply(source, method, ...args));
  }
  await assert.rejects(barModule.edit(source, [{ method: 'color', args: ['red'] }, { method: 'unknown', args: [] }], source));
  assert.deepEqual(source, base().toSpec());
});

test('fluent messages require complete JSON, bounded batches and explicit revisions', async () => {
  const { parseEdit, editJSON } = await import('../dist/fluent-edits.js');
  const message = { requestId: 'one', baseRevision: 0, edits: [{ method: 'flip', args: [] }] };
  assert.deepEqual(parseEdit(JSON.stringify(message)), message);
  assert.equal(editJSON(message), editJSON({ edits: message.edits, baseRevision: 0, requestId: 'one' }));
  for (const input of ['{', {}, { ...message, baseRevision: -1 }, { ...message, baseRevision: 1.5 },
    { ...message, requestId: '' }, { ...message, extra: true }, { ...message, edits: [] },
    { ...message, edits: Array(33).fill(message.edits[0]) }, { ...message, edits: [{ method: 'flip' }] },
    { ...message, edits: [{ method: 'title', args: [() => 'unsafe'] }] }]) {
    assert.throws(() => parseEdit(input));
  }
});


test('hand-written JSON reconstructs derived identity without inventing an authored key', async () => {
  const raw = { mark: 'bar', data: rows, encoding: { x: { field: 'product', type: 'nominal' }, y: { field: 'revenue', type: 'quantitative' } } };
  const flipped = await apply(raw, 'flip');
  assert.equal(flipped.encoding.x.field, 'revenue');
  const profit = await apply(flipped, 'x', 'profit', { type: 'quantitative' });
  assert.equal(profit.meta.object.semantic.measure.value, 'profit');
  assert.equal(profit.meta.object.key, undefined);
  assert.equal(raw.meta, undefined);
});
