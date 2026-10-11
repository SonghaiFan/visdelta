import { test, expect } from '@playwright/test';
test('stack segments move continuously to repeated baselines and restore both independently rendered endpoints', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { bar } = await import('/dist/bar.js');
    const { transition } = await import('/dist/transition-entry.js');
    const rows = ['A','B','C','D'].flatMap((label,i) => ['Core','Growth','Services'].map((part,j) => ({label,part,value: 80-i*10-j*20})));
    const a = bar(rows).x('label').y('value').key(['label','part']).breakdown('part').color('part');
    const b = a.repeat('part',{direction:'y',scales:'shared'});
    const host = document.querySelector('#chart');
    const snapshot = container => [...container.querySelectorAll('rect.vd-bar')].map(n => {
      const matrix = n.getCTM(); const point = new DOMPoint(+n.getAttribute('x'),+n.getAttribute('y')).matrixTransform(matrix);
      return {key:n.dataset.key,x:point.x,y:point.y,width:+n.getAttribute('width')*matrix.a,height:+n.getAttribute('height')*matrix.d,fill:n.getAttribute('fill')};
    }).sort((a,b)=>a.key.localeCompare(b.key));
    const other = document.createElement('div'); other.style.width=`${host.clientWidth}px`; document.body.append(other);
    const sa = await transition(a,a,{target:other,height:740}); sa.progress(1); const expectedA=snapshot(other);sa.destroy();
    const sb = await transition(b,b,{target:other,height:740}); sb.progress(1); const expectedB=snapshot(other);sb.destroy();other.remove();
    globalThis.repeatMotion = await transition(a,b,{target:host,height:740});
    repeatMotion.progress(0);const start=snapshot(host);
    repeatMotion.progress(0.001);const nearStart=snapshot(host);
    const phases = repeatMotion.view.__visDeltaScene.seekSequence?.phases;
    if (phases && phases.length !== 1) throw Error('Repeat bridge should own one route leg');
    const phase = phases?.[0] ?? {start:0,end:1};
    const seekLocal = p => repeatMotion.progress(phase.start + p * (phase.end - phase.start));
    seekLocal(0.25); const firstStage=snapshot(host);
    seekLocal(0.75); const secondStage=snapshot(host);
    seekLocal(0.5);const middle=snapshot(host);
    if(host.querySelectorAll('.vd-y-label').length!==1 || host.querySelectorAll('.vd-x-label').length!==1) throw Error('Repeat duplicated shared axis titles');
    repeatMotion.progress(0.999);const nearEnd=snapshot(host);
    repeatMotion.progress(1);const end=snapshot(host);
    repeatMotion.progress(0);const restored=snapshot(host);
    const wait=async value=>{const deadline=performance.now()+5000;while(repeatMotion.value!==value&&performance.now()<deadline)await new Promise(requestAnimationFrame);if(repeatMotion.value!==value)throw Error('Repeat play did not finish');};
    repeatMotion.play({from:0,to:1,duration:100});await wait(1);const forward=snapshot(host);
    repeatMotion.play({from:1,to:0,duration:100});await wait(0);const reverse=snapshot(host);
    repeatMotion.destroy();
    const backward=await transition(b,a,{target:host,height:740});backward.progress(0.5);const backwardMiddle=snapshot(host);backward.progress(1);const backwardEnd=snapshot(host);backward.destroy();
    return {firstStage,secondStage,start,nearStart,middle,nearEnd,end,restored,forward,reverse,expectedA,expectedB,backwardMiddle,backwardEnd};
  });
  expect(result.start).toEqual(result.expectedA);expect(result.end).toEqual(result.expectedB);
  expect(result.restored).toEqual(result.start);expect(result.forward).toEqual(result.end);expect(result.reverse).toEqual(result.start);expect(result.backwardEnd).toEqual(result.start);
  expect(result.middle).not.toEqual(result.start);expect(result.middle).not.toEqual(result.end);
  for(let i=0;i<result.start.length;i++) {
    expect(result.firstStage[i].y).toBeCloseTo(result.start[i].y,4);
    expect(result.firstStage[i].height).toBeCloseTo(result.start[i].height,4);
    expect(result.secondStage[i].x).toBeCloseTo(result.end[i].x,4);
    expect(result.secondStage[i].width).toBeCloseTo(result.end[i].width,4);
    for(const field of ['x','y','width','height']) {
      expect(Math.abs(result.nearStart[i][field]-result.start[i][field])).toBeLessThan(2);
      expect(Math.abs(result.nearEnd[i][field]-result.end[i][field])).toBeLessThan(2);
      expect(result.middle[i][field]).toBeCloseTo(['x','width'].includes(field)?result.end[i][field]:result.start[i][field],4);
      expect(result.backwardMiddle[i][field]).toBeCloseTo(result.middle[i][field],4);
    }
  }
});

test('repeat directions preserve category positions and independent numeric scales are configurable', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result=await page.evaluate(async()=>{
    const {bar}=await import('/dist/bar.js');const {transition}=await import('/dist/transition-entry.js');
    const rows=['A','B'].flatMap((label,i)=>['Core','Growth','Services'].map((part,j)=>({label,part,value:(3-j)*20-i*5})));
    const base=bar(rows).x('label').y('value').key(['label','part']).breakdown('part').color('part');
    const results=[];
    for(const direction of ['y','x','grid']) for(const scales of ['shared','independent']) {
      const state=base.repeat('part',{direction,scales,minWidth:180});
      const motion=await transition(base,state,{target:'#chart',height:740});motion.progress(1);
      const panels=[...document.querySelectorAll('.vd-facet-panel')];
      results.push({direction,scales, translations:panels.map(p=>{const m=p.transform.baseVal.consolidate()?.matrix;return{x:m?.e??0,y:m?.f??0};}),heights:panels.map(p=>+p.querySelector('.vd-bar').getAttribute('height')),ticks:panels.map(p=>[...p.querySelectorAll('.vd-facet-y-axis .tick text')].map(n=>n.textContent))});
      motion.progress(0.5); if(/NaN|Infinity/.test(document.querySelector('#chart').innerHTML))throw Error('Invalid repeat geometry');motion.destroy();
    }
    return results;
  });
  for(const row of result) {
    if(row.direction==='y')expect(row.translations.every(p=>p.x===0)).toBe(true);
    if(row.direction==='x')expect(row.translations.every(p=>p.y===0)).toBe(true);
    if(row.scales==='shared')expect(row.ticks.every(t=>JSON.stringify(t)===JSON.stringify(row.ticks[0]))).toBe(true);
    if(row.scales==='independent')expect(new Set(row.ticks.map(t=>JSON.stringify(t))).size).toBeGreaterThan(1);
  }
  const shared=result.find(r=>r.direction==='y'&&r.scales==='shared');
  const independent=result.find(r=>r.direction==='y'&&r.scales==='independent');
  expect(shared.heights[0]).toBeGreaterThan(shared.heights[2]);
  expect(independent.heights[0]).toBeCloseTo(independent.heights[2],3);
});

test('coordinate stages isolate x/width from y/height, reverse frames and resized endpoints', async ({page}) => {
  await page.goto('/tests/fixtures/isolated.html');
  const results=await page.evaluate(async()=>{
    const {bar}=await import('/dist/bar.js');const {transition}=await import('/dist/transition-entry.js');
    const rows=['A','B'].flatMap((label,i)=>['Core','Growth'].map((part,j)=>({label,part,value:j? -12-i*3:30-i*5})));
    const host=document.querySelector('#chart');
    const snapshot=()=>[...host.querySelectorAll('rect.vd-bar')].map(n=>{const m=n.getCTM();const p=new DOMPoint(+n.getAttribute('x'),+n.getAttribute('y')).matrixTransform(m);return{key:n.dataset.key,x:p.x,y:p.y,width:+n.getAttribute('width')*m.a,height:+n.getAttribute('height')*m.d,negative:n.__data__.value<0};}).sort((a,b)=>a.key.localeCompare(b.key));
    const results=[];
    for(const horizontal of [false,true])for(const direction of ['x','y','grid'])for(const scales of ['shared','independent']) {
      let a=bar(rows).x('label').y('value').key(['label','part']).breakdown('part').color('part');if(horizontal)a=a.flip();
      const b=a.repeat('part',{direction,scales,minWidth:180});
      const motion=await transition(a,b,{target:host,height:740});
      const phase=motion.view.__visDeltaScene.seekSequence?.phases?.[0]??{start:0,end:1};
      const seek=p=>motion.progress(phase.start+p*(phase.end-phase.start));
      const frames=[0,.25,.5,.75,1].map(p=>{seek(p);return snapshot();});
      const samples=[.15,.5,.85].map(p=>{seek(p);return snapshot();});motion.destroy();
      const back=await transition(b,a,{target:host,height:740});
      const reverse=[.15,.5,.85].map(p=>{back.progress(1-p);return snapshot();});back.destroy();
      results.push({horizontal,direction,scales,frames,samples,reverse});
    }
    const a=bar(rows).x('label').y('value').key(['label','part']).breakdown('part').color('part');const b=a.repeat('part',{direction:'y'});
    const motion=await transition(a,b,{target:host,height:740});motion.progress(.5);host.style.width='540px';motion.resize();
    motion.progress(0);const resizedA=snapshot();motion.progress(1);const resizedB=snapshot();motion.progress(0);const restored=snapshot();motion.destroy();
    const sa=await transition(a,a,{target:host,height:740});sa.progress(1);const staticA=snapshot();sa.destroy();const sb=await transition(b,b,{target:host,height:740});sb.progress(1);const staticB=snapshot();sb.destroy();
    return {results,resizedA,resizedB,restored,staticA,staticB};
  });
  for(const {horizontal,direction,frames,samples,reverse} of results.results) {
    for(let i=0;i<frames[0].length;i++) {
      const [flat,first,second,scaling,panel]=frames.map(f=>f[i]);
      const firstAttrs = horizontal ? ['y','height'] : ['x','width'];
      for(const attr of ['x','y','width','height']) {
        if(!firstAttrs.includes(attr)) expect(first[attr]).toBeCloseTo(flat[attr],5);
        expect(second[attr]).toBeCloseTo(firstAttrs.includes(attr)?panel[attr]:flat[attr],5);
        if(firstAttrs.includes(attr))expect(scaling[attr]).toBeCloseTo(panel[attr],5);
      }
    }
    for(let p=0;p<samples.length;p++)for(let i=0;i<samples[p].length;i++)for(const attr of ['x','y','width','height'])expect(reverse[p][i][attr]).toBeCloseTo(samples[p][i][attr],5);
  }
  expect(results.resizedA).toEqual(results.staticA);expect(results.resizedB).toEqual(results.staticB);expect(results.restored).toEqual(results.staticA);
});

test('repeated Bar flip preserves authored staged coordinate order', async ({page})=>{
  await page.goto('/tests/fixtures/isolated.html');
  const result=await page.evaluate(async()=>{
    const {bar}=await import('/dist/bar.js');const {transition}=await import('/dist/transition-entry.js');
    const rows=['A','B'].flatMap((label,i)=>['Core','Growth'].map((part,j)=>({label,part,value:20+i*10+j*5})));
    const base=bar(rows).x('label').y('value').key(['label','part']).breakdown('part').color('part').repeat('part',{direction:'y'});
    const snapshot=()=>[...document.querySelectorAll('#chart rect.vd-bar')].map(n=>({key:n.dataset.key,...Object.fromEntries(['x','y','width','height'].map(k=>[k,+n.getAttribute(k)]))})).sort((a,b)=>a.key.localeCompare(b.key));
    const results=[];
    for(const horizontal of [false,true])for(const order of [['x','y'],['y','x']]){
      const a=horizontal?base.flip():base;
      const b=horizontal?a.axis({orientation:'vertical',order}):a.flip({order});const motion=await transition(a,b,{target:'#chart',height:740});
      const phase=motion.view.__visDeltaScene.seekSequence?.phases?.[0]??{start:0,end:1};
      const frames=[0,.25,.5,.75,1].map(p=>{motion.progress(phase.start+p*(phase.end-phase.start));return snapshot();});
      async function wait(value){const deadline=performance.now()+5000;while(motion.value!==value&&performance.now()<deadline)await new Promise(requestAnimationFrame);if(motion.value!==value)throw new Error('Repeated flip did not finish');}
      motion.play({from:0,to:1,duration:100});await wait(1);const played=snapshot();
      motion.play({from:1,to:0,duration:100});await wait(0);const restored=snapshot();motion.destroy();
      const staticB=await transition(b,b,{target:'#chart',height:740});staticB.progress(1);const endpoint=snapshot();staticB.destroy();
      const back=await transition(b,a,{target:'#chart',height:740});
      const reversePhase=back.view.__visDeltaScene.seekSequence?.phases?.[0]??{start:0,end:1};
      const reverse=[.25,.5,.75].map(p=>{back.progress(reversePhase.start+(1-p)*(reversePhase.end-reversePhase.start));return snapshot();});back.destroy();
      results.push({order,frames,endpoint,reverse,played,restored});
    }
    return results;
  });
  for(const {order,frames,endpoint,reverse,played,restored}of result){
    expect(frames[4]).toEqual(endpoint);
    expect(played).toEqual(frames[4]);expect(restored).toEqual(frames[0]);
    for(let p=0;p<3;p++)for(let i=0;i<reverse[p].length;i++)for(const attr of ['x','y','width','height'])expect(reverse[p][i][attr]).toBeCloseTo(frames[p+1][i][attr],5);
    const first=order[0]==='x'?['x','width']:['y','height'];
    for(let i=0;i<frames[0].length;i++)for(const attr of ['x','y','width','height']){
      if(!first.includes(attr))expect(frames[1][i][attr]).toBeCloseTo(frames[0][i][attr],5);
      if(first.includes(attr))expect(frames[3][i][attr]).toBeCloseTo(frames[4][i][attr],5);
    }
  }
});
