import { test, expect } from '@playwright/test';

test('Line summary Grain and appearance route renders complete boundaries and scrubs reversibly', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    const [{ createLineDeclarationOperationCodec }, { planDeclarationTransition }, { canonicalLineTransitionPair }] = await Promise.all([
      import('/dist/charts/line/declaration-operations.js'), import('/dist/grammar/declaration-plan.js'), import('/dist/charts/line/state.js')
    ]);
    const rows = [{ id:'a',x:1,y:2,series:'A' },{ id:'b',x:1,y:3,series:'B' },{ id:'c',x:2,y:4,series:'A' },{ id:'d',x:2,y:5,series:'B' }];
    const base = api.line(rows).datumKey('id').x('x').y('y');
    const withMargin = chart => ({ toSpec: () => ({ ...chart.toSpec(), margin: { top: 24, right: 24, bottom: 44, left: 64 } }), chartModule: () => chart.chartModule() });
    const from = withMargin(base.rollup());
    const to = withMargin(base.rollup({op:'mean',as:'average'}).color('#3366ff'));
    const plan = planDeclarationTransition(from.toSpec(),to.toSpec(),createLineDeclarationOperationCodec());
    const target = document.createElement('div');target.style.width='560px';document.body.append(target);
    const staticTarget = document.createElement('div');staticTarget.style.width='560px';document.body.append(staticTarget);
    const options = target => ({target,width:560,height:320});
    const change = await api.transition(from,to,options(target));
    change.progress(0.42);
    const physicalReverse = canonicalLineTransitionPair(from.toSpec(),to.toSpec()).reverse;
    const phases = change.view.__visDeltaScene.seekSequence?.phases ?? [];
    const attr = value => String(value).replace(/,\s*/g,',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, token => String(Math.round(Number(token)*1e4)/1e4));
    const snapshot = host => {
      const visible = node => getComputedStyle(node).visibility !== 'hidden' && Number(getComputedStyle(node).opacity || 1) > 0;
      const geometry = node => Object.fromEntries(['cx','cy','r','d','transform','x','y','width','height'].filter(key => node.hasAttribute(key)).map(key => [key,attr(node.getAttribute(key))]));
      return {
        marks:[...host.querySelectorAll('path.vd-line, path.vd-line-reference, circle.vd-point')].filter(visible).map(node => ({key:node.dataset.key,kind:node.getAttribute('class'),geometry:geometry(node),stroke:getComputedStyle(node).stroke,fill:getComputedStyle(node).fill,opacity:attr(getComputedStyle(node).opacity)})),
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
    const stages=phases.map(phase=>phase.spec.meta?.state?.sceneState?.detail?.stage).filter(Boolean);
    change.destroy();target.remove();staticTarget.remove();
    return {status:plan.status,operationIds:plan.stages.map(stage=>stage.operation.id),phaseCount:phases.length,stages,boundaryMatches,forward,reverse};
  });
  expect(result.status).toBe('planned');
  expect(result.operationIds.sort()).toEqual(['__visdeltaLineTopology','encoding/color'].sort());
  expect(result.phaseCount).toBe(2);
  expect(result.stages).toEqual([]);
  for(const boundary of result.boundaryMatches) expect(boundary.actual,`boundary ${boundary.progress}`).toEqual(boundary.expected);
  expect(result.reverse).toEqual(result.forward);
});


test('Line raw/summary fallback retains native zipper and reverses its exact frames',async ({page})=>{
  await page.goto('/tests/fixtures/runtime.html');await page.waitForSelector('rect.vd-bar');
  const result=await page.evaluate(async()=>{
    const api=window.VisDelta;
    const [{createLineDeclarationOperationCodec},{planDeclarationTransition}]=await Promise.all([import('/dist/charts/line/declaration-operations.js'),import('/dist/grammar/declaration-plan.js')]);
    const rows=[{x:1,y:2,series:'A'},{x:1,y:3,series:'B'},{x:2,y:4,series:'A'},{x:2,y:5,series:'B'}];
    const base=api.line(rows).x('x').y('y');const from=base.rollup();const to=base.breakdown('series');
    const target=document.createElement('div');target.style.width='560px';document.body.append(target);
    const change=await api.transition(from,to,{target,width:560,height:320});
    change.progress(0.42);
    const stages=change.view.__visDeltaScene.seekSequence.phases.map(phase=>phase.spec.meta?.state?.sceneState?.detail?.stage).filter(Boolean);
    const snapshot=()=>[...target.querySelectorAll('path.vd-line, path.vd-line-reference, circle.vd-point, .tick, .domain')].map(node=>[node.getAttribute('d'),node.getAttribute('transform'),node.getAttribute('cx'),node.getAttribute('cy'),node.style.opacity,getComputedStyle(node).stroke]);
    const forward=[0.17,0.45,0.79].map(p=>{change.progress(p);return snapshot();});change.progress(1);
    const reverse=[0.79,0.45,0.17].map(p=>{change.progress(p);return snapshot();}).reverse();
    const status=planDeclarationTransition(from.toSpec(),to.toSpec(),createLineDeclarationOperationCodec()).status;
    change.destroy();target.remove();return {status,stages,forward,reverse};
  });
  expect(result.status).toBe('unsupported');expect(result.stages).toEqual(['zipper-attractor','zipper-preview']);expect(result.reverse).toEqual(result.forward);
});
