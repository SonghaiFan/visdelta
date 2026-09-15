import { test, expect } from '@playwright/test';

test('a builder-carried chart module works without global registration', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    const { transition } = await import('/dist/transition-entry.js');
    const { dot, moduleLoads } = await import('/tests/fixtures/dot-chart.js');
    const rows = [{ id: 'A', before: 2, after: 8 }];
    const from = dot(rows).x('before').key('id');
    const change = await transition(from, from.x('after'), { target: '#chart', height: 160 });
    change.progress(1);
    return {
      loads: moduleLoads(),
      circles: document.querySelectorAll('#chart circle.dot').length,
      x: Number(document.querySelector('#chart circle.dot')?.getAttribute('cx'))
    };
  });
  expect(result).toEqual({ loads: 1, circles: 1, x: 160 });
});

test('selected bar transition loads no unrelated chart types', async ({ page }) => {
  const modules = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/dist/')) modules.push(url.pathname);
  });
  // The isolated fixture loads only the D3 global and the stylesheet;
  // the chart comes in through the focused ESM entries, like a bundler would.
  await page.goto('/tests/fixtures/isolated.html');
  const count = await page.evaluate(async () => {
    const [{ bar }, { transition }] = await Promise.all([
      import('/dist/bar.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = [
      { category: 'A', value: 10, other: 35 },
      { category: 'B', value: 30, other: 5 },
      { category: 'C', value: 20, other: 15 }
    ];
    const from = bar(rows).x('category').y('value').key('category');
    const change = await transition(from, from.y('other'), { target: '#chart', height: 400 });
    change.progress(0.37);
    return document.querySelectorAll('#chart rect.vd-bar').length;
  });
  expect(count).toBe(3);
  expect(modules).toContain('/dist/charts/bar/plugin.js');
  expect(modules.filter(path => /\/charts\/(area|line|point|unit)\//.test(path))).toEqual([]);
  expect(modules.filter(path => /\/(visdelta|story|seq|manifest)\.js$/.test(path))).toEqual([]);
  expect(modules.filter(path => /\/(shell|navigation)\.js$|\/scroll-drivers\//.test(path))).toEqual([]);
});

test('custom chart compiler runs and an existing pair keeps its renderer after registration changes', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    const { transition } = await import('/dist/transition-entry.js');
    const { defineChartType, registerChartModule } = await import('/dist/plugins.js');
    const { plugin: barPlugin } = await import('/dist/charts/bar/plugin.js');
    const host = document.createElement('div');
    document.body.append(host);
    // Reuse a public plugin renderer through its normal dependency injection.
    const { CHART_RUNTIME_DEPS } = await import('/dist/runtime/chart-deps.js');
    const renderer = barPlugin.createChartType(CHART_RUNTIME_DEPS).renderer;
    let compiled = 0;
    registerChartModule({ plugin: defineChartType({
      key: 'custom-bar',
      renderer,
      prepareSpec: spec => ({ ...spec, mark: 'bar' }),
      createSpecCompiler: () => ({
        base(spec) { compiled++; return { ...spec, encoding: { x: { field: 'id', type: 'nominal' }, y: { field: spec.measure, type: 'quantitative' } } }; },
        operations: {}
      })
    }) });
    const a = { mark: 'custom-bar', key: 'id', measure: 'a', data: [{ id: 'A', a: 2, b: 7 }] };
    const pair = await transition(a, { ...a, measure: 'b' }, { target: host });
    pair.progress(0.4);
    const before = host.querySelector('rect.vd-bar')?.getAttribute('height');
    registerChartModule({ plugin: defineChartType({ key: 'custom-bar', renderer() { throw new Error('replacement must not run'); } }) });
    pair.progress(0.7).progress(0.4).resize();
    const after = host.querySelector('rect.vd-bar')?.getAttribute('height');
    pair.destroy();
    host.remove();
    return { compiled, before, after };
  });
  expect(result.compiled).toBeGreaterThan(0);
  expect(result.before).not.toBeNull();
  expect(result.after).toBe(result.before);
});

test('the root entry does not overwrite a selected built-in registration', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const calls = await page.evaluate(async () => {
    const { registerChartType } = await import('/dist/plugins.js');
    const { plugin } = await import('/dist/charts/bar/plugin.js');
    const { CHART_RUNTIME_DEPS } = await import('/dist/runtime/chart-deps.js');
    const chartType = plugin.createChartType(CHART_RUNTIME_DEPS);
    let calls = 0;
    registerChartType({ ...chartType, renderer(...args) { calls++; return chartType.renderer(...args); } });
    const { bar, transition } = await import('/dist/index.js');
    const host = document.createElement('div');
    document.body.append(host);
    const a = bar([{ key: 'A', value: 2, other: 4 }]).x('key').y('value');
    const pair = await transition(a, a.y('other'), { target: host });
    pair.destroy(); host.remove();
    return calls;
  });
  expect(calls).toBeGreaterThan(0);
});

test('initial rendering failure restores the original target and listeners', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    const { unit } = await import('/dist/unit.js');
    const { transition } = await import('/dist/transition-entry.js');
    const host = document.createElement('div');
    const original = document.createElement('button');
    let clicks = 0;
    original.onclick = () => clicks++;
    host.append(original); document.body.append(host);
    // A beeswarm without an x field fails inside the unit layout, i.e. while
    // the first frame renders, after the host has already been taken over.
    const a = unit([{ key: 'A', value: 2 }]).key('key').layout('beeswarm');
    let error;
    try { await transition(a, a.data([{ key: 'A', value: 3 }]), { target: host }); }
    catch (cause) { error = cause.message; }
    const restored = host.firstChild === original;
    original.click(); host.remove();
    return { error, restored, clicks };
  });
  expect(result.error).toContain('beeswarm');
  expect(result.restored).toBe(true);
  expect(result.clicks).toBe(1);
});
