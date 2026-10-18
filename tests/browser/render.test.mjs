import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('persistent JSON view: latest policy, validation, data races, resize and destruction', async t => {
  const bundle = await build({ stdin: { contents: `
    import { render, createRenderer, bar, availableChartTypes, registerChartType } from './dist/index.js';
    import { barModule } from './dist/bar.js';
    window.api = { render, createRenderer, bar, barModule, availableChartTypes, registerChartType };
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.api);
  await page.evaluate(async () => {
    window.make = n => api.bar([{ x: 'A', y: n }, { x: 'B', y: 10 }]).x('x').y('y').toSpec();
    window.view = await api.render('#chart', JSON.stringify(make(1)), { height: 280, updates: { policy: 'latest', duration: 600 } });
  });
  assert.deepEqual(await page.evaluate(() => api.availableChartTypes()), []);
  const geometry = selector => page.locator(`${selector} svg rect`).evaluateAll(nodes => nodes.map(n => ['x','y','width','height'].map(k => n.getAttribute(k))));
  const initial = await geometry('#chart');
  await page.evaluate(() => {
    window.results = [];
    window.first = view.update(make(2)).then(r => { results.push(['first', r.status]); return r; });
  });
  await page.waitForFunction(() => document.querySelector('#chart [aria-hidden]') === null && view.snapshot().revision === 1);
  await page.evaluate(() => {
    window.second = view.update(make(3)).then(r => { results.push(['second',r.status]); return r; });
    window.third = view.update(make(4)).then(r => { results.push(['third',r.status]); return r; });
  });
  const statuses = await page.evaluate(async () => (await Promise.all([first, second, third])).map(r => r.status));
  assert.deepEqual(statuses, ['applied','superseded','applied']);
  assert.equal(await page.evaluate(() => view.snapshot().spec.title), '4');
  await page.evaluate(async () => { window.reference = await api.render('#reference', make(4), { height: 280 }); });
  assert.deepEqual(await geometry('#chart'), await geometry('#reference'), 'final frame equals independent static render');
  assert.notDeepEqual(await geometry('#chart'), initial);
  const before = await geometry('#chart');
  for (const kind of ['json','data','mark','duration']) {
    const failure = await page.evaluate(async kind => {
      try {
        if (kind === 'json') await view.update('{');
        if (kind === 'data') await view.update({ ...make(5), data: { name: 'missing' } });
        if (kind === 'mark') await view.update({ ...make(5), mark: 'line' });
        if (kind === 'duration') await view.update(make(5), { duration: -1 });
      } catch (e) { return e.message; }
    }, kind);
    assert.ok(failure, kind);
    assert.deepEqual(await geometry('#chart'), before);
  }
  assert.equal(await page.locator('#chart [aria-hidden]').count(), 0);
  await page.evaluate(async () => {
    const s = view.snapshot(); s.spec.title = 'mutated';
    if (view.snapshot().spec.title !== '4') throw Error('snapshot leaked');
    await view.render(make(1));
    view.resize({ width: 320 });
  });
  assert.equal(await page.locator('#chart svg').first().evaluate(n => n.getBoundingClientRect().width), 320);
  await page.evaluate(async () => {
    await view.update(make(8), { animate: false });
    view.resize({ width: 'auto' });
    document.querySelector('#chart').style.width = '360px';
  });
  await page.waitForFunction(() => document.querySelector('#chart svg').getBoundingClientRect().width <= 360);

  // Manual scrubbing and reversed endpoints feed the next route truthfully.
  await page.evaluate(async () => {
    window.manual = await view.transition(make(6));
    manual.resize({ width: 'auto' }).progress(0.5);
    try { await view.update(make(7)); throw Error('accepted an intermediate frame'); }
    catch (e) { if (!e.message.includes('endpoint')) throw e; }
    manual.progress(1);
    manual.play({ from: 1, to: 0, duration: 30 });
  });
  await page.waitForFunction(() => manual.value === 0);
  await page.evaluate(async () => { await view.update(make(1), { animate: false }); });
  await page.evaluate(async () => {
    reference.destroy();
    document.querySelector('#reference').style.width = '360px';
    window.reference = await api.render('#reference', make(1), { height: 280, width: 'auto' });
  });
  assert.deepEqual(await geometry('#chart'), await geometry('#reference'));
  await page.evaluate(async () => {
    const rows = [{ x: 'A', y: 25 }, { x: 'B', y: 10 }];
    const next = { ...make(25), data: { name: 'sales' } };
    const updating = view.update(next, { data: { sales: rows }, animate: false });
    rows[0].y = 999;
    next.title = 'mutated';
    await updating;
    if (view.snapshot().spec.title !== '25') throw Error('input mutation leaked');
    await view.update({ ...make(26), data: { name: 'sales' } }, { animate: false });
    reference.destroy();
    window.reference = await api.render('#reference', make(25), { height: 280, width: 'auto' });
  });
  assert.deepEqual(await geometry('#chart'), await geometry('#reference'), 'data bindings persist and inputs are detached');

  // Network completion order must not become submission order; destroy must settle a loading update.
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/slow.json', async route => { await blocked; await route.fulfill({ json: [{ x: 'A', y: 99 }, { x: 'B', y: 10 }] }); });
  await page.evaluate(() => { window.slow = view.update({ ...make(99), data: { url: '/slow.json' } }); });
  await page.evaluate(async () => { await view.update(make(9), { animate: false }); });
  release();
  assert.equal(await page.evaluate(async () => (await slow).status), 'superseded');
  assert.equal(await page.evaluate(() => view.snapshot().spec.title), '9');
  await page.evaluate(() => {
    window.a = view.update(make(10), { duration: 1000 });
  });
  await page.waitForFunction(() => view.snapshot().spec.title === '10' && !document.querySelector('#chart [aria-hidden]'));
  await page.evaluate(() => {
    window.b = view.update(make(11));
    view.destroy(); view.destroy();
  });
  assert.deepEqual(await page.evaluate(async () => (await Promise.all([a,b])).map(r => r.status)), ['destroyed','destroyed']);
  assert.equal(await page.locator('#chart svg').count(), 0);
  assert.ok(await page.evaluate(async () => { try { await view.update(make(12)); } catch (e) { return e.message; } }));

  // Scoped modules must be independent of global overrides.
  await page.evaluate(async () => {
    api.registerChartType({ key: 'bar', scenes: [], prepareSpec: s => s, renderer() { throw Error('global override'); } });
    window.scoped = await api.createRenderer({ modules: [api.barModule] }).render('#chart', make(3), { height: 280 });
    await scoped.update(make(7), { duration: 0 });
    scoped.destroy(); reference.destroy();
  });
  // Destroy resolves loading submissions immediately, before the network responds.
  let releaseLate, requestedLate;
  const lateGate = new Promise(resolve => { releaseLate = resolve; });
  const lateRequest = new Promise(resolve => { requestedLate = resolve; });
  await page.route('**/late.json', async route => {
    requestedLate();
    await lateGate;
    await route.fulfill({ json: [{ x: 'A', y: 12 }, { x: 'B', y: 10 }] });
  });
  await page.evaluate(async () => {
    window.loadingView = await api.createRenderer({ modules: [api.barModule] }).render('#chart', make(1));
    window.loadingUpdate = loadingView.update({ ...make(12), data: { url: '/late.json' } });
  });
  await lateRequest;
  await page.evaluate(() => loadingView.destroy());
  assert.equal(await page.evaluate(async () => (await loadingUpdate).status), 'destroyed');
  const response = page.waitForResponse('**/late.json');
  releaseLate();
  await response;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#chart').evaluate(n => n.childElementCount), 0);

  // A custom plugin uses the same scheduler and transactional validation.
  await page.evaluate(async () => {
    const custom = { key: 'bar', async load() {
      const loaded = await api.barModule.load();
      return { plugin: { ...loaded.plugin, createChartType(runtime) {
        const type = loaded.plugin.createChartType(runtime);
        return { ...type, renderer(context, rows, spec, tooltip) {
          if (spec.meta?.rejectRender) throw Error('custom rejection');
          return type.renderer(context, rows, spec, tooltip);
        } };
      } } };
    } };
    window.customView = await api.createRenderer({ modules: [custom] }).render('#chart', make(1), {
      height: 280, updates: { duration: 600 },
    });
    window.customFirst = customView.update(make(2));
  });
  await page.waitForFunction(() => customView.snapshot().revision === 1 && !document.querySelector('#chart [aria-hidden]'));
  await page.evaluate(() => { window.customPending = customView.update(make(3)); });
  await page.waitForFunction(() => customView.snapshot().spec.title === '3');
  assert.match(await page.evaluate(async () => {
    try { await customView.update({ ...make(13), meta: { rejectRender: true } }); } catch (e) { return e.message; }
  }), /custom rejection/);
  assert.deepEqual(await page.evaluate(async () => (await Promise.all([customFirst,customPending])).map(r => r.status)), ['applied','applied']);
  assert.equal(await page.evaluate(() => customView.snapshot().spec.title), '3');
  await page.evaluate(() => customView.destroy());
  assert.equal(await page.locator('#chart').evaluate(n => n.childElementCount), 0);
  assert.deepEqual(errors, []);
});
