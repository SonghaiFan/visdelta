import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('Likert layout preserves objects, shares, zero line and transactional failures', async t => {
  const bundle = await build({ stdin: { contents: `
    import { render, bar } from './dist/index.js';
    import { BarState } from './dist/bar.js';
    window.api = {render, bar, BarState};
  `, resolveDir: process.cwd() }, bundle: true, format: 'iife', write: false });
  const css = await readFile(new URL('../../dist/visdelta.css', import.meta.url));
  const server = createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/style.css"><div id="chart" style="width:640px"></div><div id="reference" style="width:640px"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.api);
  const result = await page.evaluate(async () => {
    const segments = ['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'];
    const options = {normalize:'percent',negative:segments.slice(0,2),neutral:'Neutral',positive:segments.slice(3)};
    const rows = ['A','B'].flatMap((question,index)=>segments.map((response,i)=>({question,response,count:[10,20,30,25,15][i]*(index+1)})));
    const base = api.bar(rows).x('question').y('count').breakdown('response').color('response').flip();
    const stacked = base.layout('stacked',{normalize:'percent',segments});
    const view = await api.render('#chart',stacked,{height:400});
    const read = () => [...document.querySelectorAll('#chart .vd-bar')].map(node=>({
      key:node.getAttribute('data-key'), x:+node.getAttribute('x'), width:+node.getAttribute('width'), row:node.__data__
    }));
    const initial = read();
    const message = {requestId:'diverge',baseRevision:0,edits:[{method:'layout',args:['diverging',options]}]};
    const preview = await view.previewEdit(message);
    const unchanged = view.snapshot().revision===0;
    const receipt = await view.edit(message,{duration:100});
    const actual = view.snapshot().spec;
    const marks = read();
    const zero = +document.querySelector('#chart .vd-bar-zero').getAttribute('x1');
    document.querySelector('#chart .vd-bar').dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));
    const tooltip = [...document.querySelectorAll('.vd-tooltip')].map(node=>node.textContent).join(' ');
    const rejectBefore = view.snapshot();
    const invalid = JSON.parse(JSON.stringify(actual));
    invalid.data[0].count = -1;
    let rejected;
    try { await view.update(invalid); } catch(error) { rejected = error.message; }
    const stable = view.snapshot().revision===rejectBefore.revision;
    const steps = [];
    for (const target of [new api.BarState(actual).flip(),stacked,base.layout('diverging',options)]) {
      await view.update(target,{duration:100});
      const reference = await api.render('#reference',target,{height:400});
      const axes = host=>[...document.querySelectorAll(`${host} .vd-axis`)].map(n=>n.textContent);
      steps.push({ghosts:document.querySelectorAll('#chart .vd-axis-ghost').length,actual:axes('#chart'),expected:axes('#reference'),keys:read().map(r=>r.key).sort()});
      reference.destroy();
    }
    const attention = [];
    for (const target of [stacked,base.layout('diverging',options)]) {
      await view.update(target,{animate:false});
      const baseline=view.snapshot();
      const message={requestId:`highlight-${baseline.revision}`,baseRevision:baseline.revision,edits:[{method:'highlight',args:[{response:'Strongly agree'}]}]};
      const proposed=await view.previewEdit(message);
      const untouched=view.snapshot().revision===baseline.revision;
      await view.edit(message,{duration:80});
      const capture=()=>[...document.querySelectorAll('#chart .vd-bar')].map(n=>({key:n.getAttribute('data-key'),opacity:+getComputedStyle(n).opacity,count:n.__data__.count,share:n.__data__.__distributionShare}));
      const lit=capture();
      const accepted=view.snapshot();
      await view.edit({requestId:`flip-lit-${accepted.revision}`,baseRevision:accepted.revision,edits:[{method:'flip',args:[]}]},{duration:80});
      const afterFlip=capture();
      const flipped=view.snapshot();
      await view.edit({requestId:`clear-lit-${flipped.revision}`,baseRevision:flipped.revision,edits:[{method:'highlight',args:[null]}]},{duration:80});
      attention.push({untouched,proposed:proposed.spec,accepted:accepted.spec,lit,afterFlip,cleared:capture(),ghosts:document.querySelectorAll('#chart .vd-axis-ghost').length});
    }
    const matrix=[];
    for(const target of [base,stacked,base.layout('diverging',options)]) {
      for(const edits of [
        [{method:'color',args:['#123456']}], [{method:'focus',args:[{question:'B'}]}],
        [{method:'sort',args:['question','descending']}], [{method:'where',args:[{question:'B'}]}],
        [{method:'x',args:['count',{label:'Responses'}]}],
        [{method:'color',args:['#123456']},{method:'highlight',args:[{response:'Agree'}]}],
        [{method:'flip',args:[]},{method:'highlight',args:[{response:'Agree'}]}],
      ]) {
        await view.update(target,{animate:false});
        const before=view.snapshot();
        const request={requestId:`matrix-${before.revision}`,baseRevision:before.revision,edits};
        const preview=await view.previewEdit(request);
        const stable=view.snapshot().revision===before.revision;
        await view.edit(request,{duration:40});
        const after=view.snapshot();
        const reference=await api.render('#reference',preview.spec,{height:400});
        const geometry=host=>[...document.querySelectorAll(`${host} .vd-bar`)].map(n=>({key:n.getAttribute('data-key'),x:n.getAttribute('x'),y:n.getAttribute('y'),width:n.getAttribute('width'),height:n.getAttribute('height'),fill:getComputedStyle(n).fill,opacity:getComputedStyle(n).opacity})).sort((a,b)=>a.key.localeCompare(b.key));
        matrix.push({stable,same:JSON.stringify(preview.spec)===JSON.stringify(after.spec),actual:geometry('#chart'),expected:geometry('#reference'),ghosts:document.querySelectorAll('#chart .vd-axis-ghost').length,rows:read().map(r=>r.row),filter:edits[0].method==='where'});
        reference.destroy();
      }
    }
    await view.update(stacked,{animate:false});
    const beforeBad=view.snapshot();
    let batchError;
    try { await view.edit({requestId:'invalid-subset',baseRevision:beforeBad.revision,edits:[{method:'color',args:['#123456']},{method:'where',args:[{response:'Agree'}]}]}); }
    catch(error) {batchError={code:error.code,index:error.editIndex};}
    const atomic=JSON.stringify(beforeBad)===JSON.stringify(view.snapshot());
    view.destroy();
    return {matrix,batchError,atomic,attention,initial,preview,actual,unchanged,receipt,marks,zero,tooltip,rejected,stable,steps};
  });
  assert.ok(result.unchanged);
  assert.equal(result.receipt.status,'applied');
  assert.deepEqual(result.preview.spec,result.actual);
  assert.equal(result.marks.length,10);
  assert.deepEqual(result.marks.map(r=>r.key).sort(),result.initial.map(r=>r.key).sort());
  for(const question of ['A','B']) {
    const group=result.marks.filter(r=>r.row.question===question);
    const neutral=group.find(r=>r.row.response==='Neutral');
    assert.ok(Math.abs(neutral.x+neutral.width/2-result.zero)<1e-6);
    assert.ok(group.filter(r=>r.row.response==='Strongly disagree'||r.row.response==='Disagree').every(r=>r.x+r.width<=result.zero));
    assert.ok(Math.abs(group.reduce((sum,r)=>sum+r.row.__stack1-r.row.__stack0,0)-1)<1e-12);
    assert.equal(neutral.row.count,question==='A'?30:60);
  }
  assert.match(result.tooltip,/Share of all responses/);
  assert.match(result.rejected,/nonnegative/);
  assert.ok(result.stable);
  for (const step of result.steps) {
    assert.equal(step.ghosts,0);
    assert.deepEqual(step.actual,step.expected);
    assert.deepEqual(step.keys,result.initial.map(r=>r.key).sort());
  }
  for(const state of result.attention) {
    assert.ok(state.untouched);
    assert.deepEqual(state.proposed,state.accepted);
    assert.equal(state.lit.length,10);
    assert.equal(state.lit.filter(mark=>mark.opacity===1).length,2);
    assert.equal(state.lit.filter(mark=>mark.opacity<1).length,8);
    assert.deepEqual(state.afterFlip,state.lit);
    assert.ok(state.cleared.every(mark=>mark.opacity===1));
    assert.deepEqual(state.cleared.map(({opacity,...mark})=>mark),state.lit.map(({opacity,...mark})=>mark));
    assert.equal(state.ghosts,0);
  }
  assert.equal(result.matrix.length,21);
  for(const state of result.matrix) {
    assert.ok(state.stable && state.same);
    assert.deepEqual(state.actual,state.expected);
    assert.equal(state.ghosts,0);
    assert.equal(state.rows.length,state.filter?5:10);
    for(const row of state.rows) if(row.__distributionTotal!==undefined) assert.equal(row.__distributionTotal,row.question==='A'?100:200);
  }
  assert.ok(result.atomic);
  assert.deepEqual(result.batchError,{code:'INVALID_EDIT_ARGUMENTS',index:1});
  assert.deepEqual(errors,[]);
});
