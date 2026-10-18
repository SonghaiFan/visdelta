// Browser acceptance checks for the single source copied into the docs site.
// Default: pin URLs remain in the HTML, served by an instrumented frozen local
// package. VISDELTA_TEMPLATE_CDN=1 additionally runs the unchanged published CDN.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(new URL('../examples/templates/scroll-story.html', import.meta.url), 'utf8');
const guide = await readFile(new URL('../llms.txt', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const quickStart = guide.match(/```html\n([\s\S]*?)```/)[1];
const bundled = (await build({
  stdin: { contents: `
    export * from './dist/index.js';
    import { sequence as createSequence, transition as createTransition } from './dist/index.js';
    const metrics = window.__agentMetrics = { progress: 0, resize: 0 };
    window.__agentApi = { transition: createTransition };
    export async function sequence(...args) {
      const controller = await createSequence(...args);
      const progress = controller.progress.bind(controller), resize = controller.resize.bind(controller);
      controller.progress = (...args) => { metrics.progress++; return progress(...args); };
      controller.resize = (...args) => { metrics.resize++; return resize(...args); };
      window.__agentController = controller;
      return controller;
    }
    export async function transition(...args) {
      const controller = await createTransition(...args);
      window.__agentPair = controller;
      return controller;
    }
  `, resolveDir: root }, bundle: true, write: false, format: 'esm', target: 'es2020'
})).outputFiles[0].text;
let origin;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (url.pathname === '/quick-start') res.end(quickStart);
  else if (url.pathname === '/parent') {
    const bridge = url.searchParams.get('bridge') ?? 'off';
    res.end(`<!doctype html><title>Embedding fixture</title><script>window.handshakes=[];addEventListener('message',e=>window.handshakes.push(e.data));</script><iframe title="Story" src="/story?bridge=${bridge}" style="width:100%;height:650px;border:0"></iframe><div style="height:2000px"></div>`);
  } else if (url.pathname === '/story') {
    const bridge = url.searchParams.get('bridge');
    const parent = bridge === 'on' ? origin : bridge === 'wrong' ? 'https://another-parent.example' : null;
    res.end(parent ? html.replace('const PARENT_ORIGIN = null;', `const PARENT_ORIGIN = ${JSON.stringify(parent)};`) : html);
  } else { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const failures = [];
const errorsFor = page => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
};
async function prepare(context) {
  if (!process.env.VISDELTA_TEMPLATE_CDN) await context.route('https://cdn.jsdelivr.net/npm/visdelta@**', async route => {
    const url = new URL(route.request().url());
    assert.ok(url.pathname.startsWith(`/npm/visdelta@${pkg.version}/`), `unpinned or mismatched URL: ${url}`);
    if (url.pathname.endsWith('/+esm')) await route.fulfill({ contentType: 'text/javascript', body: bundled });
    else if (url.pathname.endsWith('/dist/visdelta.css')) await route.fulfill({ contentType: 'text/css', body: await readFile(`${root}/dist/visdelta.css`, 'utf8') });
    else throw Error(`Unexpected CDN request: ${url}`);
  });
}
const ready = frame => frame.waitForFunction(() => document.documentElement.dataset.storyReady === 'true');
const value = frame => frame.locator('#position').evaluate(n => Number(n.value));
async function seek(frame, next) {
  await frame.locator('#position').evaluate((n, next) => { n.value = String(next); n.dispatchEvent(new Event('input', { bubbles: true })); }, next);
}
async function waitValue(frame, target, tolerance = 0.005) {
  await frame.waitForFunction(({ target, tolerance }) => Math.abs(Number(document.querySelector('#position').value) - target) <= tolerance, { target, tolerance });
}
async function scrollTo(frame, index, fraction = 0) {
  await frame.evaluate(({ index, fraction }) => {
    const cards = [...document.querySelectorAll('[data-step]')];
    const anchors = cards.map(n => n.getBoundingClientRect().top + scrollY - innerHeight * 0.65);
    const y = fraction ? anchors[index] + (anchors[index + 1] - anchors[index]) * fraction : anchors[index] + 1;
    window.scrollTo(0, y);
  }, { index, fraction });
}
async function staticEndpoint(frame, stateIndex) {
  if (process.env.VISDELTA_TEMPLATE_CDN) return;
  const result = await frame.evaluate(async stateIndex => {
    const controller = window.__agentController;
    const chart = document.querySelector('#chart');
    const reference = document.createElement('div');
    reference.style.cssText = `position:fixed;left:-10000px;width:${chart.clientWidth}px;height:${chart.clientHeight}px`;
    document.body.append(reference);
    const state = controller.states[stateIndex];
    const pair = await window.__agentApi.transition(state, state, { target: reference, width: 'auto', height: 'auto' });
    pair.progress(1);
    const capture = host => ({
      paths: [...host.querySelectorAll('.vd-line')].map(n => [n.getAttribute('d'), Number(n.getAttribute('stroke-dashoffset') ?? 0), getComputedStyle(n).opacity, n.getAttribute('stroke')]),
      points: [...host.querySelectorAll('.vd-line-point')].map(n => ['cx', 'cy', 'r'].map(key => +Number(n.getAttribute(key)).toFixed(6))),
      ticks: [...host.querySelectorAll('.vd-axis .tick')].filter(n => n.textContent).map(n => [n.textContent, n.getAttribute('transform')])
    });
    const actual = capture(chart), expected = capture(reference);
    pair.destroy(); reference.remove();
    return { actual, expected };
  }, stateIndex);
  assert.deepEqual(result.actual, result.expected, `independent static keyframe ${stateIndex}`);
}
async function check(name, run) {
  try { await run(); console.log(`ok   ${name}`); }
  catch (error) { failures.push(`${name}: ${error.stack}`); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  await check('agent quick start draws the exact copied endpoint', async () => {
    const context = await browser.newContext(); await prepare(context);
    const page = await context.newPage(); const errors = errorsFor(page);
    await page.goto(`${origin}/quick-start`);
    await page.waitForFunction(() => document.querySelectorAll('.vd-bar').length === 3 && [...document.querySelectorAll('.vd-bar')].every(n => +n.getAttribute('height') > 0));
    if (!process.env.VISDELTA_TEMPLATE_CDN) assert.equal(await page.evaluate(() => window.__agentPair.value), 1);
    assert.deepEqual(errors, []); await context.close();
  });
  for (const width of [1280, 390]) await check(`${width}px: holds, forward/reverse endpoints, resize, theme, replay and idle`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: width === 390 ? 'Australia/Melbourne' : 'UTC' }); await prepare(context);
    const page = await context.newPage(); const errors = errorsFor(page);
    await page.goto(`${origin}/story`); await ready(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
    assert.equal(await page.locator('#data-table tbody td').first().textContent(), '01/01/2026', 'local calendar date shifted');
    await scrollTo(page, 0, 0.2); await waitValue(page, 0);
    await scrollTo(page, 0, 0.725); await waitValue(page, 0.5);
    for (const index of [1, 2, 3, 2, 1, 0]) {
      await scrollTo(page, index); await waitValue(page, index); await staticEndpoint(page, index);
      assert.equal(await page.locator(`[data-step="${index}"]`).getAttribute('aria-current'), 'step');
    }
    await seek(page, 1.5); await waitValue(page, 1.5);
    const before = await page.locator('.vd-y-axis .tick text').first().evaluate(n => getComputedStyle(n).fill);
    await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await value(page), 1.5);
    const after = await page.locator('.vd-y-axis .tick text').first().evaluate(n => getComputedStyle(n).fill);
    assert.notEqual(after, before, 'chart theme did not refresh');
    await page.setViewportSize({ width: width === 390 ? 430 : 1050, height: 780 });
    await waitValue(page, 1.5);
    await seek(page, 2); await staticEndpoint(page, 2);
    await page.locator('#replay').click();
    await page.waitForFunction(() => Number(document.querySelector('#position').value) > 0.02 && Number(document.querySelector('#position').value) < 1);
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => document.querySelector('#replay').textContent === 'Replay');
    await page.locator('#replay').click();
    await waitValue(page, 3); await staticEndpoint(page, 3);
    if (!process.env.VISDELTA_TEMPLATE_CDN) {
      await page.waitForTimeout(150);
      const writes = await page.evaluate(() => window.__agentMetrics.progress);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__agentMetrics.progress), writes, 'idle template repeatedly sought the chart');
    }
    await page.screenshot({ path: `/tmp/visdelta-scroll-${width}.png`, fullPage: false });
    if (!process.env.VISDELTA_TEMPLATE_CDN) {
      assert.equal(await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        try { window.__agentController.progress(1); return false; }
        catch (error) { return error.message.includes('destroyed'); }
      }), true, 'template did not destroy its sequence on exit');
    }
    assert.deepEqual(errors, []); await context.close();
  });
  await check('reduced motion snaps to authored states without replay animation', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 840 }, reducedMotion: 'reduce' }); await prepare(context);
    const page = await context.newPage(); const errors = errorsFor(page);
    await page.goto(`${origin}/story`); await ready(page);
    await scrollTo(page, 0, 0.8); await waitValue(page, 1);
    await seek(page, 1.5); await waitValue(page, 2);
    await page.locator('#replay').click(); await waitValue(page, 3);
    assert.equal(await page.locator('#replay').textContent(), 'Replay');
    await staticEndpoint(page, 3); assert.deepEqual(errors, []); await context.close();
  });
  await check('iframe: internal scroll and expanded-height manual fallback', async () => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } }); await prepare(context);
    const page = await context.newPage(); const errors = errorsFor(page);
    await page.goto(`${origin}/parent`);
    const frame = page.frames().find(f => f.url().includes('/story'));
    await ready(frame);
    await scrollTo(frame, 2); await waitValue(frame, 2); await staticEndpoint(frame, 2);
    await frame.evaluate(() => window.scrollTo(0, 0));
    await page.locator('iframe').evaluate(n => { n.style.height = '15000px'; });
    await frame.waitForFunction(() => !document.querySelector('#embed-note').hidden);
    await seek(frame, 1); await waitValue(frame, 1); await staticEndpoint(frame, 1);
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);
    assert.equal(await value(frame), 1, 'parent scrolling incorrectly moved an expanded child');
    await frame.locator('#replay').evaluate(n => n.click());
    await waitValue(frame, 3); await staticEndpoint(frame, 3);
    assert.deepEqual(errors, []); await context.close();
  });
  if (!process.env.VISDELTA_TEMPLATE_CDN) await check('iframe: explicit origin/source/ID handshake and finite clamped leg positions', async () => {
    const context = await browser.newContext(); await prepare(context);
    const page = await context.newPage(); const errors = errorsFor(page);
    await page.goto(`${origin}/parent?bridge=on`);
    await page.waitForFunction(() => window.handshakes.some(m => m?.type === 'visdelta:story-ready' && m.id === 'network-story' && m.max === 3));
    const frame = page.frames().find(f => f.url().includes('/story')); await ready(frame);
    const send = data => page.evaluate(data => document.querySelector('iframe').contentWindow.postMessage(data, location.origin), data);
    await send({ type: 'visdelta:story-progress', id: 'network-story', progress: 1.5 }); await waitValue(frame, 1.5);
    await send({ type: 'visdelta:story-progress', id: 'wrong', progress: 0 });
    await send({ type: 'visdelta:story-progress', id: 'network-story', progress: NaN });
    await frame.evaluate(() => window.postMessage({ type: 'visdelta:story-progress', id: 'network-story', progress: 0 }, location.origin));
    await page.waitForTimeout(100); assert.equal(await value(frame), 1.5);
    await send({ type: 'visdelta:story-progress', id: 'network-story', progress: 99 }); await waitValue(frame, 3);
    await page.goto(`${origin}/parent?bridge=wrong`);
    const wrong = page.frames().find(f => f.url().includes('/story')); await ready(wrong);
    await send({ type: 'visdelta:story-progress', id: 'network-story', progress: 3 });
    await page.waitForTimeout(100); assert.equal(await value(wrong), 0, 'wrong parent origin was accepted');
    assert.deepEqual(errors, []); await context.close();
  });
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
if (failures.length) throw Error(failures.join('\n\n'));
console.log(`Agent examples verified${process.env.VISDELTA_TEMPLATE_CDN ? ' against the live pinned CDN' : ' against the frozen local package'}.`);
