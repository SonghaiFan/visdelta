import test from 'node:test';
import assert from 'node:assert/strict';
import { line } from '../dist/line.js';
import { createLineDeclarationOperationCodec } from '../dist/charts/line/declaration-operations.js';
import { planDeclarationTransition } from '../dist/grammar/declaration-plan.js';
import { selectTransitionRoute } from '../dist/charts/transition-route.js';
import { plugin } from '../dist/charts/line/plugin.js';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { serializeViewSpec } from '../dist/spec-meta.js';
const rows = [{x:1,y:2,profit:4,series:'A'}, {x:1,y:3,profit:6,series:'B'}, {x:2,y:4,profit:8,series:'A'}, {x:2,y:5,profit:10,series:'B'}];
const base = () => line(rows).x('x').y('y');
const codec = createLineDeclarationOperationCodec();
function verify(plan) {
  assert.equal(plan.status, 'planned', plan.reason);
  for (const stage of plan.stages) {
    assert.equal(codec.validate(stage.from).status, 'ok');
    assert.equal(codec.validate(stage.to).status, 'ok');
    const before = new Map(codec.decompose(stage.from).value.map(op => [op.id, JSON.stringify(op)]));
    const after = new Map(codec.decompose(stage.to).value.map(op => [op.id, JSON.stringify(op)]));
    assert.equal([...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id) !== after.get(id)).length, 1);
  }
}
test('Line summary measure changes form one Grain operation while appearance remains independent', () => {
  const from = base().rollup().toSpec();
  const to = base().y('profit',{title:'Y'}).rollup({op:'mean',as:'average'}).color('#3366ff').curve('curveBasis').toSpec();
  const original = [serializeViewSpec(from), serializeViewSpec(to)];
  const plan = planDeclarationTransition(from, to, codec); verify(plan);
  assert.equal(plan.stages.length, 3);
  assert.deepEqual(new Set(plan.stages.map(stage => stage.operation.id)), new Set(['__visdeltaLineTopology','encoding/color','curve']));
  const reverse = planDeclarationTransition(to, from, codec); verify(reverse);
  assert.deepEqual(reverse.stages.map(stage => serializeViewSpec(stage.to)), plan.stages.slice().reverse().map(stage => serializeViewSpec(stage.from)));
  assert.deepEqual(planDeclarationTransition(from,to,codec), plan);
  assert.deepEqual([serializeViewSpec(from),serializeViewSpec(to)], original);
});
test('Line raw/summary fallback retains its native zipper route', () => {
  const from = base().rollup().toSpec();
  const to = base().breakdown('series').color('#3366ff').toSpec();
  const selected = selectTransitionRoute(plugin.createChartType(DEFAULT_CHART_RUNTIME),from,to);
  assert.equal(planDeclarationTransition(from,to,codec).status,'unsupported');
  assert.equal(selected.planning,'authored');
  assert.equal(selected.legs.length,3);
  const intermediates = selected.legs.map(item => item.to.meta?.state?.sceneState?.detail?.stage).filter(Boolean);
  assert.deepEqual(intermediates,['zipper-attractor','zipper-preview']);
});
test('Line reducer and truthful output alias update remains one authored rollup operation', () => {
  const from = base().rollup().toSpec();
  const to = base().y('profit',{title:'Y'}).rollup({op:'mean',as:'average'}).toSpec();
  const plan=planDeclarationTransition(from,to,codec);verify(plan);
  assert.equal(plan.stages.length,1);
  assert.equal(plan.stages[0].operation.id,'__visdeltaLineTopology');
});
test('Line raw y remap stays an Encoding operation and overridden calls disappear', () => {
  const from=base().breakdown('series').toSpec();
  const to=base().breakdown('series').y('profit',{title:'Y'}).toSpec();
  const equivalent=base().breakdown('series').y('x').y('profit',{title:'Y'}).toSpec();
  const plan=planDeclarationTransition(from,to,codec);verify(plan);
  assert.equal(plan.stages.length,1);assert.equal(plan.stages[0].operation.id,'encoding/y');
  assert.deepEqual(planDeclarationTransition(from,equivalent,codec),plan);
});
test('Line unavailable fields and invalid aliases cannot become intermediate states', () => {
  const total=base().rollup().toSpec();
  for(const change of [spec=>{spec.encoding.color={field:'series',type:'nominal'};},spec=>{spec.transform[0].aggregate.fields[0].as='x';},spec=>{spec.transform[0].aggregate.fields[0].field='missing';},spec=>{spec.meta.state.sceneState.axis={unknown:1};}]) {
    const bad=structuredClone(total);change(bad);
    assert.equal(codec.validate(bad).status,'unsupported');
    assert.equal(planDeclarationTransition(total,bad,codec).status,'unsupported');
  }
});
test('Line validates transformed x-per-series uniqueness and complex declarations fall back',()=>{
  const duplicate=line([...rows,rows[0]]).x('x').y('y').breakdown('series').toSpec();
  assert.match(codec.validate(duplicate).reason,/one x per series/);
  const safe=base().breakdown('series').toSpec();
  const unsupported=structuredClone(safe);unsupported.transform=[{aggregate:{groupby:['x'],fields:[{op:'sum',field:'y',as:'y'}]}},{aggregate:{groupby:['x'],fields:[{op:'sum',field:'y',as:'y'}]}}];
  assert.match(codec.validate(unsupported).reason,/only one aggregate/);
  const custom=base().breakdown('series').key('profit').toSpec();assert.equal(codec.validate(custom).status,'unsupported');
  const runtime=structuredClone(safe);runtime.meta.state.sceneState.detail.stage='zipper-preview';assert.equal(codec.validate(runtime).status,'unsupported');
});
test('Line valid filtering is checked before unique observation validation',()=>{
  const data=[...rows,{...rows[0],y:100}];
  const from=line(data).x('x').y('y').where({field:'y',lt:10}).breakdown('series').toSpec();
  const to=line(data).x('x').y('y').where({field:'y',lt:10}).rollup().toSpec();
  assert.equal(codec.validate(from).status,'ok');
  assert.equal(codec.validate(to).status,'ok');
  assert.equal(planDeclarationTransition(from,to,codec).status,'unsupported');
});
test('Line ordinary color-derived series and explicit observation keys retain existing planner support',()=>{
  const from=base().key('profit').color('series').toSpec();
  const to=base().key('profit').color('series').focus({field:'series',equal:'A'}).pointSize(6).toSpec();
  const plan=planDeclarationTransition(from,to,codec);verify(plan);
  assert.equal(plan.stages.length,2);
  assert.deepEqual(new Set(plan.stages.map(stage=>stage.operation.id)),new Set(['meta/state/scopes/focus','pointSize']));
});
test('Line handwritten raw numeric states retain inferred quantitative channels without changing declarations',()=>{
  const from={mark:'line',data:[{x:1,y:2,group:'A'},{x:2,y:4,group:'B'}],encoding:{x:{field:'x'},y:{field:'y'},color:{value:'#ff0000'}}};
  const to={...from,encoding:{...from.encoding,color:{value:'#3366ff'}},meta:{state:{scopes:{highlight:{mode:'highlight',filters:[{field:'group',equal:'A'}]}}}}};
  const plan=planDeclarationTransition(from,to,codec);verify(plan);
  assert.deepEqual(plan.stages.at(-1).to,to);
  assert.equal(codec.validate({...from,encoding:{...from.encoding,y:{field:'y',type:'nominal'}}}).status,'unsupported');
  assert.equal(codec.validate({...from,data:[{x:1,y:'category'}]}).status,'unsupported');
});
test('Line omitted and explicit adjacent connection are the same state and add no filter waypoint',()=>{
  const from=line([{id:'A',x:1,y:2},{id:'B',x:2,y:4},{id:'C',x:3,y:6}]).x('x').y('y').key('id');
  for (const chart of [from,base().breakdown('series'),base().rollup()]) {
    assert.equal(planDeclarationTransition(chart.toSpec(),chart.connect('adjacent').curve('curveLinear').toSpec(),codec).status,'direct');
    const explicitAcross=planDeclarationTransition(chart.toSpec(),chart.connect('across').toSpec(),codec);
    verify(explicitAcross); assert.equal(explicitAcross.stages.length,1); assert.equal(explicitAcross.stages[0].operation.id,'connect');
  }
  for (const chart of [from.strokeWidth(3),from.pointSize(4.5)]) assert.equal(planDeclarationTransition(from.toSpec(),chart.toSpec(),codec).status,'planned');
  const filtered=from.where({field:'id',oneOf:['A','C']}).connect('adjacent').toSpec();
  const plan=planDeclarationTransition(from.toSpec(),filtered,codec);verify(plan);
  assert.equal(plan.stages.length,1);
  assert.equal(plan.stages[0].operation.next.sequence,'transform');
  const reverse=planDeclarationTransition(filtered,from.toSpec(),codec);verify(reverse);
  assert.deepEqual(reverse.stages.map(stage=>[stage.from,stage.to]),plan.stages.slice().reverse().map(stage=>[stage.to,stage.from]));
});
