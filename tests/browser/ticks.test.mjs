import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('readable ticks survive resize and scrubbing; authored formats win', async t => {
  const bundle = await build({ stdin: { contents: `
    import { render, transition, createRenderer, bar, area, availableChartTypes, registerChartType } from './dist/index.js';
    import { defineChartType, registerChartModule } from './dist/plugins.js';
    import { scaleBand, scaleLinear } from 'd3-scale';
    import { barModule } from './dist/bar.js';
    window.api = { defineChartType, registerChartModule, scaleBand, scaleLinear, render, transition, createRenderer, bar, area, barModule, availableChartTypes, registerChartType };
  `, resolveDir: process.cwd() }, bundle: true, format: 'iife', write: false });
  const css = await readFile(new URL('../../dist/visdelta.css', import.meta.url));
  const server = createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/style.css"><div id="chart" style="width:640px"></div><div id="reference" style="width:640px"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ ...(process.env.VISDELTA_CHROME_PATH ? { executablePath: process.env.VISDELTA_CHROME_PATH } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ timezoneId: 'Australia/Melbourne' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.api);
  await page.evaluate(async () => {
    const rows = [{ month: '2025-01-01', n: 150 }, { month: '2025-06-01', n: 330 }];
    window.base = api.area(rows).x('month').y('n');
    window.view = await api.render('#chart', base, { height: 300 });
  });
  const ticks = axis => page.locator(`#chart .vd-${axis}-axis .tick text`).allTextContents();
  assert.deepEqual(await ticks('x'), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
  assert.ok((await ticks('y')).includes('330'));
  assert.ok((await ticks('y')).every(label => !/[eE][+-]/.test(label)));
  await page.evaluate(async () => {
    window.change = await view.transition(base.color('#ff725c'));
    change.progress(0.5);
    change.resize({ width: 390 });
    change.progress(0);
  });
  assert.ok((await ticks('x')).every(label => !/AM|PM|:/.test(label)));
  await page.evaluate(async () => {
    change.progress(1);
    await view.render(api.area([{ month: '2025-01-01', n: 1000 }, { month: '2025-06-01', n: 2000000 }]).x('month', { format: '%Y-%m' }).y('n'));
  });
  assert.ok((await ticks('y')).includes('2m'));
  assert.ok((await ticks('x')).includes('2025-01'));
  await page.evaluate(async () => {
    await view.render(base.y('n', { format: ',.2f' }));
  });
  assert.ok((await ticks('y')).includes('330.00'));
  assert.deepEqual(errors, []);
  await page.evaluate(() => view.destroy());
  const ghosts = await page.evaluate(async () => {
    const rows = ['Atlas', 'Beacon', 'Comet', 'Drift'].map((product, i) => ({ product, measure: 'revenue', amount: [84, 62, 96, 48][i] }));
    const vertical = api.bar(rows).x('measure').y('amount').breakdown('product').color('product');
    const pair = await api.transition(vertical.flip(), vertical, { target: '#chart', width: 'auto', height: 400 });
    const counts = [];
    for (let round = 0; round < 3; round++) {
      for (let i = 1; i < 100; i++) {
        pair.progress((round % 2 ? 100 - i : i) / 100);
        counts.push(document.querySelectorAll('#chart .vd-axis-ghost').length);
      }
      await pair.inspect();
    }
    pair.progress(1);
    const endpoint = document.querySelectorAll('#chart .vd-axis-ghost').length;
    pair.destroy();
    return { maximum: Math.max(...counts), endpoint };
  });
  assert.ok(ghosts.maximum <= 2, `only one outgoing copy per axis, found ${ghosts.maximum}`);
  assert.equal(ghosts.endpoint, 0);
  const persistentFlip = await page.evaluate(async () => {
    const rows = ['Atlas', 'Beacon', 'Comet', 'Drift'].map((product, i) => ({ product, revenue: [84, 62, 96, 48][i], profit: [22, 31, 18, 26][i] }));
    const vertical = api.bar(rows).with({ transform: [{ fold: { fields: ['revenue', 'profit'], as: ['measure', 'amount'] } }] }).x('product').y('amount').breakdown('measure').layout('grouped').color('measure');
    const view = await api.render('#chart', vertical, { height: 400 });
    const results = [];
    const capture = selector => [...document.querySelectorAll(`${selector} .vd-axis`)].map(axis => ({
      className: axis.getAttribute('class'), text: axis.textContent,
      ticks: [...axis.querySelectorAll('.tick')].map(tick => [tick.textContent, tick.getAttribute('transform')])
    }));
    for (const target of [vertical.flip(), vertical, vertical.flip()]) {
      const spec = JSON.parse(JSON.stringify(target.toSpec()));
      const receipt = await view.update(spec, { duration: 300 });
      view.inspectMarks();
      await view.capture();
      const reference = await api.render('#reference', spec, { height: 400 });
      results.push({ receipt, actual: capture('#chart'), expected: capture('#reference'),
        ghosts: document.querySelectorAll('#chart .vd-axis-ghost').length });
      reference.destroy();
    }
    view.destroy();
    return results;
  });
  for (const step of persistentFlip) {
    assert.equal(step.receipt.status, 'applied');
    assert.equal(step.ghosts, 0);
    assert.deepEqual(step.actual, step.expected, 'settled serialized grouped flip axes match an independent static render');
  }
  const customGhosts = await page.evaluate(async () => {
    let draws = 0;
    api.registerChartModule({ plugin: api.defineChartType({
      key: 'axis-copy-probe', transitionEvaluation: 'cached',
      createRenderer(runtime) {
        return (chart, rows, spec) => {
          draws++;
          const scale = spec.encoding.x.type === 'nominal'
            ? api.scaleBand().domain(['revenue']).range([0, 400])
            : api.scaleLinear().domain([0, 300]).range([0, 400]);
          runtime.drawXAxis(chart, scale, spec.encoding.x.field);
          runtime.drawLegend(chart, rows, spec.encoding.color);
        };
      }
    }) });
    const spec = type => ({ mark: 'axis-copy-probe', data: [{ product: 'Atlas', revenue: 84 }],
      encoding: { x: { field: 'revenue', type }, color: { field: 'product', type: 'nominal' } } });
    const pair = await api.transition(spec('nominal'), spec('quantitative'), { target: '#chart', width: 640, height: 400 });
    const compiledDraws = draws;
    let maximum = 0;
    for (let i = 1; i < 100; i++) {
      pair.progress(i / 100);
      maximum = Math.max(maximum, document.querySelectorAll('#chart .vd-axis-ghost').length);
    }
    const beforeInspect = document.querySelector('#chart').innerHTML;
    const progressBeforeInspect = pair.value;
    await pair.inspect();
    const inspectPreserved = beforeInspect === document.querySelector('#chart').innerHTML && pair.value === progressBeforeInspect;
    const seekDraws = draws - compiledDraws;
    pair.resize({ width: 390 });
    const resizeRecompiled = draws > compiledDraws;
    const resizedDraws = draws;
    for (const progress of [0.99, 0.5, 0.01, 1, 0]) pair.progress(progress);
    const endpoint = document.querySelectorAll('#chart .vd-axis-ghost').length;
    pair.destroy();
    return { maximum, endpoint, seekDraws, inspectPreserved, resizeRecompiled, resizedSeekDraws: draws - resizedDraws };
  });
  assert.equal(customGhosts.seekDraws, 0, "unchanged layout must reuse compiled frames");
  assert.ok(customGhosts.inspectPreserved);
  assert.ok(customGhosts.resizeRecompiled);
  assert.equal(customGhosts.resizedSeekDraws, 0);
  assert.ok(customGhosts.maximum <= 1);
  assert.equal(customGhosts.endpoint, 0);
  const endpointSnapshots = await page.evaluate(async () => {
    const source = { mark: 'axis-copy-probe', data: { name: 'sales' },
      encoding: { x: { field: 'revenue', type: 'nominal' } } };
    const target = { ...source, encoding: { x: { field: 'revenue', type: 'quantitative' } } };
    const rows = [{ revenue: 84 }];
    const pair = await api.transition(source, target, { target: '#chart', data: { sales: rows } });
    const from = pair.from, to = pair.to;
    rows[0].revenue = -1;
    const resolved = from.data.values?.[0]?.revenue === 84 && to.data.values?.[0]?.revenue === 84;
    if (from.data.values) from.data.values[0].revenue = -2;
    from.encoding.x.field = 'mutated';
    const detached = pair.from.data.values?.[0]?.revenue === 84 && pair.from.encoding.x.field === 'revenue';
    pair.progress(1); await pair.inspect(); pair.resize({ width: 390 }); pair.progress(0);
    pair.destroy();
    return { resolved, detached };
  });
  assert.deepEqual(endpointSnapshots, { resolved: true, detached: true });



});
