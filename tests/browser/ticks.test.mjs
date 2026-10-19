import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('readable ticks survive resize and scrubbing; authored formats win', async t => {
  const bundle = await build({ stdin: { contents: `
    import { render, createRenderer, bar, area, availableChartTypes, registerChartType } from './dist/index.js';
    import { barModule } from './dist/bar.js';
    window.api = { render, createRenderer, bar, area, barModule, availableChartTypes, registerChartType };
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
});
