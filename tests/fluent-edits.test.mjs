import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, barModule } from '../dist/bar.js';
import { foldedBar } from './fixtures/folded-bar.mjs';
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

test('all built-in modules advertise and apply the bounded shared edits without losing authored state', async () => {
  const { states, sales } = await import('../examples/authoring/complete-states.mjs');
  for (const [name, builder] of Object.entries(states)) {
    const module = builder.chartModule();
    assert.ok(module.editMethods.includes('highlight'), name);
    const source = builder.toSpec(), frozen = structuredClone(source);
    const calls = [
      { method: 'color', args: [{ field: 'product', type: 'nominal', range: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] }] },
      { method: 'highlight', args: [{ product: 'Atlas' }] },
      { method: 'sort', args: ['revenue', 'descending'] },
      { method: 'where', args: [{ revenue: { gt: 6 } }] },
    ];
    const result = await module.edit(source, calls, { ...source, data: sales });
    const expected = builder.color(calls[0].args[0]).highlight({ product: 'Atlas' }).sort('revenue', 'descending').where({ revenue: { gt: 6 } }).toSpec();
    assert.deepEqual(result, expected, name);
    assert.deepEqual(source, frozen);
    const second = await module.edit(result, [{ method: 'highlight', args: [{ product: 'Birch' }] }], { ...result, data: sales });
    assert.equal(second.meta.state.scopes.highlight.filters.length, 2, name);
    await assert.rejects(module.edit(source, [{ method: 'color', args: [{ field: 'missing', type: 'nominal' }] }], { ...source, data: sales }));
  }
});

test('common edits reject unsupported methods and ambiguous colors with recovery fields', async () => {
  const { pie, pieModule } = await import('../dist/pie.js');
  const source = pie(rows).value('revenue').label('product').toSpec();
  await assert.rejects(pieModule.edit(source, [{ method: 'focus', args: [{ product: 'A' }] }], source), { code: 'UNSUPPORTED_EDIT', method: 'focus', chartType: 'pie' });
  for (const color of [{ value: 'red', field: 'product' }, { field: 'product' }, { field: 'revenue', type: 'quantitative', range: ['red', 'blue'] }]) {
    await assert.rejects(pieModule.edit(source, [{ method: 'color', args: [color] }], source), { code: 'INVALID_EDIT_ARGUMENTS', method: 'color' });
  }
  assert.equal((await pieModule.edit(source, [{ method: 'color', args: [{ value: 'red' }] }], source)).encoding.color.value, 'red');
});

test('null highlight in second edit identifies the exact selector and leaves source unchanged', async () => {
  const { pie, pieModule } = await import('../dist/pie.js');
  const source = pie(rows).value('profit').label('product').highlight({ product: 'A' }).toSpec();
  const before = structuredClone(source);
  await assert.rejects(pieModule.edit(source, [
    { method: 'where', args: [{ profit: { gte: 5 } }] },
    { method: 'highlight', args: [{ product: null }] },
  ], source), { code: 'INVALID_EDIT_ARGUMENTS', editIndex: 1, path: '/edits/1/args/0/product', method: 'highlight' });
  assert.deepEqual(source, before);
});

test('fold/aggregate Bar permits presentation batches without rewriting the pipeline', async () => {
  const { sales } = await import('../examples/authoring/complete-states.mjs');
  const builder = foldedBar.highlight({ product: 'Atlas' });
  const source = builder.toSpec(), frozen = structuredClone(source);
  const flip = [{ method: 'flip', args: [] }];
  const changed = await barModule.edit(source, flip, { ...source, data: sales });
  assert.deepEqual(changed, { ...source, encoding: { ...source.encoding, x: source.encoding.y, y: source.encoding.x } });
  assert.equal(changed.encoding.y.type, 'quantitative', 'horizontal input actually becomes vertical');
  assert.deepEqual(changed.transform, source.transform);
  assert.deepEqual(changed.meta.object, source.meta.object);
  assert.deepEqual(changed.meta.state.scopes, source.meta.state.scopes);
  assert.deepEqual(await barModule.edit(changed, flip, { ...changed, data: sales }), source);
  assert.deepEqual(await barModule.edit(source, [...flip, ...flip], { ...source, data: sales }), source);
  assert.deepEqual(source, frozen);
  const colored = await barModule.edit(source, [...flip, { method: 'color', args: ['#ff0000'] }], { ...source, data: sales });
  assert.deepEqual(colored.transform, source.transform);
  assert.equal(colored.encoding.color.value, '#ff0000');
  assert.deepEqual(colored.encoding.x, changed.encoding.x);
  await assert.rejects(barModule.edit(source, [{ method: 'flip', args: ['horizontal'] }], { ...source, data: sales }), { code: 'INVALID_EDIT_ARGUMENTS', editIndex: 0 });
});

test('Bar semantic layout edits preserve folded pipelines and follow flipped category axes', async () => {
  const { sales } = await import('../examples/authoring/complete-states.mjs');
  let spec = foldedBar.highlight({ product: 'Atlas' }).toSpec();
  const original = structuredClone(spec);
  const apply = async (method, args) => {
    const previous = structuredClone(spec);
    spec = await barModule.edit(spec, [{ method, args }], { ...spec, data: sales });
    assert.deepEqual(spec.data, previous.data);
    assert.deepEqual(spec.transform, previous.transform);
    assert.deepEqual(spec.meta.object, previous.meta.object);
    assert.deepEqual(spec.meta.state.scopes, previous.meta.state.scopes);
  };
  await apply('layout', ['grouped']);
  assert.equal(spec.encoding.yOffset.field, 'product');
  assert.equal(spec.encoding.xOffset, undefined);
  await apply('flip', []);
  assert.equal(spec.encoding.xOffset.field, 'product');
  assert.equal(spec.encoding.yOffset, undefined);
  await apply('layout', ['stacked']);
  assert.equal(spec.encoding.xOffset, undefined);
  await apply('flip', []);
  assert.deepEqual(spec, original);
  for (const args of [[], ['simple'], ['grouped', { unsupported: true }]]) {
    await assert.rejects(barModule.edit(spec, [{ method: 'layout', args }], { ...spec, data: sales }), { code: 'INVALID_EDIT_ARGUMENTS', method: 'layout', editIndex: 0 });
  }
  const batch = await barModule.edit(spec, [{ method: 'layout', args: ['grouped'] }, { method: 'flip', args: [] }], { ...spec, data: sales });
  assert.equal(batch.encoding.xOffset.field, 'product');
  assert.deepEqual(batch.transform, original.transform);
});

test('Bar color binds fields produced by a preserved fold pipeline',async()=>{
  const source=bar(rows).x('product').y('amount').with({transform:[{fold:{fields:['revenue','profit'],as:['measure','amount']}}]}).breakdown('measure').toSpec();
  const frozen=structuredClone(source);
  const result=await apply(source,'color',{field:'measure',type:'nominal',scheme:'Tableau10'});
  assert.equal(result.encoding.color.field,'measure');
  assert.deepEqual(result.transform,source.transform);
  assert.deepEqual(result.meta.object,source.meta.object);
  assert.deepEqual(source,frozen);
});
