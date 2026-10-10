import { test, expect } from '@playwright/test';

test('cached chart plugins clean every reversed leg at its physical endpoint', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ defineChartType, registerChartModule, motion }, { transition }] = await Promise.all([
      import('/dist/plugins.js'), import('/dist/transition-entry.js')
    ]);
    const calls = [];
    const mark = 'cached-endpoint-test';
    const state = (rank, position) => ({ mark, data: { values: [{ id: 'a' }] }, encoding: {}, rank, position });
    const waypoint = state(1, 50);
    registerChartModule({ plugin: defineChartType({
      key: mark, transitionEvaluation: 'cached',
      renderer(chart, rows, spec) {
        const marks = chart.g.selectAll('circle.endpoint').data(rows, row => row.id)
          .join(enter => enter.append('circle').attr('class', 'endpoint').attr('cy', 20).attr('r', 5).attr('cx', spec.position));
        if (chart.transitionPlan.staticEndpoint) {
          calls.push({ rank: spec.rank, position: spec.position, incoming: Number(marks.attr('cx')) });
        }
        motion(marks, chart.transition.base).attr('cx', spec.position);
      },
      transition: {
        plan: from => ({ staticEndpoint: from === null }),
        canonicalPair: (from, to) => Math.abs(from.rank - to.rank) === 1 && from.position > to.position
          ? { from: to, to: from, reverse: true }
          : { from, to, reverse: false },
        intermediateSpecs: (from, to) => Math.abs(from.rank - to.rank) === 2 ? [{ spec: waypoint }] : []
      }
    }) });
    const change = await transition(state(0, 80), state(2, 20), { target: '#chart', height: 220 });
    const phases = change.view.__visDeltaScene.seekSequence.phases;
    // Ignore animated canonical-target renders; the last static rank-1 render
    // is the clean physical boundary after the first reversed leg.
    const boundary = calls.filter(call => call.rank === 1).at(-1);
    const endpoint = calls.filter(call => call.rank === 2).at(-1);
    const geometry = progress => { change.progress(progress); return Number(change.view.querySelector('circle.endpoint').getAttribute('cx')); };
    const forward = [0, 0.5, 1].map(geometry);
    const backward = [1, 0.5, 0].map(geometry).reverse();
    const cleanup = [boundary, endpoint];
    change.destroy();
    return { reverse: phases.map(phase => phase.reverse), cleanup, forward, backward };
  });
  expect(result.reverse).toEqual([true, true]);
  expect(result.cleanup).toEqual([{ rank: 1, position: 50, incoming: 50 }, { rank: 2, position: 20, incoming: 20 }]);
  expect(result.forward).toEqual([80, 50, 20]);
  expect(result.backward).toEqual(result.forward);
});
