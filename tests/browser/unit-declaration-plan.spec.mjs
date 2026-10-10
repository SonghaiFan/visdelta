import { test, expect } from '@playwright/test';

test('Unit quantity/group/layout/style declaration route preserves full phase states and reverse scrubbing', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    document.body.innerHTML = '<div id="route" style="width:560px"></div><div id="static" style="width:560px"></div>';
    const rows = [{ id: 'a', group: 'A', amount: 6 }, { id: 'b', group: 'B', amount: 4 }];
    const base = api.unit(rows).datumKey('id').key('id').value('amount', { unitValue: 2 }).layout('grid');
    const target = base.value('amount', { unitValue: 1 }).group('group').layout('bar').color('#3366ff');
    const margin = { top: 30, right: 30, bottom: 40, left: 50 };
    const fixedMargin = state => ({ toSpec: () => ({ ...state.toSpec(), margin }), chartModule: () => base.chartModule() });
    const from = fixedMargin(base);
    const to = fixedMargin(target);
    const options = target => ({ target, width: 560, height: 320 });
    const change = await api.transition(from, to, options('#route'));
    const phases = change.view.__visDeltaScene.seekSequence?.phases ?? [];
    const n = value => Number(Number(value).toFixed(4));
    const attribute = value => String(value).replace(/,\s*/g, ',')
      .replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, token => String(n(token)));
    const snapshot = host => ({
      units: [...host.querySelectorAll('circle.vd-unit')].map(node => ({
        key: node.dataset.semanticKey ?? node.dataset.key,
        geometry: ['cx', 'cy', 'r'].map(name => n(node.getAttribute(name))),
        fill: getComputedStyle(node).fill,
        opacity: n(getComputedStyle(node).opacity)
      })).sort((a, b) => String(a.key).localeCompare(String(b.key))),
      axes: [...host.querySelectorAll('.tick, .domain, .vd-x-label, .vd-y-label')].map(node => ({
        text: node.textContent,
        geometry: [...node.attributes].filter(attr => attr.name !== 'id')
          .map(attr => [attr.name, attribute(attr.value)]).sort()
      }))
    });
    const asUnit = spec => ({ toSpec: () => spec, chartModule: () => base.chartModule() });
    const boundaries = phases.map(phase => [phase.end, phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec]);
    const boundaryMatches = [];
    for (const [progress, spec] of boundaries) {
      change.progress(progress);
      const reference = await api.transition(asUnit(spec), asUnit(spec), options('#static'));
      reference.progress(1);
      boundaryMatches.push({ actual: snapshot(change.view), expected: snapshot(reference.view) });
      reference.destroy();
    }
    const forward = [0.14, 0.43, 0.79].map(progress => { change.progress(progress); return snapshot(change.view); });
    change.progress(1);
    const backward = [0.79, 0.43, 0.14].map(progress => { change.progress(progress); return snapshot(change.view); }).reverse();
    const startCount = (() => { change.progress(0); return change.view.querySelectorAll('circle.vd-unit').length; })();
    const endCount = (() => { change.progress(1); return change.view.querySelectorAll('circle.vd-unit').length; })();
    const reverse = await api.transition(to, from, options('#static'));
    const inverse = [0.14, 0.43, 0.79].map(progress => { reverse.progress(1 - progress); return snapshot(reverse.view); });
    reverse.destroy();
    change.destroy();
    return { phaseCount: phases.length, boundaryMatches, forward, backward, inverse, startCount, endCount };
  });
  expect(result.phaseCount).toBe(4);
  expect(result.startCount).toBe(5);
  expect(result.endCount).toBe(10);
  for (const boundary of result.boundaryMatches) expect(boundary.actual).toEqual(boundary.expected);
  expect(result.backward).toEqual(result.forward);
  expect(result.inverse).toEqual(result.forward);
});
