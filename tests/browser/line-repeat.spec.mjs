import { test, expect } from '@playwright/test';

test('Line stays Line across repeat and stages true panel frames with reversible endpoints', async ({page}) => {
  await page.goto('/tests/fixtures/isolated.html');
  const results = await page.evaluate(async () => {
    const {line} = await import('/dist/line.js');
    const {transition} = await import('/dist/transition-entry.js');
    const rows = ['A','B'].flatMap((ticker,j) => [1,2,3,4].map((date,i) => ({ticker,date,close:20+j*30+i*5})));
    const a = line(rows).x('date').y('close').key(['date','ticker']).breakdown('ticker').color('ticker').pointSize(3).strokeWidth(2);
    const host = document.querySelector('#chart'); host.style.width='840px';
    const snapshot = target => [...target.querySelectorAll('circle.vd-line-point')].map(node => {
      const m=node.getCTM();const p=new DOMPoint(+node.getAttribute('cx'),+node.getAttribute('cy')).matrixTransform(m);
      return {key:node.dataset.key,x:p.x,y:p.y,fill:node.getAttribute('fill')};
    }).sort((a,b)=>a.key.localeCompare(b.key));
    const compareHost=document.createElement('div');compareHost.style.width=host.style.width;document.body.append(compareHost);
    const results=[];
    for(const direction of ['x','y','grid'])for(const scales of ['shared','independent']) {
      const b=a.repeat('ticker',{direction,scales});
      if(b.toSpec().mark!=='line'||b.chartModule()!==a.chartModule()||typeof b.curve!=='function')throw Error('Repeat changed the Line chart type');
      const margin={top:56,right:20,bottom:40,left:48};
      const motion=await transition(a,b,{target:host,height:700,margin});
      const staticOptions={target:compareHost,height:700,margin};
      // Independent static renders use the same invariant outer margins as the route.
      const sa=await transition(a,a,{...staticOptions,margin:{top:56,right:20,bottom:40,left:48}});sa.progress(1);const expectedA=snapshot(compareHost);sa.destroy();
      const sb=await transition(b,b,{...staticOptions,margin:{top:56,right:20,bottom:40,left:48}});sb.progress(1);const expectedB=snapshot(compareHost);sb.destroy();
      motion.progress(0);const start=snapshot(host);

      const frames=[];
      for(const p of [.001,.125,.25,.375,.5,.625,.75,.875,.999]) {
        motion.progress(p);
        const panels=[...host.querySelectorAll('.vd-facet-panel')];
        for(const mark of host.querySelectorAll('path.vd-line, circle.vd-line-point')){const m=mark.getCTM();if(Math.abs(m.a-1)>1e-6||Math.abs(m.d-1)>1e-6)throw Error('Repeat applies SVG scale');if(mark.matches('path')&&+mark.getAttribute('stroke-width')!==2)throw Error('Repeat stretches line width');if(mark.matches('circle')&&+mark.getAttribute('r')!==3)throw Error('Repeat stretches point radius');}
        for(const panel of panels)if(panel.querySelector('.vd-facet-content').hasAttribute('transform'))throw Error('Repeat scales the content group');
        const truth=panels.map(panel=>{
          const ticks=[...panel.querySelectorAll('.vd-facet-y-axis .tick')].filter(n=>+getComputedStyle(n).opacity>.001).map(n=>({value:+n.__data__,y:new DOMPoint(0,devicePixelRatio > 1 ? 0 : -.5).matrixTransform(n.getCTM()).y})).sort((a,b)=>a.value-b.value);
          const marks=[...panel.querySelectorAll('circle.vd-line-point')].map(node=>({value:node.__data__.close,y:new DOMPoint(+node.getAttribute('cx'),+node.getAttribute('cy')).matrixTransform(node.getCTM()).y}));
          return {ticks,marks};
        });
        const local=[...host.querySelectorAll('circle.vd-line-point')].map(n=>({key:n.dataset.key,x:+n.getAttribute('cx'),y:+n.getAttribute('cy')})).sort((a,b)=>a.key.localeCompare(b.key));
        frames.push({p,geometry:snapshot(host),truth,local});
        if(/NaN|Infinity/.test(host.innerHTML))throw Error('Invalid repeat frame');
      }
      motion.progress(1);const end=snapshot(host);
      motion.progress(0);const restored=snapshot(host);
      const wait=async value=>{const deadline=performance.now()+5000;while(motion.value!==value&&performance.now()<deadline)await new Promise(requestAnimationFrame);if(motion.value!==value)throw Error('Play did not finish');};
      motion.play({from:0,to:1,duration:100});await wait(1);const played=snapshot(host);
      motion.play({from:1,to:0,duration:100});await wait(0);const reversed=snapshot(host);
      motion.destroy();
      const inverse=await transition(b,a,{target:host,height:700,margin});
      const inverseFrames=frames.map(frame=>{inverse.progress(1-frame.p);return snapshot(host);});inverse.destroy();
      results.push({direction,scales,start,end,expectedA,expectedB,restored,played,reversed,frames,inverseFrames});
    }
    compareHost.remove();return results;
  });
  for(const result of results){
    for(const [actual,expected] of [[result.start,result.expectedA],[result.end,result.expectedB],[result.restored,result.start],[result.played,result.end],[result.reversed,result.start]]) {
      expect(actual.map(n=>n.key)).toEqual(expected.map(n=>n.key));
      for(let i=0;i<actual.length;i++)for(const axis of ['x','y'])expect(actual[i][axis]).toBeCloseTo(expected[i][axis],3);
    }
    for(let i=0;i<result.frames.length;i++){
      const frame=result.frames[i];

      for(let j=0;j<frame.geometry.length;j++)for(const axis of ['x','y'])expect(frame.geometry[j][axis]).toBeCloseTo(result.inverseFrames[i][j][axis],3);
      for(const panel of frame.truth){
        expect(panel.ticks.length).toBeGreaterThanOrEqual(2);
        const [low,high]=[panel.ticks[0],panel.ticks.at(-1)];
        for(const mark of [...panel.marks,...panel.ticks])expect(mark.y).toBeCloseTo(low.y+(mark.value-low.value)/(high.value-low.value)*(high.y-low.y),2);
      }
    }
  }
});


test('Line repeat validates bridge constraints and resizes forward/reverse endpoints', async ({page})=>{
 await page.goto('/tests/fixtures/isolated.html');
 const result=await page.evaluate(async()=>{
  const {line}=await import('/dist/line.js');const {transition}=await import('/dist/transition-entry.js');
  const rows=['A','B'].flatMap(ticker=>[1,2,3].map(date=>({date,ticker,value:date*(ticker==='A'?10:20),other:ticker+'!'})));
  const a=line(rows).x('date').y('value').key(['date','ticker']).breakdown('ticker').color('ticker');
  const b=a.repeat('ticker',{direction:'y',scales:'independent'});
  const host=document.querySelector('#chart');host.style.width='900px';
  const errors=[];
  for(const target of [a.repeat('other'),b.data(rows.slice(1)),b.x('value'),a.key('date').repeat('ticker')]){
   let route;try{route=await transition(a,target,{target:host,height:700});route.progress(.25);}catch(error){errors.push(error.message);}finally{route?.destroy();host.replaceChildren();}
  }
  const snapshot=()=>[...host.querySelectorAll('circle.vd-line-point')].map(n=>{const p=new DOMPoint(+n.getAttribute('cx'),+n.getAttribute('cy')).matrixTransform(n.getCTM());return {key:n.dataset.key,x:p.x,y:p.y};}).sort((a,b)=>a.key.localeCompare(b.key));
  const margin={top:56,right:20,bottom:40,left:48};
  const motion=await transition(a,b,{target:host,height:700,margin});
  const checks=[];
  for(const width of [390,900]){
   host.style.width=width+'px';motion.resize();
   for(const endpoint of [0,1,0]){
    motion.progress(endpoint);const actual=snapshot();
    const other=document.createElement('div');other.style.width=host.style.width;document.body.append(other);
    const state=endpoint?b:a;const staticFrame=await transition(state,state,{target:other,height:700,margin});staticFrame.progress(1);
    const expected=[...other.querySelectorAll('circle.vd-line-point')].map(n=>{const p=new DOMPoint(+n.getAttribute('cx'),+n.getAttribute('cy')).matrixTransform(n.getCTM());return {key:n.dataset.key,x:p.x,y:p.y};}).sort((a,b)=>a.key.localeCompare(b.key));staticFrame.destroy();other.remove();checks.push({actual,expected});
   }
  }
  motion.destroy();return {errors,checks};
 });
 expect(result.errors).toHaveLength(4);
 expect(result.errors[0]).toMatch(/existing breakdown/);expect(result.errors[1]).toMatch(/unchanged observations/);expect(result.errors[2]).toMatch(/x\/y bindings/);expect(result.errors[3]).toMatch(/unchanged observations|unique observation/);
 for(const check of result.checks){expect(check.actual.map(n=>n.key)).toEqual(check.expected.map(n=>n.key));for(let i=0;i<check.actual.length;i++)for(const axis of ['x','y'])expect(check.actual[i][axis]).toBeCloseTo(check.expected[i][axis],3);}
});


test('Line repeat source projection preserves filtered chart domains and colors', async ({page})=>{
 await page.goto('/tests/fixtures/isolated.html');
 const result=await page.evaluate(async()=>{
  const {line}=await import('/dist/line.js');const {transition}=await import('/dist/transition-entry.js');
  const rows=['A','B','C'].flatMap((ticker,j)=>[1,2,3,4].map(date=>({ticker,date,value:date*10+j*40})));
  const base=line(rows).x('date').y('value').key(['date','ticker']).breakdown('ticker').color('ticker').where({field:'ticker',oneOf:['B','C']});
  const host=document.querySelector('#chart');host.style.width='800px';
  const motion=await transition(base,base.repeat('ticker',{direction:'y'}),{target:host,height:700});
  const capture=()=>[...host.querySelectorAll('circle.vd-line-point')].map(n=>{const p=new DOMPoint(+n.getAttribute('cx'),+n.getAttribute('cy')).matrixTransform(n.getCTM());return {key:n.dataset.key,x:p.x,y:p.y,fill:n.getAttribute('fill')};}).sort((a,b)=>a.key.localeCompare(b.key));
  motion.progress(0);const source=capture();motion.progress(.000001);const projected=capture();motion.progress(1);const end=capture();motion.destroy();return {source,projected,end};
 });
 expect(result.projected.map(n=>n.key)).toEqual(result.source.map(n=>n.key));
 for(let i=0;i<result.source.length;i++){expect(result.projected[i].fill).toBe(result.source[i].fill);expect(result.end[i].fill).toBe(result.source[i].fill);for(const axis of ['x','y'])expect(result.projected[i][axis]).toBeCloseTo(result.source[i][axis],3);}
});
