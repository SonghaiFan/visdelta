import { test, expect } from '@playwright/test';

test('Area stream Layout and appearance route renders complete boundaries and scrubs reversibly', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    const [{ createAreaDeclarationOperationCodec }, { planDeclarationTransition }, { canonicalAreaTransitionPair }] = await Promise.all([
      import('/dist/charts/area/declaration-operations.js'), import('/dist/grammar/declaration-plan.js'), import('/dist/charts/area/state.js')
    ]);
    const rows = [{ id:'a',x:1,y:2,series:'A' },{ id:'b',x:1,y:3,series:'B' },{ id:'c',x:2,y:4,series:'A' },{ id:'d',x:2,y:5,series:'B' }];
    const base = api.area(rows).datumKey('id').x('x').y('y');
    const wrap = declaration => ({ toSpec: () => ({ ...declaration.toSpec(), margin:{left:64,right:24,top:24,bottom:52} }), chartModule:()=>base.chartModule() });
    const from = wrap(base.breakdown('series'));
    const to = wrap(base.breakdown('series').layout('stream',{offset:'silhouette',order:'reverse'}).color('#3366ff'));
    const plan = planDeclarationTransition(from.toSpec(),to.toSpec(),createAreaDeclarationOperationCodec());
    const target = document.createElement('div');target.style.width='560px';document.body.append(target);
    const staticTarget = document.createElement('div');staticTarget.style.width='560px';document.body.append(staticTarget);
    const options = target => ({target,width:560,height:320});
    const change = await api.transition(from,to,options(target));
    const physicalReverse = canonicalAreaTransitionPair(from.toSpec(),to.toSpec()).reverse;
    const phases = change.view.__visDeltaScene.seekSequence?.phases ?? [];
    const attr = value => String(value).replace(/,\s*/g,',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, token => String(Math.round(Number(token)*1e4)/1e4));
    const snapshot = host => {
      const visible = node => getComputedStyle(node).visibility !== 'hidden' && Number(getComputedStyle(node).opacity || 1) > 0;
      const geometry = node => Object.fromEntries(['d','transform','x','y','x1','x2','y1','y2','width','height'].filter(key => node.hasAttribute(key)).map(key => [key,attr(node.getAttribute(key))]));
      return {
        marks:[...host.querySelectorAll('path.vd-area, path.vd-area-divider, line.vd-area-observation')].filter(visible).map(node => ({key:node.dataset.key,kind:node.getAttribute('class'),geometry:geometry(node),stroke:getComputedStyle(node).stroke,fill:getComputedStyle(node).fill,opacity:attr(getComputedStyle(node).opacity)})),
        axes:[...host.querySelectorAll('.tick, .domain, .vd-x-label, .vd-y-label')].filter(visible).map(node => ({text:node.textContent,geometry:geometry(node)}))
      };
    };
    const state = spec => ({toSpec:()=>spec,chartModule:()=>from.chartModule()});
    const boundaryMatches=[];
    for (const [progress,spec] of [[0,from.toSpec()], ...phases.map(phase=>[physicalReverse ? 1-phase.end : phase.end,phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec])]) {
      change.progress(progress);
      const expected=await api.transition(state(spec),state(spec),options(staticTarget));expected.progress(1);
      boundaryMatches.push({progress,actual:snapshot(target),expected:snapshot(staticTarget)});expected.destroy();
    }
    const progress=[0.12,0.37,0.69,0.91];
    const forward=progress.map(p=>{change.progress(p);return snapshot(target);});
    change.progress(1);
    const reverse=progress.slice().reverse().map(p=>{change.progress(p);return snapshot(target);}).reverse();
    const reverseTarget=document.createElement('div');reverseTarget.style.width='560px';document.body.append(reverseTarget);
    const reversed=await api.transition(to,from,options(reverseTarget));
    const inverse=progress.map(p=>{reversed.progress(1-p);return snapshot(reverseTarget);});
    reversed.destroy();reverseTarget.remove();
    change.destroy();target.remove();staticTarget.remove();
    return {stages:phases.map(phase=>phase.spec.meta?.state?.sceneState?.detail?.stage).filter(Boolean),status:plan.status,operationIds:plan.stages.map(stage=>stage.operation.id),phaseCount:phases.length,boundaryMatches,forward,reverse,inverse};
  });
  expect(result.status).toBe('planned');
  expect(result.operationIds.sort()).toEqual(['__visdeltaAreaLayout','encoding/color'].sort());
  expect(result.phaseCount).toBe(2);
  expect(result.stages).toEqual([]);
  for(const boundary of result.boundaryMatches) expect(boundary.actual,`boundary ${boundary.progress}`).toEqual(boundary.expected);
  expect(result.reverse).toEqual(result.forward);
  expect(result.inverse).toEqual(result.forward);
});


test('Area raw/summary fallback retains the native detail transition and reverses its exact frames',async ({page})=>{
  await page.goto('/tests/fixtures/runtime.html');await page.waitForSelector('rect.vd-bar');
  const result=await page.evaluate(async()=>{
    const api=window.VisDelta;
    const [{createAreaDeclarationOperationCodec},{planDeclarationTransition}]=await Promise.all([import('/dist/charts/area/declaration-operations.js'),import('/dist/grammar/declaration-plan.js')]);
    const rows=[{x:1,y:2,series:'A'},{x:1,y:3,series:'B'},{x:2,y:4,series:'A'},{x:2,y:5,series:'B'}];
    const base=api.area(rows).x('x').y('y');const wrap=declaration=>({toSpec:()=>({...declaration.toSpec(),margin:{left:64,right:24,top:24,bottom:52}}),chartModule:()=>base.chartModule()});const from=wrap(base.rollup());const to=wrap(base.breakdown('series'));
    const target=document.createElement('div');target.style.width='560px';document.body.append(target);
    const change=await api.transition(from,to,{target,width:560,height:320});
    const phases=change.view.__visDeltaScene.seekSequence?.phases??[];
    const stages=phases.map(phase=>phase.spec.meta?.state?.sceneState?.detail?.stage).filter(Boolean);
    change.progress(0.17);const dividers=[...target.querySelectorAll('path.vd-area-divider')].filter(node=>Number(getComputedStyle(node).opacity)>0).length;
    const snapshot=()=>[...target.querySelectorAll('path.vd-area, path.vd-area-divider, line.vd-area-observation, .tick, .domain')].map(node=>[node.getAttribute('d'),node.getAttribute('transform'),node.getAttribute('cx'),node.getAttribute('cy'),node.style.opacity,getComputedStyle(node).stroke]);
    const forward=[0.17,0.45,0.79].map(p=>{change.progress(p);return snapshot();});change.progress(1);
    const reverse=[0.79,0.45,0.17].map(p=>{change.progress(p);return snapshot();}).reverse();
    const status=planDeclarationTransition(from.toSpec(),to.toSpec(),createAreaDeclarationOperationCodec()).status;
    change.destroy();target.remove();return {status,stages,forward,reverse,phaseCount:phases.length,dividers};
  });
  expect(result.status).toBe('unsupported');expect(result.stages).toEqual([]);expect(result.phaseCount).toBeLessThanOrEqual(1);expect(result.dividers).toBeGreaterThan(0);expect(result.reverse).toEqual(result.forward);
});
