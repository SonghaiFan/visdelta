import {expect,test} from '@playwright/test';
for(const width of [1280,390])test(`Story offers ordinary websites with native controllers at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:860});
 await page.goto('story/');
 await expect(page.getByRole('heading',{name:'Tell a story with a website.'})).toBeVisible();
 await expect(page.locator('iframe')).toHaveCount(2);
 await expect(page.getByRole('link',{name:'Open website'})).toHaveCount(2);
 await expect(page.locator('.story-editor')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const id of ['network','weather']){
  const response=await request.get(`story/examples/${id}/index.html`);expect(response.ok()).toBe(true);
  const source=await request.get(`story/examples/${id}/source.txt`);expect(source.ok()).toBe(true);expect(await source.text()).toContain('===== index.html =====');
 }
});
test('weather website preserves keys, cached frames, controls and archive evidence',async({page,request})=>{
 await page.goto('story/examples/weather/index.html');
 await page.waitForFunction(()=>document.documentElement.dataset.storyReady==='true',{timeout:30000});
 const canvas=page.locator('#chart');await expect(canvas.locator('[data-active="true"] circle.vd-point')).toHaveCount(1695);
 const points=()=>canvas.locator('[data-active="true"] circle.vd-point').evaluateAll(nodes=>nodes.map(node=>({key:node.getAttribute('data-key'),x:node.getAttribute('cx'),y:node.getAttribute('cy')})).sort((a,b)=>(a.key??'').localeCompare(b.key??'')));
 const start=await points();
 expect(await canvas.locator('[data-prepared]').getAttribute('data-prepared')).toBe('1');
 await page.locator('#position').fill('4');
 await expect.poll(()=>canvas.locator('[data-active="true"] circle.vd-point').count(),{timeout:30000}).toBe(118);
 await page.locator('#position').fill('0');
 await expect.poll(points,{timeout:30000}).toEqual(start);
 await page.locator('#metric').selectOption('tmin');
 await expect(page.locator('#status')).toContainText('Daily minimum',{timeout:30000});
 await expect(canvas.locator('[data-active="true"] .vd-transition-root')).toHaveCount(1);
 const provenance=await(await request.get('story/examples/weather/PROVENANCE.md')).text();
 expect(provenance).toContain('82,033');expect(provenance).toContain('not a live feed');
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>canvas.locator('[data-active="true"] svg.vd-chart').evaluate(node=>node.getBoundingClientRect().width<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
 await expect(page.locator('.vd-transition-root')).toHaveCount(0);
});


test('network website scrubs both ways and disposes its controller on leaving',async({page})=>{
 await page.goto('story/examples/network/index.html');
 const slider=page.locator('#position');await expect(slider).toBeEnabled();
 const bars=page.locator('#chart .vd-line');
 const geometry=()=>bars.evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility({visibilityProperty:true})).map(node=>['data-key','d'].map(key=>node.getAttribute(key))));
 await slider.fill('0');const start=await geometry();expect(start.length).toBeGreaterThan(0);
 await slider.fill('3');await expect(page.locator('#readout')).toContainText('3.00');
 await slider.fill('0');await expect.poll(geometry).toEqual(start);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
 await expect(page.locator('#chart .vd-transition-root')).toHaveCount(0);
});
