import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Chart } from '../../dist/react.js';
import * as reactApi from '../../dist/react.js';
import { bar } from '../../dist/bar.js';

test('React entry can render an empty host on the server without DOM access', () => {
  assert.deepEqual(Object.keys(reactApi), ['Chart']);
  const a = bar([{ x: 'A', y: 1 }]).x('x').y('y');
  for (const state of [a, [a], [a, a], [a, a, a]]) {
    const html = renderToString(createElement(Chart, { state, 'aria-label': 'Chart' }));
    assert.match(html, /aria-label="Chart"/);
    assert.doesNotMatch(html, /svg/);
  }
});

test('React components own real controllers through updates, races and Strict Mode', async (t) => {
  const bundle = await build({ entryPoints: ['tests/fixtures/react.js'], bundle: true, format: 'iife', write: false });
  const css = await readFile(new URL('../../dist/visdelta.css', import.meta.url));
  const server = createServer((request, response) => {
    if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><link rel="stylesheet" href="/style.css"><div id="root" style="width:640px"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ ...(process.env.VISDELTA_CHROME_PATH ? { executablePath: process.env.VISDELTA_CHROME_PATH } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.deepEqual(errors, [], 'fixture loads');
  await page.waitForFunction(() => Boolean(window.fixture));
  const ready = count => page.waitForFunction(count => fixture.stats.ready === count, count);
  const geometry = () => page.locator('#root svg:visible rect').evaluateAll(nodes => nodes.map(node => ['x', 'y', 'width', 'height'].map(key => node.getAttribute(key)).join(',')).join(';'));
  await page.evaluate(() => fixture.render('Transition', { progress: 0 }));
  await ready(1);
  const atA = await geometry();
  await page.evaluate(() => fixture.render('Transition', { progress: 1 }));
  await page.waitForFunction(() => fixture.controllers.at(-1).value === 1);
  const atB = await geometry();
  assert.notEqual(atA, atB);
  await page.evaluate(() => fixture.render('Transition', { progress: 0, className: 'updated' }));
  await page.waitForFunction(() => fixture.controllers.at(-1).value === 0);
  assert.equal(await geometry(), atA);
  assert.equal(await page.evaluate(() => fixture.stats.ready), 1, 'progress, host attributes and fresh callbacks do not recreate controllers');

  await page.evaluate(() => fixture.controllers.at(-1).play({ from: 0, to: 1, duration: 30 }));
  await page.waitForFunction(() => fixture.controllers.at(-1).value === 1);
  assert.equal(await geometry(), atB);
  await page.evaluate(() => fixture.controllers.at(-1).play({ from: 1, to: 0, duration: 30 }));
  await page.waitForFunction(() => fixture.controllers.at(-1).value === 0);
  assert.equal(await geometry(), atA);

  await page.evaluate(() => { document.getElementById('root').style.width = '360px'; });
  await page.waitForFunction(() => document.querySelector('svg').getBoundingClientRect().width <= 360);
  assert.equal(await page.evaluate(() => fixture.stats.ready), 1, 'container resize reuses controller');
  await page.evaluate(() => { document.getElementById('root').style.width = '640px'; });
  await page.waitForFunction(() => document.querySelector('svg').getBoundingClientRect().width > 500);

  await page.evaluate(() => fixture.render('Transition', { to: 'failed' }));
  await page.waitForFunction(() => fixture.stats.errors.length === 1);
  assert.equal(await geometry(), atA, 'failed replacement preserves the visible chart');
  assert.equal(await page.locator('#root [style*="visibility: hidden"]').count(), 0);

  await page.evaluate(() => fixture.render('Transition', { to: 'delayed', progress: 0 }));
  await page.waitForTimeout(50);
  assert.equal(await geometry(), atA, 'loading replacement keeps old chart');
  await page.evaluate(() => fixture.render('Transition', { to: 'delayed', progress: 1 }));
  await page.evaluate(() => fixture.release());
  await ready(2);
  assert.equal(await geometry(), atB, 'async mount adopts latest progress');
  assert.equal(await page.evaluate(() => fixture.stats.destroyed), 1);

  await page.evaluate(() => fixture.render('Sequence', { progress: 2 }));
  await ready(3);
  assert.equal(await page.evaluate(() => fixture.controllers.at(-1).value), 2);
  await page.evaluate(() => fixture.render('Sequence', { progress: 0 }));
  await page.waitForFunction(() => fixture.controllers.at(-1).value === 0);
  assert.equal(await geometry(), atA);

  await page.evaluate(() => fixture.render('Chart', { state: 'b' }));
  await ready(4);
  assert.equal(await geometry(), atB);
  await page.evaluate(() => fixture.render('Chart', { state: 'a' }));
  await ready(5);
  assert.equal(await geometry(), atA);
  await page.evaluate(() => fixture.clear());
  await page.waitForFunction(() => fixture.stats.cleaned === 5);
  assert.equal(await page.locator('#root svg').count(), 0);
  assert.equal(await page.evaluate(() => fixture.stats.destroyed), 5);

  await page.evaluate(() => fixture.render('Chart', { state: 'delayed' }));
  await page.waitForTimeout(50);
  await page.evaluate(() => fixture.clear());
  await page.waitForFunction(() => document.getElementById('root').childElementCount === 0);
  await page.evaluate(() => fixture.release());
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#root svg').count(), 0);
  assert.equal(await page.evaluate(() => fixture.stats.ready), 5, 'late completion cannot remount an unmounted component');
  await page.evaluate(() => fixture.render('Chart', { state: 'failed' }));
  await page.waitForFunction(() => fixture.stats.errors.length === 2);
  assert.equal(await page.locator('#root [style*="visibility: hidden"]').count(), 0, 'failed initial creation removes its preparation mount');
  await page.evaluate(() => fixture.clear());

  await page.evaluate(() => fixture.render('Chart', { width: 320 }));
  await ready(6);
  assert.ok(await page.locator('#root svg').first().evaluate(svg => svg.getBoundingClientRect().width <= 320));
  await page.evaluate(() => fixture.render('Chart'));
  await ready(7);
  assert.ok(await page.locator('#root svg').first().evaluate(svg => svg.getBoundingClientRect().width > 500), 'removing an explicit width restores container sizing');
  await page.evaluate(() => fixture.clear());
  await page.waitForFunction(() => fixture.stats.cleaned === 7);
  assert.equal(await page.evaluate(() => fixture.stats.destroyed), 7);
  for (const [kind, props, expected] of [
    ['Chart', { state: 'b' }, atB],
    ['Transition', { progress: 0 }, atA],
    ['Transition', { progress: 1 }, atB],
    ['Sequence', { progress: 0 }, atA],
    ['Sequence', { progress: 1 }, atB],
  ]) {
    const before = await page.evaluate(() => fixture.stats.ready);
    await page.evaluate(([kind, props]) => fixture.render(kind, { ...props, json: true }), [kind, props]);
    // Explicit unmount between cases also exercises JSON controller cleanup.
    await ready(before + 1);
    assert.equal(await geometry(), expected, `${kind} JSON matches builder geometry`);
    await page.evaluate(() => fixture.clear());
    await page.waitForFunction(() => !document.querySelector('#root svg'));
  }
  const before = await page.evaluate(() => fixture.stats.ready);
  await page.evaluate(() => fixture.render('Chart', { state: 'single', progress: 2 }));
  await ready(before + 1);
  assert.equal(await geometry(), atA, 'one-element arrays render a static state');
  assert.equal(await page.evaluate(() => fixture.controllers.at(-1).value), 0);
  const failures = await page.evaluate(() => fixture.stats.errors.length);
  await page.evaluate(() => fixture.render('Chart', { state: 'empty' }));
  await page.waitForFunction(count => fixture.stats.errors.length === count + 1, failures);
  assert.match(await page.evaluate(() => fixture.stats.errors.at(-1)), /at least one/);
  assert.equal(await geometry(), atA, 'empty input reports an error and preserves the previous chart');
  await page.evaluate(() => fixture.render('Sequence', { progress: 2 }));
  await ready(before + 2);
  await page.evaluate(() => fixture.render('Transition'));
  await ready(before + 3);
  assert.equal(await page.evaluate(() => fixture.controllers.at(-1).value), 1, 'shorter routes clamp preserved progress');
  assert.equal(await geometry(), atB);
  await page.evaluate(() => fixture.render('Chart', { state: 'a' }));
  await ready(before + 4);
  assert.equal(await page.evaluate(() => fixture.controllers.at(-1).value), 0, 'returning to a single state resets progress');
  await page.evaluate(() => fixture.clear());
  assert.deepEqual(errors, []);
});
