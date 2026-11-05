import {expect,test} from '@playwright/test';
for(const width of [1280,390])test(`Liveshow native JSON, history and idle rendering at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('liveshow/');
 await expect(page.getByRole('status')).toContainText('Ready');
 const chart=page.locator('.liveshow-chart');
 await expect(chart.locator('.vd-bar')).toHaveCount(4);
 await page.getByText('Inspect data & generated edits',{exact:false}).click();
 const before=await chart.locator('.vd-bar').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('height')));
 await page.getByRole('button',{name:'Send JSON',exact:true}).click();
 await expect(page.getByRole('list',{name:'Update results'})).toContainText('applied');
 expect(await chart.locator('.vd-bar').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('height')))).not.toEqual(before);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect.poll(()=>chart.locator('.vd-bar').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('height')))).toEqual(before);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('revision 3');
 const input=page.getByRole('textbox',{name:'Next chart JSON'});
 await input.fill('{"invalid":true}');await page.getByRole('button',{name:'Send JSON',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Reset',exact:true})).toBeEnabled();
 await expect(chart.locator('.vd-transition-root')).toHaveCount(1);
 const mutations=await chart.evaluate(async host=>{let count=0;const observer=new MutationObserver(records=>count+=records.length);observer.observe(host,{subtree:true,childList:true,attributes:true});await new Promise(resolve=>setTimeout(resolve,600));observer.disconnect();return count;});
 expect(mutations).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});


test('static hosting keeps manual editing without polling a missing service',async({page})=>{
 let browserRequests=0;
 await page.route('**/api/liveshow/status/',route=>route.fulfill({status:404,body:'Not found'}));
 page.on('request',request=>{if(request.url().includes('/api/liveshow/browser/'))browserRequests++;});
 await page.goto('liveshow/');await expect(page.getByRole('status')).toContainText('Ready');
 await page.getByText('Inspect data & generated edits',{exact:false}).click();
 await page.getByRole('button',{name:'Send JSON',exact:true}).click();
 await expect(page.getByRole('list',{name:'Update results'})).toContainText('applied');
 expect(browserRequests).toBe(0);
});
