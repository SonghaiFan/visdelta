import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('fluent edits: retries, revisions, cumulative acceptance and latest playback', async t => {
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
    const base = api.bar([{ x: 'A', y: 3 }, { x: 'B', y: 8 }]).x('x').y('y');
    window.view = await api.render('#chart', base, { height: 280, updates: { duration: 900 } });
    window.edit = (requestId, method, args = []) => ({ requestId, baseRevision: view.snapshot().revision, edits: [{ method, args }] });
  });
  const retry = await page.evaluate(async () => {
    const message = edit('flip', 'flip');
    const [a, b] = await Promise.all([view.edit(message), view.edit(JSON.stringify(message))]);
    return { a, b, revision: view.snapshot().revision, x: view.snapshot().spec.encoding.x.field };
  });
  assert.deepEqual(retry.a, retry.b);
  assert.equal(retry.revision, 1);
  assert.equal(retry.x, 'y');
  const conflict = await page.evaluate(async () => {
    const baseRevision = view.snapshot().revision;
    return Promise.all(['one', 'two'].map(requestId => view.edit({ requestId, baseRevision, edits: [{ method: 'title', args: [requestId] }] }, { animate: false }).then(() => 'ok', e => e.code)));
  });
  assert.deepEqual(conflict.sort(), ['REVISION_CONFLICT', 'ok']);
  const before = await page.evaluate(() => view.snapshot());
  for (const kind of ['stale', 'reuse', 'unknown', 'data']) {
    const failure = await page.evaluate(async kind => {
      try {
        if (kind === 'stale') await view.edit({ ...edit('stale', 'flip'), baseRevision: 0 });
        if (kind === 'reuse') await view.edit(edit('flip', 'title', ['Different']));
        if (kind === 'unknown') await view.edit(edit('bad', '__proto__'));
        if (kind === 'data') await view.edit(edit('missing', 'x', ['missing', { type: 'quantitative' }]));
      } catch (error) { return error.message; }
    }, kind);
    assert.ok(failure, kind);
    assert.deepEqual(await page.evaluate(() => view.snapshot()), before);
  }
  await page.evaluate(() => { window.a = view.edit(edit('a', 'title', ['Retained title'])); });
  await page.waitForFunction(() => view.snapshot().spec.title === 'Retained title');
  await page.evaluate(() => { window.b = view.edit(edit('b', 'color', ['#4269d0'])); });
  await page.waitForFunction(() => view.snapshot().spec.encoding.color?.value === '#4269d0');
  await page.evaluate(() => { window.c = view.edit(edit('c', 'color', ['#ff725c'])); });
  const results = await page.evaluate(async () => (await Promise.all([a, b, c])).map(item => item.status));
  assert.deepEqual(results, ['applied', 'superseded', 'applied']);
  assert.equal(await page.evaluate(() => view.snapshot().spec.title), 'Retained title');
  await page.evaluate(async () => { window.reference = await api.render('#reference', view.snapshot().spec, { height: 280 }); });
  const geometry = selector => page.locator(`${selector} svg rect`).evaluateAll(nodes => nodes.map(node => ['x', 'y', 'width', 'height', 'fill'].map(key => key === 'fill' ? getComputedStyle(node).fill : node.getAttribute(key))));
  assert.deepEqual(await geometry('#chart'), await geometry('#reference'));
  await page.evaluate(() => { view.destroy(); reference.destroy(); });
  // A custom module participates through the same public adapter contract.
  const custom = await page.evaluate(async () => {
    const module = { key: 'bar', load: api.barModule.load, async edit(spec, calls) {
      await new Promise(resolve => { window.releaseEdit = resolve; });
      return { ...spec, title: calls[0].args[0] };
    } };
    const spec = api.bar([{ x: 'A', y: 3 }]).x('x').y('y').toSpec();
    window.customView = await api.createRenderer({ modules: [module] }).render('#chart', spec);
    window.delayed = customView.edit({ requestId: 'delayed', baseRevision: 0, edits: [{ method: 'caption', args: ['Old'] }] }).then(() => 'accepted', e => e.code);
    await new Promise(resolve => setTimeout(resolve, 0));
    await customView.render({ ...spec, title: 'New' });
    releaseEdit();
    return { result: await delayed, title: customView.snapshot().spec.title };
  });
  assert.deepEqual(custom, { result: 'REVISION_CONFLICT', title: 'New' });
  const destroyed = await page.evaluate(async () => {
    const completion = customView.edit({ requestId: 'destroy', baseRevision: 1, edits: [{ method: 'caption', args: ['Late'] }] });
    await new Promise(resolve => setTimeout(resolve, 0));
    customView.destroy();
    const result = await completion;
    releaseEdit();
    return result.status;
  });
  assert.equal(destroyed, 'destroyed');
  let reads = 0;
  await page.route('**/edit-data.json', route => { reads++; return route.fulfill({ json: [{ x: 'A', y: reads }] }); });
  await page.evaluate(async () => {
    const spec = api.bar({ url: '/edit-data.json' }).x('x').y('y').toSpec();
    const remote = await api.render('#chart', spec);
    await remote.edit({ requestId: 'remote', baseRevision: 0, edits: [{ method: 'title', args: ['Remote'] }] }, { animate: false });
    remote.destroy();
  });
  assert.equal(reads, 2, 'one data read per render/edit; adapter validation and playback share rows');
  const limit = await page.evaluate(async () => {
    const capped = await api.render('#chart', api.bar([{ x: 'A', y: 1 }]).x('x').y('y'));
    const message = requestId => ({ requestId, baseRevision: 99, edits: [{ method: 'flip', args: [] }] });
    for (let i = 0; i < 1024; i++) await capped.edit(message(String(i))).catch(() => {});
    const result = await capped.edit(message('overflow')).catch(error => error.message);
    const retry = await capped.edit(message('0')).catch(error => error.code);
    capped.destroy();
    return { result, retry };
  });
  assert.match(limit.result, /1024/);
  assert.equal(limit.retry, 'REVISION_CONFLICT');
  assert.deepEqual(errors, []);
});
