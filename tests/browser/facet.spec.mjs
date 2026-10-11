import { test, expect } from '@playwright/test';
test('one native faceted SVG shares scales, scrubs, plays both directions and resizes', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { bar } = await import('/dist/bar.js');
    const { transition } = await import('/dist/transition-entry.js');
    const rows = ['Core', 'Growth', 'Services', 'Support'].flatMap((panel, i) => [{ panel, x: 'A', y: 10 + i * 10 }, { panel, x: 'B', y: 20 + i * 10 }]);
    const a = bar(rows).x('x').y('y').key('x').color('panel').repeat('panel');
    const b = a.with({ data: rows.map(row => ({ ...row, y: row.y * 2 })), facetLayout: { columns: 1 } });
    const host = document.querySelector('#chart');
    const frame = () => [...host.querySelectorAll('.vd-facet-panel')].map(panel => ({ title: panel.querySelector('.vd-facet-title').textContent, transform: panel.getAttribute('transform'), ticks: [...panel.querySelectorAll('.vd-facet-y-axis .tick text')].map(n => n.textContent), marks: [...panel.querySelectorAll('.vd-bar')].map(n => ['x','y','width','height','fill'].map(k => n.getAttribute(k))) }));
    const other = document.createElement('div'); other.style.width = `${host.clientWidth}px`; document.body.append(other);
    const staticA = await transition(a, a, { target: other, height: 640 }); staticA.progress(1);
    const endpointA = [...other.querySelectorAll('.vd-bar')].map(n => ['x','y','width','height','fill'].map(k => n.getAttribute(k))); staticA.destroy();
    const staticB = await transition(b, b, { target: other, height: 640 }); staticB.progress(1);
    const endpointB = [...other.querySelectorAll('.vd-bar')].map(n => ['x','y','width','height','fill'].map(k => n.getAttribute(k))); staticB.destroy(); other.remove();
    globalThis.facetMotion = await transition(a, b, { target: host, height: 640 });
    const geometry = (container=host) => [...container.querySelectorAll('rect.vd-bar')].map(n => {
      const matrix=n.getCTM(); const point=new DOMPoint(+n.getAttribute('x'),+n.getAttribute('y')).matrixTransform(matrix);
      return {x:point.x,y:point.y,width:+n.getAttribute('width')*matrix.a,height:+n.getAttribute('height')*matrix.d};
    });
    const phase=facetMotion.view.__visDeltaScene.seekSequence?.phases?.[0]??{start:0,end:1};
    const stages=[0,.25,.5,.75,1].map(p=>{facetMotion.progress(phase.start+p*(phase.end-phase.start));return { geometry:geometry(), panels:[...host.querySelectorAll('.vd-facet-panel')].map(panel=>({transform:panel.getAttribute('transform'),width:+panel.querySelector('.vd-facet-bounds').getAttribute('width'),height:+panel.querySelector('.vd-facet-bounds').getAttribute('height'),marks:[...panel.querySelectorAll('.vd-bar')].map(n=>['x','y','width','height'].map(k=>n.getAttribute(k)))}))};});
    const inverseHost=document.createElement('div');inverseHost.style.width=`${host.clientWidth}px`;document.body.append(inverseHost);
    const inverse=await transition(b,a,{target:inverseHost,height:640});
    const inverseFrames=[.25,.5,.75].map(p=>{inverse.progress(1-p);return geometry(inverseHost);});inverse.destroy();inverseHost.remove();
    facetMotion.progress(0); const start = frame();
    facetMotion.progress(0.5); const middle = frame();
    facetMotion.progress(1); const end = frame();
    facetMotion.progress(0); const restored = frame();
    async function wait(value) { const deadline = performance.now()+5000; while (facetMotion.value !== value && performance.now()<deadline) await new Promise(requestAnimationFrame); if (facetMotion.value !== value) throw new Error('Facet playback did not finish'); }
    facetMotion.play({ from: 0, to: 1, duration: 100 }); await wait(1); const forward = frame();
    facetMotion.play({ from: 1, to: 0, duration: 100 }); await wait(0); const reverse = frame();
    return { start, middle, end, restored, forward, reverse, endpointA, endpointB, stages, inverseFrames };
  });
  expect(result.start.flatMap(p => p.marks)).toEqual(result.endpointA);
  expect(result.end.flatMap(p => p.marks)).toEqual(result.endpointB);
  expect(result.restored).toEqual(result.start);
  expect(result.forward).toEqual(result.end);
  expect(result.reverse).toEqual(result.start);
  for(let i=0;i<result.stages[0].panels.length;i++) {
    const frames=result.stages.map(stage=>stage.panels[i]);
    for(let j=0;j<frames[0].marks.length;j++)for(const coordinate of [0,2])expect(frames[1].marks[j][coordinate]).toBe(frames[0].marks[j][coordinate]);
    expect(frames[2].marks).not.toEqual(frames[0].marks);
    expect(frames[1].height).toBeCloseTo(frames[4].height,5);
    expect(frames[1].width).toBeCloseTo(frames[0].width,5);
    expect(frames[2].transform).toEqual(frames[4].transform);
    expect(frames[2].width).toBeCloseTo(frames[4].width,5);
    expect(frames[2].height).toBeCloseTo(frames[4].height,5);
  }
  for(let p=0;p<3;p++)for(let i=0;i<result.inverseFrames[p].length;i++)for(const attr of ['x','y','width','height'])expect(result.inverseFrames[p][i][attr]).toBeCloseTo(result.stages[p+1].geometry[i][attr],5);
  expect(result.start.every(p => JSON.stringify(p.ticks) === JSON.stringify(result.start[0].ticks))).toBe(true);
  expect(result.middle).not.toEqual(result.start);
  expect(result.middle).not.toEqual(result.end);
  await expect(page.locator('#chart svg')).toHaveCount(1);
  await expect(page.locator('#chart .vd-facet-panel')).toHaveCount(4);
  await expect(page.locator('.vd-facet-x-label, .vd-facet-y-label')).toHaveText(['','','','','','','','']);
  await expect(page.locator('#chart .vd-x-label')).toHaveText('X →');
  await expect(page.locator('#chart .vd-y-label')).toHaveText('↑ Y');
  await page.setViewportSize({ width: 390, height: 850 });
  await page.evaluate(() => facetMotion.resize());
  const transforms = await page.locator('.vd-facet-panel').evaluateAll(nodes => nodes.map(n => (n.transform.baseVal.consolidate()?.matrix.e ?? 0)));
  expect(transforms.every(x => Math.abs(x) < 1e-6)).toBe(true);
  expect(await page.locator('#chart').evaluate(host => [...host.querySelectorAll('.vd-bar')].every(n => !/NaN|Infinity/.test(n.outerHTML)))).toBe(true);
  await page.screenshot({ path: '/tmp/visdelta-native-facets.png' });
});


test('facets delegate line, area, point and pie geometry and update panel membership', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { transition } = await import('/dist/transition-entry.js');
    const rows = ['A','B'].flatMap(panel => [{ panel, id: 'one', x: 1, y: 10 }, { panel, id: 'two', x: 2, y: 20 }, { panel, id: 'three', x: 3, y: 15 }]);
    const results = [];
    for (const mark of ['line','area','point','pie']) {
      const module = await import(`/dist/${mark}.js`);
      const child = mark === 'pie' ? module.pie(rows).value('y').color('id').key('id').labels('inside') : module[mark](rows).x('x').y('y').key('id');
      const a = child.repeat('panel', { minWidth: 180 });
      const b = a.data(rows.filter(row => row.panel === 'A'));
      const motion = await transition(a,b,{target:'#chart',height:480});
      motion.progress(0);
      const source = document.querySelectorAll('.vd-facet-panel').length;
      motion.progress(0.5);
      const finite = !/NaN|Infinity/.test(document.querySelector('#chart').innerHTML);
      motion.progress(1);
      const target = document.querySelectorAll('.vd-facet-panel').length;
      const marks = document.querySelectorAll(`.vd-${mark === 'pie' ? 'pie-slice' : mark}`).length;
      motion.progress(0);
      const reverse = document.querySelectorAll('.vd-facet-panel').length;
      results.push({ mark, source, target, reverse, finite, marks });
      motion.destroy();
    }
    return results;
  });
  for (const row of result) {
    expect(row.source).toBe(2); expect(row.target).toBe(1); expect(row.reverse).toBe(2);
    expect(row.finite).toBe(true); expect(row.marks).toBeGreaterThan(0);
  }
});

test('Line, Area and Point repeated numeric domains share by default and remain independently configurable', async ({page})=>{
  await page.goto('/tests/fixtures/isolated.html');
  const result=await page.evaluate(async()=>{
    const {transition}=await import('/dist/transition-entry.js');const results=[];
    const rows=['A','B'].flatMap((panel,j)=>[1,2,3].map(x=>({panel,id:`${panel}-${x}`,x:x+j*10,y:x*10+j*100})));
    for(const name of ['line','area','point'])for(const scales of ['shared','independent']) {
      const factory=(await import(`/dist/${name}.js`))[name];const base=factory(rows).x('x').y('y').key('id').color('panel');
      const state=base.repeat('panel',{direction:'y',scales});
      const motion=await transition(state,state,{target:'#chart',height:740});motion.progress(1);
      results.push({name,scales,ticks:[...document.querySelectorAll('.vd-facet-panel')].map(p=>['x','y'].map(axis=>[...p.querySelectorAll(`.vd-facet-${axis}-axis .tick text`)].map(n=>n.textContent)))});motion.destroy();
    }
    return results;
  });
  for(const row of result)for(let axis=0;axis<2;axis++) {
    if(row.scales==='shared')expect(row.ticks[0][axis]).toEqual(row.ticks[1][axis]);
    else expect(row.ticks[0][axis]).not.toEqual(row.ticks[1][axis]);
  }
});

test('repeated axes inherit ordinary chart styling and grids share the mark coordinate frame', async ({page})=>{
  await page.goto('/tests/fixtures/isolated.html');
  const result=await page.evaluate(async()=>{
    const {area}=await import('/dist/area.js');const {transition}=await import('/dist/transition-entry.js');
    const rows=['A','B'].flatMap((panel,j)=>[1,2,3].map(x=>({panel,x,y:x*10+j*5})));
    const host=document.querySelector('#chart');host.className='vd-view';host.style.width='900px';
    const base=area(rows).x('x').y('y').key(['panel','x']).color('panel');
    const normal=document.createElement('div');normal.className='vd-view';normal.style.width='420px';document.body.append(normal);
    const single=await transition(base.where({panel:'A'}),base.where({panel:'A'}),{target:normal,height:400});single.progress(1);
    const style=node=>{const s=getComputedStyle(node);return {stroke:s.stroke,font:s.fontSize,fill:s.fill,display:s.display};};
    const expected={tick:style(normal.querySelector('.vd-y-axis .tick text')),line:style(normal.querySelector('.vd-y-axis .tick line')),grid:style(normal.querySelector('.vd-grid .tick line')),domain:style(normal.querySelector('.vd-grid path'))};single.destroy();
    const motion=await transition(base.repeat('panel',{direction:'x'}),base.repeat('panel',{direction:'y'}),{target:host,height:640});
    const frames=[];
    for(const width of [900,350]) {
      host.style.width=`${width}px`;motion.resize();
      for(const progress of [0,1,0]) {
        motion.progress(progress);
        const panels=[...host.querySelectorAll('.vd-facet-panel')].map(panel=>{
          const grid=panel.querySelector('.vd-facet-grid'),marks=panel.querySelector('.vd-facet-marks');
          const origin=node=>{const m=node.getCTM();return [m.e,m.f];};
          return {gridOrigin:origin(grid),markOrigin:origin(marks),tick:style(panel.querySelector('.vd-facet-y-axis .tick text')),line:style(panel.querySelector('.vd-facet-y-axis .tick line')),grid:style(grid.querySelector('.tick line')),domain:style(grid.querySelector('path'))};
        });
        const title=host.querySelector('.vd-y-label');const svg=host.querySelector('svg');const bounds=title.getBoundingClientRect(),viewport=svg.getBoundingClientRect();
        frames.push({panels,title:title.textContent,titleVisible:bounds.top>=viewport.top&&bounds.bottom<=viewport.bottom,titleCount:host.querySelectorAll('.vd-y-label').length});
      }
    }
    motion.destroy();normal.remove();return {expected,frames};
  });
  for(const frame of result.frames){
    expect(frame.titleCount).toBe(1);expect(frame.title).not.toBe('');expect(frame.titleVisible).toBe(true);
    for(const panel of frame.panels){
      expect(panel.gridOrigin).toEqual(panel.markOrigin);
      for(const key of ['tick','line','grid','domain'])expect(panel[key]).toEqual(result.expected[key]);
      expect(panel.domain.display).toBe('none');
    }
  }
});
