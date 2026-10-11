import { test, expect } from '@playwright/test';
import { editorCode, setEditorCode } from './code-editor.mjs';

for (const chart of ['bar','line','area','point','unit']) {
  test(`${chart} playground exposes runnable repeat syntax under Layout`, async ({page}) => {
    await page.goto(`/docs/.vitepress/dist/playground.html#${chart}/repeat`);
    await expect(page.locator('.playground-status')).toHaveText('Ready');
    const editor = page.getByRole('textbox',{name:'Editable VisDelta code',exact:true});
    if(chart==='bar'||chart==='line') await page.getByRole('button',{name:'Select End snapshot',exact:true}).click();
    await expect.poll(()=>editorCode(editor)).toContain('.repeat(');
    await expect(page.locator('.playground-chart .vd-facet-panel')).toHaveCount(chart==='line'||chart==='area'?2:3);
    const geometry = () => page.evaluate(() => ({
      canvas: document.querySelector('.playground-chart svg').getBoundingClientRect().height,
      viewBox: document.querySelector('.playground-chart svg').viewBox.baseVal.height,
      preview: document.querySelector('.snapshot-chart').getBoundingClientRect().height,
      workspace: document.querySelector('.snapshot-workspace').getBoundingClientRect().height
    }));
    const endGeometry = await geometry();
    if (chart === 'bar') {
      const panels = await page.locator('.vd-facet-panel').evaluateAll(nodes => nodes.map(panel => {
        const marks = [...panel.querySelectorAll('rect.vd-bar')];
        const height = +panel.querySelector('.vd-facet-bounds').getAttribute('height');
        const ticks = [...panel.querySelectorAll('.vd-facet-y-axis .tick')].map(tick => ({
          y: new DOMPoint(0,0).matrixTransform(tick.getCTM()).y,
          height: tick.querySelector('text').getBBox().height
        })).sort((a,b)=>a.y-b.y);
        return { ratio: Math.max(...marks.map(mark=>+mark.getAttribute('height'))) / height,
          readable: ticks.every((tick,i)=>i===0 || tick.y-ticks[i-1].y >= tick.height) };
      }));
      for (const panel of panels) { expect(panel.ratio).toBeGreaterThan(.25); expect(panel.readable).toBe(true); }
    }
    await page.getByRole('button',{name:'Select Start snapshot',exact:true}).click();
    await expect(page.locator('.playground-status')).toHaveText('Ready');
    await expect.poll(geometry).toEqual(endGeometry);
    await page.locator('.snapshot-chart').screenshot({path:`/tmp/visdelta-playground-repeat-${chart}-start-desktop.png`});
    await page.getByRole('button',{name:'Play next →',exact:true}).click();
    await expect.poll(()=>page.getByRole('slider',{name:'Playground transition progress'}).inputValue(),{timeout:20000}).toBe('1');
    await expect(page.locator('.playground-status')).toHaveText('Ready');
    if(chart==='bar'||chart==='line') {
      const slider=page.getByRole('slider',{name:'Playground transition progress'});
      for(const progress of [.125,.25,.375,.5,.75]) {
        await slider.evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},progress);
        await page.locator('.snapshot-chart').screenshot({path:`/tmp/visdelta-playground-repeat-${chart}-stage-${progress}.png`});
      }
      await slider.evaluate(node=>{node.value='1';node.dispatchEvent(new Event('input',{bubbles:true}));});
    }
    expect(await geometry()).toEqual(endGeometry);
    await page.locator('.snapshot-chart').screenshot({path:`/tmp/visdelta-playground-repeat-${chart}-desktop.png`});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.locator('.snapshot-chart').screenshot({path:`/tmp/visdelta-playground-repeat-${chart}-mobile.png`});
    const narrowEnd = await geometry();
    await page.getByRole('button',{name:'Select Start snapshot',exact:true}).click();
    await expect.poll(geometry).toEqual(narrowEnd);
    expect(await page.locator('.playground-chart svg').evaluate(node=>!/NaN|Infinity/.test(node.outerHTML))).toBe(true);
  });
}


test('playground honors explicitly authored auto height instead of forcing height for all repeats', async ({page}) => {
  await page.goto('/docs/.vitepress/dist/playground.html#bar/repeat');
  await expect(page.locator('.playground-status')).toHaveText('Ready');
  await page.getByRole('button',{name:'Select End snapshot',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Editable VisDelta code',exact:true});
  await expect.poll(()=>editorCode(editor)).toContain('.repeat(');
  const height=()=>page.locator('.playground-chart svg').evaluate(n=>n.viewBox.baseVal.height);
  expect(await height()).toBe(500);
  const code=await editorCode(editor);
  await setEditorCode(editor,code.replace('scales: "shared"','scales: "shared", autoHeight: true, minHeight: 300'));
  await page.getByRole('button',{name:'Save frame',exact:false}).click();
  await expect.poll(height).toBeGreaterThan(900);
  await expect(page.locator('.playground-status')).toHaveText('Ready');
  const fits=await page.evaluate(()=>{
    const panel=document.querySelector('.snapshot-chart').getBoundingClientRect();
    const workspace=document.querySelector('.snapshot-workspace').getBoundingClientRect();
    return getComputedStyle(document.querySelector('.snapshot-chart')).position!=='absolute'||panel.bottom<=workspace.bottom;
  });
  expect(fits).toBe(true);
});


test('floating preview edges resize directly without a toggle and retain the staged frame', async ({page}) => {
  await page.setViewportSize({width:1400,height:1100});
  await page.goto('/docs/.vitepress/dist/playground.html#bar/repeat');
  await expect(page.locator('.playground-status')).toHaveText('Ready');
  const panel=page.locator('.snapshot-chart');
  await expect(page.getByRole('button',{name:'Resize',exact:true})).toHaveCount(0);
  await expect(page.locator('.preview-resize-edge')).toHaveCount(8);
  await page.getByRole('button',{name:'Play next →',exact:true}).click();
  const slider=page.getByRole('slider',{name:'Playground transition progress'});
  await slider.evaluate(node=>{node.value='.75';node.dispatchEvent(new Event('input',{bubbles:true}));});
  const handle=page.getByRole('button',{name:'Resize chart preview se',exact:true});
  await handle.scrollIntoViewIfNeeded();
  const before=await panel.boundingBox();
  const box=await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+140,{steps:5});await page.mouse.up();
  await expect.poll(()=>page.locator('.playground-chart svg').evaluate(n=>n.viewBox.baseVal.height)).toBe(640);
  expect((await panel.boundingBox()).width).toBeGreaterThan(before.width+30);
  expect(await slider.inputValue()).toBe('0.75');
  const matrices=await page.locator('.playground-chart rect.vd-bar').evaluateAll(nodes=>nodes.map(n=>[n.getCTM().a,n.getCTM().d]));
  for(const matrix of matrices)expect(matrix).toEqual([1,1]);
  const rightBefore = await panel.boundingBox();
  const west=page.getByRole('button',{name:'Resize chart preview w',exact:true});
  const westBox=await west.boundingBox();
  await west.hover();expect(await west.evaluate(n=>getComputedStyle(n).cursor)).toBe('ew-resize');
  await page.mouse.move(westBox.x+westBox.width/2,westBox.y+westBox.height/2);
  await page.mouse.down();await page.mouse.move(westBox.x+westBox.width/2-30,westBox.y+westBox.height/2,{steps:3});await page.mouse.up();
  await expect.poll(async()=> (await panel.boundingBox()).width).toBeCloseTo(rightBefore.width+30,0);
  const westAfter=await panel.boundingBox();
  expect(westAfter.x+westAfter.width).toBeCloseTo(rightBefore.x+rightBefore.width,0);
  expect(await slider.inputValue()).toBe('0.75');
  const north=page.getByRole('button',{name:'Resize chart preview n',exact:true});
  await north.hover();expect(await north.evaluate(n=>getComputedStyle(n).cursor)).toBe('ns-resize');
  const topBefore=await panel.boundingBox(),northBox=await north.boundingBox();
  await page.mouse.move(northBox.x+northBox.width/2,northBox.y+northBox.height/2);
  await page.mouse.down();await page.mouse.move(northBox.x+northBox.width/2,northBox.y+northBox.height/2+20,{steps:3});await page.mouse.up();
  await expect.poll(()=>page.locator('.playground-chart svg').evaluate(n=>n.viewBox.baseVal.height)).toBe(620);
  const topAfter=await panel.boundingBox();
  expect(topAfter.y+topAfter.height).toBeCloseTo(topBefore.y+topBefore.height,0);
  expect(await slider.inputValue()).toBe('0.75');
  await page.setViewportSize({width:390,height:844});
  await expect(handle).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
