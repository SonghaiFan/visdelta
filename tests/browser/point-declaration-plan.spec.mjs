import { test, expect } from '@playwright/test';

test('Point summary Grain and appearance stages render complete states and reverse-scrub the same frames', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const vd = window.VisDelta;
    const { createPointDeclarationOperationCodec } = await import('/dist/charts/point/declaration-operations.js');
    const { canonicalPointTransitionPair } = await import('/dist/charts/point/state.js');
    const rows = [
      { id: 'a', region: 'N', cohort: 'one', x: 2, y: 3 },
      { id: 'b', region: 'N', cohort: 'two', x: 4, y: 7 },
      { id: 'c', region: 'S', cohort: 'one', x: 8, y: 9 },
      { id: 'd', region: 'S', cohort: 'two', x: 10, y: 11 }
    ];
    document.body.innerHTML = '<div id="a"></div><div id="b"></div><div id="c"></div>';
    const base = vd.point(rows).datumKey('id').x('x', { title: 'X' }).y('y', { title: 'Y' });
    const rollup = groupby => base.rollup(groupby, {
      x: { field: 'x', op: 'mean', title: 'X' },
      y: { field: 'y', op: 'mean', title: 'Y' }
    });
    const withMargin = state => ({ chartModule: () => state.chartModule(),
      toSpec: () => ({ ...state.toSpec(), margin: { top: 40, right: 24, bottom: 48, left: 56 } }) });
    const from = withMargin(rollup('region'));
    const to = withMargin(rollup(['region', 'cohort']).color('#3366ff'));
    const options = target => ({ target, width: 560, height: 320 });
    const plan = vd.planDeclarationTransition(from.toSpec(), to.toSpec(), createPointDeclarationOperationCodec());
    const change = await vd.transition(from, to, options('#a'));
    const reversed = await vd.transition(to, from, options('#c'));
    const phases = change.view.__visDeltaScene.seekSequence.phases;
    const canonical = canonicalPointTransitionPair(from.toSpec(), to.toSpec());
    const normalize = value => String(value).replace(/,\s*/g, ',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
      token => String(Number(Number(token).toFixed(4))));
    const snapshot = view => ({
      marks: [...view.querySelectorAll('circle.vd-point')].map(node => ({
        key: node.dataset.key,
        attrs: ['cx', 'cy', 'r'].map(name => normalize(node.getAttribute(name))),
        fill: getComputedStyle(node).fill,
        opacity: normalize(getComputedStyle(node).opacity)
      })).sort((a, b) => a.key.localeCompare(b.key)),
      axes: [...view.querySelectorAll('.tick, .domain, .vd-x-label, .vd-y-label')].map(node => ({
        text: node.textContent,
        attrs: [...node.attributes].filter(attribute => attribute.name !== 'id')
          .map(({ name, value }) => [name, normalize(value)]).sort()
      }))
    });
    const builder = spec => ({ toSpec: () => spec, chartModule: () => from.chartModule() });
    const boundaryMatches = [];
    for (const [progress, spec] of [[canonical.reverse ? 1 : 0, canonical.from], ...phases.map(phase => [canonical.reverse ? 1 - phase.end : phase.end,
      phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec])]) {
      change.progress(progress);
      const staticView = await vd.transition(builder(spec), builder(spec), options('#b'));
      staticView.progress(1);
      boundaryMatches.push({ progress, actual: snapshot(change.view), expected: snapshot(staticView.view) });
      staticView.destroy();
    }
    const forward = [0.17, 0.48, 0.82].map(progress => { change.progress(progress); return snapshot(change.view); });
    change.progress(1);
    const backward = [0.82, 0.48, 0.17].map(progress => { change.progress(progress); return snapshot(change.view); }).reverse();
    const reversedPair = [0.17, 0.48, 0.82].map(progress => { reversed.progress(1 - progress); return snapshot(reversed.view); });
    change.destroy(); reversed.destroy();
    const repeated = vd.planDeclarationTransition(from.toSpec(), to.toSpec(), createPointDeclarationOperationCodec());
    return { status: plan.status, ids: plan.stages.map(stage => stage.operation.id), deterministic: JSON.stringify(plan) === JSON.stringify(repeated), phaseCount: phases.length, boundaryMatches, forward, backward, reversedPair };
  });
  expect(result.status).toBe('planned');
  expect(result.ids.slice().sort()).toEqual(['__visdeltaPointGrain/grouping', 'encoding/color']);
  expect(result.deterministic).toBe(true);
  expect(result.phaseCount).toBe(2);
  for (const boundary of result.boundaryMatches) expect(boundary.actual, `boundary ${boundary.progress}`).toEqual(boundary.expected);
  expect(result.backward).toEqual(result.forward);
  expect(result.reversedPair).toEqual(result.forward);
});

test('Point planner preserves each authored sequence endpoint', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const vd = window.VisDelta;
    const rows = [{ id: 'a', group: 'A', detail: 'one', x: 1, y: 2 }, { id: 'b', group: 'A', detail: 'two', x: 3, y: 4 }];
    const base = vd.point(rows).datumKey('id').x('x').y('y');
    const withMargin = state => ({ chartModule: () => state.chartModule(),
      toSpec: () => ({ ...state.toSpec(), margin: { top: 40, right: 24, bottom: 48, left: 56 } }) });
    const from = withMargin(base.rollup('group'));
    const middle = withMargin(base.rollup(['group', 'detail']).color('#3366ff'));
    const to = withMargin(base.rollup('group').color('#ff6600'));
    const host = document.createElement('div'); host.style.width = '560px'; document.body.append(host);
    const staticHost = document.createElement('div'); staticHost.style.width = '560px'; document.body.append(staticHost);
    const story = await vd.sequence([from, middle, to], { target: host, width: 560, height: 320 });
    const normalize = value => String(value).replace(/,\s*/g, ',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
      token => String(Number(Number(token).toFixed(4))));
    const snapshot = view => ({
      marks: [...view.querySelectorAll('circle.vd-point')].map(node => ({
        key: node.dataset.key,
        attrs: ['cx', 'cy', 'r'].map(name => normalize(node.getAttribute(name))),
        fill: getComputedStyle(node).fill,
        opacity: normalize(getComputedStyle(node).opacity)
      })).sort((a, b) => a.key.localeCompare(b.key)),
      axes: [...view.querySelectorAll('.tick, .domain, .vd-x-label, .vd-y-label')].map(node => ({
        text: node.textContent,
        attrs: [...node.attributes].filter(attribute => attribute.name !== 'id')
          .map(({ name, value }) => [name, normalize(value)]).sort()
      }))
    });
    const authoredMatches = [];
    for (const [progress, state] of [from, middle, to].entries()) {
      story.progress(progress);
      const expected = await vd.transition(state, state, { target: staticHost, width: 560, height: 320 });
      expected.progress(1);
      authoredMatches.push({ progress, value: story.value, actual: snapshot(host), expected: snapshot(staticHost) });
      expected.destroy();
    }
    const segmentPhaseCounts = [0.3, 1.3].map(progress => {
      story.progress(progress);
      const active = [...host.querySelectorAll('*')].find(node => node.__visDeltaScene?.seekSequence);
      return active?.__visDeltaScene.seekSequence.phases.length;
    });
    const samples = [0.17, 0.82, 1, 1.26, 1.78].map(progress => { story.progress(progress); return snapshot(host); });
    story.progress(2);
    const backward = [1.78, 1.26, 1, 0.82, 0.17].map(progress => { story.progress(progress); return snapshot(host); }).reverse();
    story.destroy(); host.remove(); staticHost.remove();
    return { authoredMatches, segmentPhaseCounts, samples, backward };
  });
  expect(result.segmentPhaseCounts).toEqual([2, 2]);
  for (const boundary of result.authoredMatches) {
    expect(boundary.value).toBe(boundary.progress);
    expect(boundary.actual, `authored state ${boundary.progress}`).toEqual(boundary.expected);
  }
  expect(result.backward).toEqual(result.samples);
});
