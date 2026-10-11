import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, line, smallMultiples, delta, visualizationWarnings } from '../dist/index.js';
import { facetGroups } from '../dist/charts/facet.js';
const rows = [{ panel: 'A', x: 'one', y: 10 }, { panel: 'B', x: 'one', y: 30 }, { panel: 'A', x: 'two', y: 20 }];
test('native facets preserve data and keys while declaring encoding and layout separately', async () => {
  const base = bar(rows).x('x').y('y').key('x');
  const a = base.repeat('panel', { columns: 2 });
  const b = a.with({ facetLayout: { columns: 1 } });
  assert.deepEqual(a.rows(), rows);
  assert.equal(a.toSpec().encoding.facet.field, 'panel');
  assert.equal(base.toSpec().encoding.facet, undefined);
  assert.deepEqual(facetGroups(rows, 'panel').map(g => g.rows.length), [2, 1]);
  assert.ok(delta(a, b).stateChanges.some(c => c.category === 'layout' && c.action === 'rearrange'));
  assert.ok(delta(a, a.with({ encoding: { facet: { field: 'other' } } })).stateChanges.some(c => c.category === 'encoding' && c.action === 'remap'));
  const { plugin } = await a.chartModule().load();
  assert.equal(plugin.key, a.toSpec().mark);
});
test('facet partitions distinguish scalar types and reject missing fields or invalid geometry', () => {
  assert.equal(facetGroups([{ p: 1 }, { p: '1' }, { p: true }], 'p').length, 3);
  assert.throws(() => facetGroups([{ p: null }], 'p'), /every transformed row/);
  assert.throws(() => smallMultiples(bar(rows), 'panel', { columns: 0 }), /columns/);
  assert.throws(() => smallMultiples(bar(rows), 'panel', { gap: -1 }), /gap/);
  assert.throws(() => smallMultiples(bar(rows), 'panel', { minWidth: Infinity }), /minWidth/);
  assert.throws(() => smallMultiples(smallMultiples(bar(rows), 'panel'), 'x'), /Nested/);
});

test('facets inspect warnings per panel without changing source data', async () => {
  const data = ['A', 'B'].flatMap(panel => [{ panel, x: 'one', y: 1 }, { panel, x: 'two', y: 2 }]);
  const chart = line(data).x('x').y('y').key('x').repeat('panel');
  const warnings = await visualizationWarnings(chart);
  assert.equal(warnings.filter(w => w.code === 'connection.unordered-axis').length, 2);
  assert.ok(warnings.some(w => w.message.startsWith('A:')));
  assert.deepEqual(chart.rows(), data);
});

test('repeat is immutable, updates its authored slots, and supports subsequent chart edits', () => {
  const base = bar(rows).x('x').y('y').key('x');
  const a = base.repeat('panel', { columns: 2, gap: 30 });
  const b = a.repeat('x', { columns: 1 }).y('y', { domain: [0, 100] });
  assert.equal(base.toSpec().encoding.facet, undefined);
  assert.equal(a.toSpec().encoding.facet.field, 'panel');
  assert.equal(b.toSpec().encoding.facet.field, 'x');
  assert.deepEqual(b.toSpec().facetLayout, { columns: 1, gap: 30 });
  assert.deepEqual(b.toSpec().encoding.y.domain, [0, 100]);
  assert.equal(a.chartModule(), b.chartModule());
  assert.ok(delta(a, b).stateChanges.some(c => c.category === 'encoding' && c.action === 'remap'));
  assert.throws(() => base.repeat(''), /grouping field/);
  assert.throws(() => a.repeat('panel', { columns: 0 }), /columns/);
});

test('repeat direction is Layout while numeric sharing is Coordinate', () => {
  const a = bar(rows).x('x').y('y').key('x').repeat('panel', {direction:'y'});
  const b = a.repeat('panel', {scales:'independent'});
  const changes=delta(a,b).stateChanges;
  assert.ok(changes.some(c=>c.category==='coordinate' && c.action==='rescale' && c.channel==='y'));
  assert.ok(!changes.some(c=>c.category==='layout'));
  assert.ok(delta(a,a.repeat('panel',{direction:'x'})).stateChanges.some(c=>c.category==='layout' && c.action==='rearrange'));
  assert.throws(()=>a.repeat('panel',{direction:'diagonal'}),/direction/);
  assert.throws(()=>a.repeat('panel',{scales:'unknown'}),/scales/);
});

test('independent repeat scales warn without rewriting data or declared options', async()=>{
 const state=bar(rows).x('x').y('y').repeat('panel',{scales:'independent'});
 assert.ok((await visualizationWarnings(state)).some(w=>w.code==='bar.independent-repeat-scales'));
 assert.equal(state.toSpec().facetLayout.scales,'independent');assert.deepEqual(state.rows(),rows);
});


test('Line repeat retains native type, compiler and fluent syntax', async () => {
 const base=line(rows).x('x').y('y').key(['x','panel']).breakdown('panel').color('panel');
 const repeated=base.repeat('panel',{direction:'y'});
 assert.equal(repeated.toSpec().mark,'line');assert.equal(repeated.chartModule(),base.chartModule());
 assert.equal(repeated.curve('curveStep').toSpec().curve,'curveStep');
 assert.equal(base.toSpec().encoding.facet,undefined);
 assert.deepEqual(repeated.rows(),base.rows());
 assert.equal((await repeated.chartModule().load()).plugin.key,'line');
 assert.ok(delta(base,repeated).stateChanges.some(c=>c.category==='encoding'&&c.channel==='facet'));
 assert.ok(delta(repeated,repeated.repeat('panel',{direction:'x'})).stateChanges.some(c=>c.category==='layout'&&c.action==='rearrange'));
 assert.equal(smallMultiples(base,'panel').toSpec().mark,'line');
});

test('repeat height policy validates authored controls and classifies active layout changes', () => {
  const a = line(rows).x('x').y('y').repeat('panel');
  assert.throws(() => a.repeat('panel', { autoHeight: 'yes' }), /autoHeight/);
  assert.throws(() => a.repeat('panel', { minHeight: 0 }), /minHeight/);
  assert.throws(() => a.repeat('panel', { minHeight: Infinity }), /minHeight/);
  assert.ok(delta(a, a.repeat('panel', { autoHeight: true })).stateChanges.some(c => c.category === 'layout'));
  assert.ok(delta(a.repeat('panel', { autoHeight: true }), a.repeat('panel', { autoHeight: true, minHeight: 300 })).stateChanges.some(c => c.category === 'layout'));
  assert.equal(delta(a, a.repeat('panel', { minHeight: 300 })).stateChanges.length, 0);
});
