import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, BarState, barModule, inspectBarSpec } from '../dist/bar.js';
import { delta } from '../dist/visdelta.esm.js';
import { distributionRows } from '../dist/charts/bar/layout/distribution.js';
const segments = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
const options = { normalize: 'percent', negative: segments.slice(0, 2), neutral: 'Neutral', positive: segments.slice(3) };
const rows = ['A', 'B'].flatMap((question, index) => segments.map((response, i) => ({ question, response, count: [10,20,30,25,15][i] * (index + 1) })));
const base = bar(rows).x('question').y('count').breakdown('response').color('response');

test('Likert geometry preserves raw counts, one neutral, full denominator and explicit reading order', () => {
  const original = structuredClone(rows);
  const result = distributionRows(rows, 'question', 'response', 'count', 'diverging', options);
  assert.deepEqual(rows, original);
  for (const question of ['A', 'B']) {
    const group = result.filter(row => row.question === question);
    assert.equal(group.length, 5);
    assert.deepEqual(group.map(row => row.response), segments);
    assert.ok(Math.abs(group.reduce((sum, row) => sum + row.__stack1-row.__stack0, 0)-1) < 1e-12);
    const neutral = group.find(row => row.response === 'Neutral');
    assert.ok(Math.abs(neutral.__stack0 + .15) < 1e-12);
    assert.ok(Math.abs(neutral.__stack1 - .15) < 1e-12);
    assert.equal(neutral.__distributionShare, .3);
    assert.equal(neutral.count, question === 'A' ? 30 : 60);
  }
});

test('semantic distribution edits serialize, rehydrate, flip and clear without data or identity changes', async () => {
  const source = base.layout('stacked', {normalize:'percent', segments}).toSpec();
  const candidate = await barModule.edit(source, [{method:'layout', args:['diverging',options]}], source);
  assert.equal(inspectBarSpec(candidate).layout, 'diverging');
  const facts = inspectBarSpec(candidate);
  assert.deepEqual(facts.distribution, options);
  facts.distribution.negative.push('mutated');
  assert.deepEqual(inspectBarSpec(candidate).distribution, options);
  assert.deepEqual(delta(source,candidate).stateChanges, [{category:'layout',action:'rearrange'}]);
  const flipped = await barModule.edit(candidate, [{method:'flip',args:[]}],candidate);
  assert.equal(inspectBarSpec(flipped).orientation, 'horizontal');
  assert.equal(inspectBarSpec(new BarState(JSON.parse(JSON.stringify(flipped))).flip().toSpec()).layout,'diverging');
  const restored = await barModule.edit(flipped, [{method:'layout',args:['stacked',{normalize:'percent',segments}]}],flipped);
  for (const spec of [candidate,flipped,restored]) {
    assert.deepEqual(spec.data,source.data);
    assert.deepEqual(spec.transform,source.transform);
    assert.deepEqual(spec.meta.object,source.meta.object);
  }
  const grouped = new BarState(candidate).layout('grouped').toSpec();
  assert.equal(inspectBarSpec(grouped).layout, 'grouped');
  assert.equal(grouped.meta?.state?.sceneState?.detail?.offset,undefined);
  assert.deepEqual(delta(candidate, new BarState(candidate).layout('diverging',{...options,normalize:'none'})).stateChanges, [{category:'layout',action:'rearrange'}]);
  const batch = await barModule.edit(candidate,[{method:'layout',args:['grouped']},{method:'flip',args:[]}],candidate);
  assert.equal(inspectBarSpec(batch).layout,'grouped');
  assert.equal(inspectBarSpec(batch).orientation,'horizontal');
});

test('invalid distribution categories and counts fail with actionable errors', () => {
  for (const opts of [{...options,neutral:undefined},{...options,positive:['Neutral']},{...options,negative:[]},{...options,normalize:'yes'},{...options,segments}])
    assert.throws(()=>base.layout('diverging',opts),{code:'INVALID_EDIT_ARGUMENTS'});
  for (const input of [[], rows.slice(1), rows.map(r=>({...r,count:0})), rows.map((r,i)=>i? r:{...r,count:-1}), rows.map((r,i)=>i?r:{...r,count:null}), rows.map((r,i)=>i?r:{...r,response:'Unknown'})])
    assert.throws(()=>distributionRows(input,'question','response','count','diverging',options),{code:'INVALID_EDIT_ARGUMENTS'});
  assert.throws(()=>distributionRows([...rows,rows[0]],'question','response','count','diverging',options),/duplicate/);
});

test('distribution highlight and clear survive flip without changing counts, identity or normalization', async () => {
  for (const chart of [base.layout('stacked',{normalize:'percent',segments}),base.layout('diverging',options)]) {
    const source=chart.focus({question:'A'}).toSpec(), frozen=structuredClone(source);
    const edit=(spec,method,args)=>barModule.edit(spec,[{method,args}],spec);
    const highlighted=await edit(source,'highlight',[{response:'Strongly agree'}]);
    assert.deepEqual(delta(source,highlighted).stateChanges,[{category:'attention',action:'enter',target:'highlight'}]);
    const flipped=await edit(highlighted,'flip',[]);
    assert.deepEqual(flipped.meta.state.scopes.highlight,highlighted.meta.state.scopes.highlight);
    const cleared=await edit(flipped,'highlight',[null]);
    assert.deepEqual(delta(flipped,cleared).stateChanges,[{category:'attention',action:'exit',target:'highlight'}]);
    const repeated=await edit(cleared,'highlight',[{response:'Disagree'}]);
    assert.equal(repeated.meta.state.scopes.highlight.filters.length,1);
    assert.deepEqual(repeated.meta.state.scopes.focus,source.meta.state.scopes.focus);
    for(const value of [highlighted,flipped,cleared,repeated]) {
      assert.deepEqual(value.data,source.data);
      assert.deepEqual(value.transform,source.transform);
      assert.deepEqual(value.meta.object,source.meta.object);
      assert.deepEqual(inspectBarSpec(value).distribution,inspectBarSpec(source).distribution);
    }
    const direct = new BarState(highlighted).highlight(null).toSpec();
    assert.deepEqual(direct.meta.state.scopes.focus,source.meta.state.scopes.focus);
    assert.equal(direct.meta.state.scopes.highlight,null);
    const directAgain = new BarState(direct).highlight({response:'Agree'}).toSpec();
    assert.deepEqual(directAgain.meta.state.scopes.focus,source.meta.state.scopes.focus);
    assert.equal(directAgain.meta.state.scopes.highlight.filters.length,1);
    assert.deepEqual(highlighted.encoding,source.encoding);
    assert.deepEqual(cleared.encoding,flipped.encoding);
    assert.deepEqual(source,frozen);
    await assert.rejects(edit(source,'highlight',[{}]),{code:'INVALID_EDIT_ARGUMENTS'});
    await assert.rejects(edit(source,'highlight',[{response:null}]),{code:'INVALID_EDIT_ARGUMENTS'});
    const batch = await barModule.edit(source,[{method:'highlight',args:[{response:'Agree'}]},{method:'flip',args:[]}],source);
    assert.equal(inspectBarSpec(batch).orientation,'horizontal');
    assert.equal(batch.meta.state.scopes.highlight.filters[0].equal,'Agree');
  }
});

for (const [name, chart] of [['stacked',base], ['percent',base.layout('stacked',{normalize:'percent',segments})], ['diverging',base.layout('diverging',options)]]) {
  const cases = [
    ['color',[{method:'color',args:[{field:'response',type:'nominal',scheme:'Tableau10'}]}]],
    ['focus',[{method:'focus',args:[{question:'B'}]}]],
    ['sort',[{method:'sort',args:['question','descending']}]],
    ['where',[{method:'where',args:[{question:'B'}]}]],
    ['axis label',[{method:'x',args:['count',{label:'Responses'}]}]],
    ['color + highlight',[{method:'color',args:['#123456']},{method:'highlight',args:[{response:'Agree'}]}]],
    ['flip + highlight',[{method:'flip',args:[]},{method:'highlight',args:[{response:'Agree'}]}]],
  ];
  for (const [operation, calls] of cases) test(`${name} permits ${operation} with unchanged source and identity`,async()=>{
    const source=chart.flip().toSpec(), frozen=structuredClone(source);
    const result=await barModule.edit(source,calls,source);
    assert.deepEqual(source,frozen);
    assert.deepEqual(result.data,source.data);
    assert.deepEqual(result.meta.object,source.meta.object);
    if(!['sort','where'].includes(operation)) assert.deepEqual(result.transform,source.transform);
    const output=new BarState(result).rows();
    if(operation==='where') assert.deepEqual([...new Set(output.map(r=>r.question))],['B']);
    if(operation==='sort') assert.equal(output[0].question,'B');
    if(operation==='axis label') {assert.equal(result.encoding.x.label,'Responses');assert.equal(result.encoding.x.type,'quantitative');}
    if(inspectBarSpec(result).distribution) {
      const facts=inspectBarSpec(result);
      const projected=distributionRows(output,facts.categoryField,facts.segmentField,facts.measureField,facts.layout,facts.distribution);
      for(const row of projected) assert.equal(row.__distributionTotal,row.question==='A'?100:200);
    }
  });
}

test('distribution batches validate final membership and transformed fields atomically',async()=>{
  const source=base.layout('diverging',options).toSpec(), frozen=structuredClone(source);
  await assert.rejects(barModule.edit(source,[{method:'color',args:['#123456']},{method:'where',args:[{response:'Agree'}]}],source),{code:'INVALID_EDIT_ARGUMENTS',editIndex:1});
  await assert.rejects(barModule.edit(source,[{method:'flip',args:[]},{method:'x',args:['missing',{label:'Missing'}]}],source),{code:'MISSING_FIELD',editIndex:1});
  assert.deepEqual(source,frozen);
});
