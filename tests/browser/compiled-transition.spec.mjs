import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  await page.evaluate(async () => {
    window.sl = await import('/dist/visdelta.esm.js');
    document.body.innerHTML = '<div id="cached" style="width:800px"></div><div id="reference" style="width:800px"></div>';
    window.rows = [
      { id: 'A', value: 10, other: 30, group: 'one' },
      { id: 'B', value: 20, other: 5, group: 'two' },
      { id: 'C', value: 30, other: 20, group: 'one' }
    ];
    window.base = sl.bar().data(rows).x('id').y('value').key('id');
    window.options = target => ({ target, height: 400 });
    window.geometry = selector => [...document.querySelector(selector).querySelectorAll('rect.vd-bar')].map(node => ({
      key: node.dataset.key,
      x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')), height: Number(node.getAttribute('height')),
      opacity: Number(node.style.opacity), fill: d3.color(node.getAttribute('fill'))?.formatRgb()
    })).sort((a, b) => a.key.localeCompare(b.key));
  });
});

test('seek and play reuse nodes without D3 schedules', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const change = await sl.transition(base, base.y('other'), options('#cached'));
    const svg = change.view.querySelector('svg');
    const marks = [...change.view.querySelectorAll('rect.vd-bar')];
    let clicks = 0;
    d3.select(marks[0]).on('click.consumer', () => clicks++);
    let reused = true;
    for (const p of [0.37, 0.8, 0.02, 1, 0, 0.55]) {
      change.progress(p);
      reused &&= svg === change.view.querySelector('svg') && marks.every(mark => mark.isConnected && change.view.contains(mark));
    }
    change.play({ duration: 120 });
    await new Promise(resolve => setTimeout(resolve, 250));
    change.pause();
    marks[0].dispatchEvent(new MouseEvent('click'));
    change.progress(0.37);
    document.querySelector('#cached').style.width = '600px';
    change.resize();
    change.progress(0.4);
    return { reused, clicks,
      resized: change.view.querySelector('svg') !== svg,
      schedules: [...change.view.querySelectorAll('*')].some(node => node.__transition) };
  });
  expect(result.reused).toBe(true);
  expect(result.resized).toBe(true);
  expect(result.schedules).toBe(false);
  expect(result.clicks).toBe(1);
});

test('a chart-style module changes presentation without entering transition semantics', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const compact = sl.defineChartStyle({
      key: 'compact editorial',
      tickSpacing: { x: 48, y: 40 },
      charts: {
        bar: {
          margin: { top: 28, right: 12, bottom: 36, left: 36 },
          grid: 'horizontal',
          openYDomain: false,
          edgeTitles: false
        }
      },
      axisTitle: channel => channel?.title
    });
    const target = base.y('other');
    const change = await sl.transition(base, target, { ...options('#cached'), chartStyle: compact });
    change.progress(0.37);
    const svg = change.view.querySelector('svg');
    const keys = [...svg.querySelectorAll('rect.vd-bar')].map(node => node.dataset.key).sort();
    const midTitle = svg.querySelector('.vd-y-label').textContent;
    change.progress(0.8);
    return {
      className: change.view.closest('.vd-transition-root').className,
      styleKey: change.view.closest('.vd-transition-root').dataset.chartStyle,
      keys,
      delta: change.delta,
      gridLines: svg.querySelectorAll('.vd-grid line').length,
      xTitle: svg.querySelector('.vd-x-label').textContent,
      midTitle,
      targetTitle: svg.querySelector('.vd-y-label').textContent
    };
  });

  expect(result.className).toContain('vd-style-compact-editorial');
  expect(result.styleKey).toBe('compact-editorial');
  expect(result.keys).toEqual(['A', 'B', 'C']);
  expect(result.delta).toEqual(await page.evaluate(() => sl.delta(base, base.y('other'))));
  expect(result.gridLines).toBeGreaterThan(0);
  expect(result.xTitle).toBe('Id');
  expect(result.midTitle).toBe('Value');
  expect(result.targetTitle).toBe('Other');
});

test('the Paper preset owns conventional axis titles, a right legend, and its palette', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const rows = [
      { id: 'A', region: 'North', income: 42, health: 66 },
      { id: 'B', region: 'South', income: 68, health: 78 }
    ];
    const from = sl.point(rows).x('income', { title: 'Income' }).y('health', { title: 'Health' }).key('id').color('region');
    const change = await sl.transition(from, from, { ...options('#cached'), chartStyle: sl.paperChartStyle });
    change.progress(1);
    const root = change.view.closest('.vd-transition-root');
    const frame = root.querySelector('.vd-frame').getBoundingClientRect();
    const legend = root.querySelector('.vd-legend').getBoundingClientRect();
    const xLabel = root.querySelector('.vd-x-label');
    const yLabel = root.querySelector('.vd-y-label');
    return {
      styleKey: root.dataset.chartStyle,
      xText: xLabel.textContent,
      xAnchor: xLabel.getAttribute('text-anchor'),
      yText: yLabel.textContent,
      yAnchor: yLabel.getAttribute('text-anchor'),
      yTransform: yLabel.getAttribute('transform'),
      xDomainOpacity: getComputedStyle(root.querySelector('.vd-x-axis .domain')).opacity,
      yDomainOpacity: getComputedStyle(root.querySelector('.vd-y-axis .domain')).opacity,
      legendIsRight: legend.left > frame.right,
      fills: [...root.querySelectorAll('circle.vd-point')].map(node => getComputedStyle(node).fill)
    };
  });

  expect(result.styleKey).toBe('paper');
  expect(result.xText).toBe('Income');
  expect(result.xAnchor).toBe('middle');
  expect(result.yText).toBe('Health');
  expect(result.yAnchor).toBe('middle');
  expect(result.yTransform).toContain('rotate(-90)');
  expect(result.xDomainOpacity).toBe('1');
  expect(result.yDomainOpacity).toBe('1');
  expect(result.legendIsRight).toBe(true);
  expect(result.fills).toEqual(['rgb(139, 47, 32)', 'rgb(49, 91, 69)']);
});

for (const scenario of ['measure', 'filter', 'highlight', 'color', 'sort', 'flip', 'split', 'merge', 'grouped-split', 'grouped-merge', 'focus-merge', 'sort-merge', 'detail-sort-merge', 'detail-sort-split']) {
  test(`${scenario}: cached mark geometry matches reconstruction`, async ({ page }) => {
    const samples = await page.evaluate(async scenario => {
      const { createTransitionSurface } = await import('/dist/runtime/transition-surface.js');
      const { transitionRegistry } = await import('/dist/runtime/chart-registry.js');
      const { createChartRuntimeDeps } = await import('/dist/runtime/chart-deps.js');
      const segmented = sl.bar().data([
        { id: 'A', group: 'one', value: 10 }, { id: 'A', group: 'two', value: 20 },
        { id: 'B', group: 'one', value: 30 }, { id: 'B', group: 'two', value: 15 }
      ]).x('id').y('value').key('id').breakdown('group');
      const source = scenario.includes('split') ? segmented.rollup()
        : scenario === 'focus-merge' ? segmented.focus({ id: 'A' })
        : scenario === 'detail-sort-merge' ? segmented.sort('value', 'descending')
        : scenario === 'sort-merge' ? segmented
        : scenario === 'merge' ? segmented
        : scenario === 'grouped-merge' ? segmented.layout('grouped') : base;
      const target = {
        measure: base.y('other'), filter: base.where({ group: 'one' }),
        highlight: base.highlight({ id: 'B' }), color: base.color('#cc6633'),
        sort: base.sort('value', 'descending'), flip: base.flip(),
        split: segmented, merge: segmented.rollup(),
        'focus-merge': segmented.rollup(), 'sort-merge': segmented.rollup().sort('value'),
        'detail-sort-merge': segmented.rollup(), 'detail-sort-split': segmented.sort('value', 'descending'),
        'grouped-split': segmented.layout('grouped'), 'grouped-merge': segmented.rollup()
      }[scenario];
      const cached = await sl.transition(source, target, options('#cached'));
      // Test the old deterministic renderer bridge, not another cached pair.
      const referenceHost = document.querySelector('#reference');
      const chartTypes = await transitionRegistry(source.toSpec(), createChartRuntimeDeps({ root: referenceHost }));
      const reference = createTransitionSurface(
        source.toSpec(),
        target.toSpec(),
        { ...options(referenceHost), reconstruct: true },
        chartTypes
      );
      const results = [];
      for (const p of [0, 0.07, 0.37, 0.5, 0.8, 1, 0.2]) {
        cached.progress(p); reference.progress(p);
        results.push({ p, actual: geometry('#cached'), expected: geometry('#reference') });
      }
      reference.destroy(); cached.destroy();
      return results;
    }, scenario);
    for (const { actual, expected } of samples) {
      expect(actual.map(mark => mark.key)).toEqual(expected.map(mark => mark.key));
      actual.forEach((mark, i) => {
        for (const field of ['x', 'y', 'width', 'height', 'opacity']) expect(mark[field]).toBeCloseTo(expected[i][field], 5);
        expect(mark.fill).toBe(expected[i].fill);
      });
    }
  });
}

test('exit nodes are detached and restored by identity; endpoint tooltip data follows the endpoint', async ({ page }) => {
  await page.evaluate(async () => {
    const start = base.tooltip('value');
    window.change = await sl.transition(start, start.where({ group: 'one' }).tooltip('other'), options('#cached'));
    window.exiting = [...change.view.querySelectorAll('rect.vd-bar')].find(node => node.__data__.id === 'B');
    change.progress(1);
  });
  expect(await page.evaluate(() => exiting.isConnected)).toBe(false);
  await page.locator('#cached rect.vd-bar').first().hover();
  expect(await page.locator('#cached .vd-tooltip').innerText()).toContain('Other');
  await page.evaluate(() => change.progress(0));
  expect(await page.evaluate(() => exiting.isConnected && change.view.contains(exiting))).toBe(true);
  await expect(page.locator('#cached .vd-tooltip')).toHaveCSS('opacity', '0');
  await page.mouse.move(1, 1);
  await page.locator('#cached rect.vd-bar').first().hover();
  expect(await page.locator('#cached .vd-tooltip').innerText()).toContain('Value');
});

test('delayed property changes can jump back before their start without retaining later values', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const start = base.transition({ duration: 600, ease: 'linear', stagger: { step: 180, max: 600 } });
    const a = await sl.transition(start, start.y('other'), options('#cached'));
    const b = await sl.transition(start, start.y('other'), options('#reference'));
    a.progress(0.02);
    b.progress(0.95).progress(1).progress(0.02);
    return { a: geometry('#cached'), b: geometry('#reference') };
  });
  expect(result.a).toEqual(result.b);
});

test('matched bars share one clock unless the author explicitly adds per-mark delay', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const changedAt = (change, selector, progress) => {
      change.progress(0);
      const start = geometry(selector);
      change.progress(progress);
      const frame = geometry(selector);
      return frame.map((mark, index) => Math.abs(mark.y - start[index].y) > 1e-4);
    };
    const synced = await sl.transition(base, base.y('other'), options('#cached'));
    const explicitStart = base.transition({
      duration: 900,
      ease: 'linear',
      stagger: { step: 250, max: 500 }
    });
    const delayed = await sl.transition(explicitStart, explicitStart.y('other'), options('#reference'));
    return {
      synced: changedAt(synced, '#cached', 0.1),
      delayed: changedAt(delayed, '#reference', 0.1)
    };
  });

  expect(result.synced).toEqual([true, true, true]);
  expect(result.delayed).toEqual([true, false, false]);
});

test('successive steps on the same property initialize from preceding endpoints', async ({ page }) => {
  const frames = await page.evaluate(async () => {
    const { record } = await import('/dist/runtime/recorder.js');
    const { createProgressController } = await import('/dist/runtime/tracks.js');
    const root = d3.select('#cached').append('svg');
    const rect = root.append('rect').attr('x', 0);
    const tracks = [];
    record(rect, tracks, { time: d3.now(), delay: 0, duration: 100, ease: d3.easeLinear }).attr('x', 10)
      .transition().duration(100).ease(d3.easeLinear).attr('x', 30);
    const schedules = createProgressController(tracks);
    const plan = schedules.compile();
    schedules.destroy({ finish: false });
    return [0.75, 0.25, 1, 0.5, 0, 0.1].map(p => {
      plan.progress(p);
      return Number(rect.attr('x'));
    });
  });
  expect(frames).toEqual([20, 5, 30, 10, 0, 2]);
});

test('compiled property tracks can use a direction-aware ease', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { record } = await import('/dist/runtime/recorder.js');
    const { createProgressController, directionalEase } = await import('/dist/runtime/tracks.js');
    const root = d3.select('#cached').append('svg');
    const rect = root.append('rect').attr('x', 0);
    const tracks = [];
    record(rect, tracks, { time: d3.now(), delay: 0, duration: 100, ease: d3.easeLinear })
      .easeVarying(() => directionalEase(d3.easeLinear, value => value * value))
      .attr('x', 100);
    const schedules = createProgressController(tracks);
    const plan = schedules.compile();
    schedules.destroy({ finish: false });
    plan.progress(0.5, 1);
    const forward = Number(rect.attr('x'));
    plan.progress(0.5, -1);
    const reverse = Number(rect.attr('x'));
    return { forward, reverse };
  });

  expect(result).toEqual({ forward: 50, reverse: 25 });
});

test('resize recompiles changed theme at the same progress; inspection cannot mutate endpoints', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const change = await sl.transition(base, base.y('other'), options('#cached'));
    change.progress(0.37);
    const before = geometry('#cached');
    const initialRadius = change.view.querySelector('rect.vd-bar').getAttribute('rx');
    change.delta.previous.encoding.y.field = 'missing';
    change.from.encoding.y.field = 'missing';
    document.documentElement.style.setProperty('--vd-bar-radius', '9');
    change.progress(0.37);
    const cachedRadius = change.view.querySelector('rect.vd-bar').getAttribute('rx');
    change.resize();
    const radius = change.view.querySelector('rect.vd-bar').getAttribute('rx');
    const after = geometry('#cached');
    document.documentElement.style.removeProperty('--vd-bar-radius');
    return { initialRadius, cachedRadius, radius, value: change.value, before, after };
  });
  expect(result.cachedRadius).toBe(result.initialRadius);
  expect(result.radius).toBe('9');
  expect(result.value).toBe(0.37);
  expect(result.after).toEqual(result.before);
});
