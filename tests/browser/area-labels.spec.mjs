import { test, expect } from '@playwright/test';

for (const width of [720, 320]) {
  test(`Area direct labels fit real layers at ${width}px and restore through playback`, async ({ page }) => {
    await page.goto('/tests/fixtures/isolated.html');
    const result = await page.evaluate(async width => {
      const { area } = await import('/dist/area.js');
      const { transition } = await import('/dist/transition-entry.js');
      const rows = [2020,2021,2022,2023].flatMap((year,i) => [
        {year, part:'Core', value:70+i*5}, {year, part:'Growth', value:40-i*5},
        {year, part:'Tiny', value:0.1}, {year, part:'A name far too long to fit in this chart '.repeat(10), value:20}
      ]);
      const host = document.querySelector('#chart');
      host.style.width = `${width}px`;
      const base = area(rows).x('year').y('value').breakdown('part').color('part');
      const a = base.labels('none'), b = base.labels('inside');
      const options = target => ({ target, width, height:360 });
      const snapshot = () => [...host.querySelectorAll('.vd-area-label')].filter(n => +getComputedStyle(n).opacity > 0).map(n => ({
        text:n.textContent, x:+n.getAttribute('x'), y:+n.getAttribute('y'), fill:n.getAttribute('fill'), opacity:+n.style.opacity
      }));
      const change = await transition(a,b,options(host));
      change.progress(0); const start = snapshot();
      change.progress(1); const end = snapshot();
      const fit = () => [...host.querySelectorAll('.vd-area-label')].filter(n => +n.style.opacity > 0).every(n => {
        const box = n.getBBox();
        const paths = [...host.querySelectorAll('path.vd-area')].filter(p => p.dataset.layerKey === n.dataset.layerKey);
        for(let x=box.x;x<=box.x+box.width;x+=2) for(let y=box.y;y<=box.y+box.height;y+=2)
          if(!paths.some(p=>p.isPointInFill(new DOMPoint(x,y)))) return false;
        return true;
      });
      const endpointFits = fit();
      const forward = [0.25,0.5,0.75].map(p=>{change.progress(p);return snapshot();});
      change.progress(1);
      const reverse = [0.75,0.5,0.25].map(p=>{change.progress(p);return snapshot();}).reverse();
      async function wait(value) {
        const until = performance.now()+6000;
        while(change.value!==value && performance.now()<until) await new Promise(requestAnimationFrame);
        if(change.value!==value) throw new Error('Area label playback timed out');
      }
      change.play({from:0,to:1,duration:100}); await wait(1); const played = snapshot();
      change.play({from:1,to:0,duration:100}); await wait(0); const restored = snapshot();
      change.destroy();
      const staticView = await transition(b,b,options(host)); staticView.progress(1); const independent = snapshot(); staticView.destroy();
      // Moving stream boundaries and curved cells must also contain visible labels.
      const moving = await transition(b,b.layout('stream',{offset:'silhouette',order:'reverse'}).curve('curveMonotoneX'),options(host));
      const phases = moving.view.__visDeltaScene.seekSequence?.phases ?? [];
      const positions = phases.length ? phases.flatMap(p=>[p.start+(p.end-p.start)*0.25,p.start+(p.end-p.start)*0.75]) : [0.25,0.75];
      const fitsDuringMotion = positions.map(p=>{moving.progress(p);return fit();});
      moving.progress(1); const stream = snapshot();
      moving.resize({width:width/2}); const resizedFits = fit();
      moving.destroy();
      return { start,end,endpointFits,forward,reverse,played,restored,independent,fitsDuringMotion,stream,resizedFits };
    }, width);
    expect(result.start).toEqual([]);
    expect(result.end.map(d=>d.text).sort()).toEqual(['Core','Growth']);
    expect(result.endpointFits).toBe(true);
    expect(result.reverse).toEqual(result.forward);
    expect(result.played).toEqual(result.end);
    expect(result.restored).toEqual([]);
    expect(result.independent).toEqual(result.end);
    expect(result.fitsDuringMotion.every(Boolean)).toBe(true);
    expect(result.stream.length).toBeGreaterThan(0);
    expect(result.resizedFits).toBe(true);
  });
}

for (const width of [1440,390]) {
  test(`design guide demonstrates direct labels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto('/docs/.vitepress/dist/design-guides.html');
    await page.getByRole('button', {name:'Areas',exact:true}).click();
    const panel = page.locator('[data-comparison="area-identify"] [data-side="after"]');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.locator('.vd-area-label')).toHaveText(width < 500 ? ['Core', 'Support'] : ['Core', 'Support', 'Growth']);
    await expect(panel.locator('.vd-legend-item')).toHaveCount(4);
    await expect(panel.locator('.comparison-status')).toHaveCount(0);
    expect(await panel.locator('.vd-area-label').evaluateAll(nodes=>nodes.every(n=>+n.style.opacity>0))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await panel.screenshot({path:`/tmp/visdelta-area-labels-${width}.png`});
  });
}

test('labelled Area inverse frames, gaps, filtering and rollup keep valid endpoints', async ({page}) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const {area} = await import('/dist/area.js');
    const {transition} = await import('/dist/transition-entry.js');
    const rows = [1,2,3,4,5].flatMap(x=>['A','B'].map((part,i)=>({x,part,y:20+x*(i+1)})));
    const base=area(rows).x('x').y('y').breakdown('part').color('part').labels('inside');
    const a=base, b=base.layout('stream',{offset:'silhouette',order:'reverse'});
    const target=()=>{const el=document.createElement('div');el.style.width='640px';document.body.append(el);return el;};
    const first=target(),second=target();
    const snapshot=host=>[...host.querySelectorAll('.vd-area-label')].filter(n=>+n.style.opacity>0).map(n=>[n.textContent,...['x','y'].map(k=>Math.round(+n.getAttribute(k)*1000)/1000),n.style.opacity]);
    const f=await transition(a,b,{target:first,width:640,height:320});
    const r=await transition(b,a,{target:second,width:640,height:320});
    const phases=f.view.__visDeltaScene.seekSequence?.phases??[];
    const progress=phases.length?phases.flatMap(p=>[p.start+(p.end-p.start)*0.3,p.start+(p.end-p.start)*0.7]):[0.3,0.7];
    const pairs=progress.map(p=>{f.progress(p);r.progress(1-p);return [snapshot(first),snapshot(second)];});
    f.destroy();r.destroy();
    const endpoints=[];
    const movingFit=[];
    const fits=host=>[...host.querySelectorAll('.vd-area-label')].filter(n=>+n.style.opacity>0).every(n=>{
      const box=n.getBBox();
      const paths=[...host.querySelectorAll('path.vd-area')].filter(p=>p.dataset.layerKey===n.dataset.layerKey);
      return [0,0.5,1].every(tx=>[0,0.5,1].every(ty=>paths.some(p=>p.isPointInFill(new DOMPoint(box.x+tx*box.width,box.y+ty*box.height)))));
    });
    for(const next of [base.where({field:'x',oneOf:[1,2,4,5]}),base.where({part:'A'}),base.focus({part:'B'}),base.rollup(),base.labels('none')]) {
      const change=await transition(base,next,{target:first,width:640,height:320});
      for(const progress of [0.1,0.3,0.6,0.9]) { change.progress(progress); movingFit.push(fits(first)); }
      change.progress(1); const actual=snapshot(first);
      const staticView=await transition(next,next,{target:second,width:640,height:320});staticView.progress(1);
      endpoints.push([actual,snapshot(second)]);
      change.progress(0);const restored=snapshot(first);
      staticView.destroy();
      const source=await transition(base,base,{target:second,width:640,height:320});source.progress(1);
      endpoints.push([restored,snapshot(second)]);
      source.destroy();change.destroy();
    }
    first.remove();second.remove();return {pairs,endpoints,movingFit};
  });
  expect(result.movingFit.every(Boolean)).toBe(true);
  for(const [actual,expected] of [...result.pairs,...result.endpoints]) expect(actual).toEqual(expected);
});
