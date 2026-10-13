import { test, expect } from '@playwright/test';

for (const width of [760, 320]) test(`Fit chrome expands continuously and reverses at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: width + 20, height: 600 });
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async width => {
    const sl = await import('/dist/visdelta.esm.js');
    document.body.innerHTML = '';
    const host = () => {
      const el = document.createElement('div');
      el.style.cssText = `width:${width}px;height:500px`;
      document.body.append(el);
      return el;
    };
    const rows = Array.from({ length: 48 }, (_, i) => ({ id: String(i), value: i + 1, group: i % 3 }));
    const base = sl.bar(rows).x('id').y('value').key('id');
    const read = el => {
      const svg = el.querySelector('svg');
      const rect = svg.getBoundingClientRect();
      return {
        top: rect.top - el.getBoundingClientRect().top,
        height: rect.height,
        hidden: el.querySelector('.vd-figure-header').hidden,
        geometry: [...svg.querySelectorAll('.vd-bar')].map(n => ['x', 'y', 'width', 'height'].map(a => Number(n.getAttribute(a)))),
      };
    };
    const cases = [];
    for (const [to, chartStyle] of [[base.title('Arrives').subtitle('A note')], [base.color('group')], [base.color('group'), sl.chartStylePresets.paper]]) {
      const el = host();
      const change = await sl.transition(base, to, { target: el, width: 'auto', height: 'auto', chartStyle });
      const svg = el.querySelector('svg');
      const points = [0, .001, .25, .5, .75, .999, 1];
      const forward = points.map(p => { change.progress(p); return read(el); });
      const reverse = [...points].reverse().map(p => { change.progress(p); return read(el); }).reverse();
      const alone = [];
      for (const state of [base, to]) {
        const single = host();
        const controller = await sl.transition(state, state, { target: single, width: 'auto', height: 'auto', chartStyle });
        alone.push(read(single));
        controller.destroy();
      }
      const samples = [];
      for (let i = 1; i < 61; i++) {
        const started = performance.now();
        change.progress(i / 61);
        samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      const playTo = async (from, to) => {
        change.play({ from, to, duration: 80 });
        const deadline = performance.now() + 4000;
        while (change.value !== to && performance.now() < deadline) {
          await new Promise(requestAnimationFrame);
        }
        if (change.value !== to) throw new Error(`Playback ${chartStyle?.key ?? 'default'} ${from}->${to} stopped at ${change.value}, stages ${change.stageCount()}`);
      };
      await playTo(0, 1);
      const played = read(el);
      await playTo(1, 0);
      const rewound = read(el);
      change.progress(0);
      cases.push({ forward, reverse, alone, played, rewound, reused: svg === el.querySelector('svg'), p95: samples[57] });
      if (!chartStyle && to.toSpec().title) {
        change.progress(.5);
      } else change.destroy();
    }
    return cases;
  }, width);
  await page.locator('.vd-transition-root').first().screenshot({ path: `test-results/chrome-fit-${width}.png` });
  expect(errors).toEqual([]);
  for (const row of result) {
    expect(row.reverse).toEqual(row.forward);
    expect(row.forward[0]).toEqual(row.alone[0]);
    expect(row.forward.at(-1)).toEqual(row.alone[1]);
    expect(row.reused).toBe(true);
    expect(row.played).toEqual(row.alone[1]);
    expect(row.rewound).toEqual(row.alone[0]);
    for (let i = 1; i < row.forward.length; i++) {
      expect(row.forward[i].top).toBeGreaterThanOrEqual(row.forward[i - 1].top);
      expect(row.forward[i].height).toBeLessThanOrEqual(row.forward[i - 1].height);
    }
    expect(Math.abs(row.forward[1].top - row.forward[0].top)).toBeLessThan(1);
    expect(Math.abs(row.forward.at(-1).top - row.forward.at(-2).top)).toBeLessThan(1);
  }
  console.log(`Chrome layout ${width}px p95:`, result.map(row => row.p95));
});

test('Fit chrome uses custom plugin geometry and cleans its reverse endpoint', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { defineChartType, registerChartModule, motion } = await import('/dist/plugins.js');
    const { transition } = await import('/dist/transition-entry.js');
    registerChartModule({ plugin: defineChartType({
      key: 'chrome-test', transitionEvaluation: 'cached',
      renderer(chart, rows) {
        const mark = chart.g.selectAll('circle').data(rows).join('circle').attr('r', 4);
        motion(mark, chart.transition.base).attr('cy', chart.innerHeight / 2);
      },
    }) });
    const host = document.querySelector('#chart');
    host.style.cssText = 'width:400px;height:400px';
    const base = { mark: 'chrome-test', data: { values: [{ id: 'a' }] }, encoding: {} };
    const change = await transition(base, { ...base, title: 'Custom title' }, { target: host, height: 'auto' });
    const read = p => {
      change.progress(p);
      return { y: Number(host.querySelector('circle').getAttribute('cy')), height: host.querySelector('svg').getBoundingClientRect().height, hidden: host.querySelector('figcaption').hidden };
    };
    const forward = [0, .25, .5, .75, 1].map(read);
    const reverse = [1, .75, .5, .25, 0].map(read).reverse();
    return { forward, reverse };
  });
  expect(result.reverse).toEqual(result.forward);
  expect(result.forward[0].hidden).toBe(true);
  expect(result.forward.at(-1).height).toBeLessThan(result.forward[0].height);
  expect(result.forward.at(-1).y).toBeLessThan(result.forward[0].y);
});

test('a frame timestamp before the play call cannot produce negative progress', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    const sl = await import('/dist/visdelta.esm.js');
    const host = document.createElement('div');
    host.style.cssText = 'width:500px;height:400px';
    document.body.append(host);
    const base = sl.bar([{ id: 'A', value: 2 }]).x('id').y('value');
    const change = await sl.transition(base, base.title('Title'), { target: host, height: 'auto' });
    const original = window.requestAnimationFrame;
    let frame;
    window.requestAnimationFrame = callback => { frame = callback; return 0; };
    try {
      change.play({ duration: 100 });
      frame(performance.now() - 50);
      const first = change.value;
      frame(performance.now() + 200);
      return { first, last: change.value };
    } finally {
      window.requestAnimationFrame = original;
      change.destroy();
    }
  });
  expect(result).toEqual({ first: 0, last: 1 });
});
