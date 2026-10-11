import test from 'node:test';
import assert from 'node:assert/strict';
import { area, delta } from '../dist/index.js';
import { createAreaDeclarationOperationCodec } from '../dist/charts/area/declaration-operations.js';
import { planDeclarationTransition } from '../dist/core.js';
const rows = [1, 2, 3].flatMap(x => ['A', 'B'].map(series => ({ x, y: 10, series })));
const base = area(rows).x('x').y('y').breakdown('series').color('series');
test('Area labels are immutable Appearance controls and validate their supported positions', () => {
  assert.equal(base.toSpec().labels, undefined);
  assert.equal(base.labels('inside').toSpec().labels, 'inside');
  assert.equal(base.labels('inside').labels('none').toSpec().labels, 'none');
  assert.throws(() => base.labels('outside'), /inside or none/);
  assert.deepEqual(delta(base, base.labels('inside')).stateChanges, [
    { category: 'appearance', action: 'restyle', property: 'labels' }
  ]);
});
test('Area label slots round-trip and plan independently without changing data or colors', () => {
  const codec = createAreaDeclarationOperationCodec();
  const a = base.toSpec(), b = base.labels('inside').toSpec();
  const before = structuredClone([a,b]);
  for (const spec of [a,b,base.labels('none').toSpec()]) {
    const normalized = codec.normalize(spec);
    assert.equal(normalized.status, 'ok');
    assert.deepEqual(codec.normalize(normalized.value), normalized);
    const ops = codec.decompose(normalized.value);
    assert.equal(ops.status, 'ok');
    assert.deepEqual(codec.evaluate(normalized.value, ops.value), normalized);
  }
  const plan = planDeclarationTransition(a,b,codec);
  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.stages.map(s => s.operation.id), ['labels']);
  assert.deepEqual(planDeclarationTransition(a,b,codec), plan);
  const reverse = planDeclarationTransition(b,a,codec);
  assert.equal(reverse.status, 'planned');
  assert.deepEqual(reverse.stages.map(s => s.operation.id), ['labels']);
  assert.deepEqual(plan.stages.at(-1).to, codec.normalize(b).value);
  assert.deepEqual(reverse.stages.at(-1).to, codec.normalize(a).value);
  for (const stage of plan.stages) {
    assert.equal(codec.validate(stage.to).status, 'ok');
    assert.deepEqual(codec.evaluate(stage.to, codec.decompose(stage.to).value).value, stage.to);
    assert.deepEqual(stage.to.encoding.color, b.encoding.color);
  }
  assert.deepEqual(codec.normalize(base.labels('none').toSpec()), codec.normalize(a));
  assert.deepEqual([a,b], before);
  assert.equal(codec.validate({...b, labels: 'outside'}).status, 'unsupported');
});
