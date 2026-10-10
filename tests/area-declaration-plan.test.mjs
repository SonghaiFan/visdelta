import test from 'node:test';
import assert from 'node:assert/strict';
import { area } from '../dist/area.js';
import { createAreaDeclarationOperationCodec } from '../dist/charts/area/declaration-operations.js';
import { planDeclarationTransition } from '../dist/grammar/declaration-plan.js';
import { serializeViewSpec } from '../dist/spec-meta.js';
const rows=[{id:'a',x:1,y:2,profit:4,series:'A'},{id:'b',x:1,y:3,profit:6,series:'B'},{id:'c',x:2,y:4,profit:8,series:'A'},{id:'d',x:2,y:5,profit:10,series:'B'}];
const base=()=>area(rows).datumKey('id').x('x').y('y');
const codec=createAreaDeclarationOperationCodec();
function verify(from,to,count){
 const source=serializeViewSpec(from),target=serializeViewSpec(to);
 const plan=planDeclarationTransition(from,to,codec);assert.equal(plan.status,'planned',plan.reason);assert.equal(plan.stages.length,count);
 for(const stage of plan.stages){
  assert.equal(codec.validate(stage.from).status,'ok');assert.equal(codec.validate(stage.to).status,'ok');
  const a=new Map(codec.decompose(stage.from).value.map(op=>[op.id,JSON.stringify(op)]));const b=new Map(codec.decompose(stage.to).value.map(op=>[op.id,JSON.stringify(op)]));
  assert.equal([...new Set([...a.keys(),...b.keys()])].filter(id=>a.get(id)!==b.get(id)).length,1);
 }
 const reverse=planDeclarationTransition(to,from,codec);assert.equal(reverse.status,'planned');
 assert.deepEqual(reverse.stages.map(s=>serializeViewSpec(s.to)),plan.stages.slice().reverse().map(s=>serializeViewSpec(s.from)));
 assert.deepEqual(planDeclarationTransition(from,to,codec),plan);
 assert.deepEqual(serializeViewSpec(from),source);assert.deepEqual(serializeViewSpec(to),target);return plan;
}
test('Area stream layout is independent of style and connection',()=>{
 const from=base().breakdown('series').toSpec();const to=base().breakdown('series').layout('stream',{offset:'silhouette',order:'reverse'}).color('#3366ff').connect('across').toSpec();
 const p=verify(from,to,3);assert.deepEqual(new Set(p.stages.map(s=>s.operation.id)),new Set(['__visdeltaAreaLayout','encoding/color','connect']));
});
test('Area summary measure source, reducer, and output alias are one Grain operation',()=>{
 const from=base().rollup().toSpec();const to=base().y('profit',{title:'Y'}).rollup({op:'mean',as:'average'}).color('#3366ff').toSpec();
 assert.equal(to.encoding.y.type,'quantitative');const p=verify(from,to,2);assert.deepEqual(new Set(p.stages.map(s=>s.operation.id)),new Set(['__visdeltaAreaTopology','encoding/color']));
});
test('Area raw y binding is Encoding and overridden calls disappear',()=>{
 const from=base().breakdown('series').toSpec();const to=base().breakdown('series').y('profit',{title:'Y'}).toSpec();const equivalent=base().breakdown('series').y('x').y('profit',{title:'Y'}).toSpec();
 const p=verify(from,to,1);assert.equal(p.stages[0].operation.id,'encoding/y');assert.deepEqual(planDeclarationTransition(from,equivalent,codec),p);
});
test('Area single unused series provenance and explicit stacked defaults normalize identically',()=>{
 const a=base().rollup().toSpec(),b=base().breakdown('series').rollup().toSpec();assert.deepEqual(codec.normalize(a),codec.normalize(b));
 const stacked=base().breakdown('series').toSpec(),explicit=base().breakdown('series').layout('stacked').toSpec();assert.deepEqual(codec.normalize(stacked),codec.normalize(explicit));
 assert.equal(planDeclarationTransition(a,b,codec).status,'direct');
});
test('Area validates actual transformed x-per-series uniqueness',()=>{
 const duplicate=area([...rows,rows[0]]).x('x').y('y').breakdown('series').toSpec();assert.match(codec.validate(duplicate).reason,/one x per series/);
 const single=base().toSpec();assert.match(codec.validate(single).reason,/one value per x/);
 const filtered=area([...rows,{...rows[0],y:100}]).x('x').y('y').where({field:'y',lt:10}).breakdown('series').toSpec();assert.equal(codec.validate(filtered).status,'ok');
});
test('Area unavailable aggregate outputs and unsafe metadata remain unsupported',()=>{
 const summary=base().rollup().toSpec();
 for(const mutate of [s=>{s.encoding.color={field:'series',type:'nominal'};},s=>{s.transform[0].aggregate.fields[0].as='x';},s=>{s.meta.state.sceneState.detail.stage='fake';},s=>{s.meta.object.key='profit';},s=>{s.transform.push({sort:{field:'series'}});},s=>{s.meta.state.scopes={focus:{field:'series',equal:'A'}};}]){const bad=structuredClone(summary);mutate(bad);assert.equal(codec.validate(bad).status,'unsupported');}
});
test('Area raw-summary topology explicitly keeps its native fallback',()=>{
 const from=base().rollup().toSpec(),to=base().breakdown('series').layout('stream').toSpec();const plan=planDeclarationTransition(from,to,codec);assert.equal(plan.status,'unsupported');assert.match(plan.reason,/native topology/);assert.deepEqual(plan.stages,[]);
});
test('Area full states preserve authored black and source identity',()=>{
 const p=verify(base().breakdown('series').toSpec(),base().breakdown('series').layout('stream').baseline(2).toSpec(),2);
 for(const stage of p.stages){assert.equal(stage.to.encoding.color,undefined);assert.equal(stage.to.meta.lineage.key,'id');assert.deepEqual(stage.to.meta.object.key,['x','series']);}
});

test('Area stream implicit defaults normalize to explicit authored defaults',()=>{
 const a=base().breakdown('series').layout('stream').toSpec();const b=structuredClone(a);delete b.meta.state.sceneState.detail.offset;delete b.meta.state.sceneState.detail.order;assert.deepEqual(codec.normalize(a),codec.normalize(b));assert.equal(planDeclarationTransition(a,b,codec).status,'direct');
});

test('Area focus exit prunes only the empty scope container and supports inverse paths',()=>{
 const focused=base().breakdown('series').focus({field:'x',equal:1}).toSpec();
 const plain=base().breakdown('series').toSpec();
 const p=verify(focused,plain,1);assert.equal(p.stages[0].operation.id,'meta/state/scopes/focus');assert.equal(p.stages[0].to.meta.state.scopes,undefined);
 verify(focused,base().breakdown('series').color('#3366ff').toSpec(),2);
});

test('Area raw finite measures allow an omitted y type but reject explicit nominal',()=>{
 const raw=area([{x:1,y:2},{x:2,y:4}]).x('x').y('y').toSpec();delete raw.encoding.y.type;
 assert.equal(codec.validate(raw).status,'ok');const nominal=structuredClone(raw);nominal.encoding.y.type='nominal';assert.equal(codec.validate(nominal).status,'unsupported');
});

test('Area ordinary custom mark key preserves source identity and independent color/attention edits',()=>{
 const raw=area([{id:'a',mark:'m1',x:1,y:2},{id:'b',mark:'m2',x:2,y:4}]).datumKey('id').key('mark').x('x').y('y');
 assert.equal(codec.validate(raw.toSpec()).status,'ok');
 const p=verify(raw.toSpec(),raw.color('#3366ff').focus({field:'x',equal:1}).toSpec(),2);
 for(const stage of p.stages){assert.equal(stage.to.meta.object.key,'mark');assert.equal(stage.to.meta.lineage.key,'id');}
});

test('Area renderer defaults normalize to omitted declarations and yield the same paths',()=>{
 const ordinary=area([{x:1,y:2},{x:2,y:4}]).x('x').y('y');
 for(const raw of [ordinary,base().breakdown('series'),base().rollup()]) {
  const from=raw.toSpec();const explicit=raw.connect('adjacent').baseline(0).curve('curveLinear').toSpec();
  assert.deepEqual(codec.normalize(from),codec.normalize(explicit));
  assert.equal(planDeclarationTransition(from,explicit,codec).status,'direct');
  const target=raw.color('#3366ff').toSpec();const explicitTarget=raw.connect('adjacent').baseline(0).curve('curveLinear').color('#3366ff').toSpec();
  assert.deepEqual(planDeclarationTransition(from,target,codec),planDeclarationTransition(explicit,explicitTarget,codec));
  const meaningful=raw.connect('across').baseline(3).curve('curveBasis').toSpec();
  const normalized=codec.normalize(meaningful);assert.equal(normalized.status,'ok');
  assert.equal(normalized.value.connect,'across');assert.equal(normalized.value.baseline,3);assert.equal(normalized.value.curve,'curveBasis');
 }
});
