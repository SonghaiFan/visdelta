// Exercise the built package with one bundle, independent lazy bundles (the
// jsDelivr +esm boundary), and the global distribution. No CDN is needed in CI.
// VISDELTA_CDN_VERSION additionally checks a real, already published release.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const cache = new Map();
const served = new Set();
async function bundle(file, independent) {
  const key = `${independent}:${file}`;
  if (!cache.has(key)) cache.set(key, build({
    entryPoints: [file], bundle: true, write: false, format: 'esm', target: 'es2020',
    plugins: independent ? [{ name: 'independent-lazy-bundles', setup(builder) {
      builder.onResolve({ filter: /^\./ }, args => {
        if (args.kind !== 'dynamic-import') return;
        const path = resolve(args.resolveDir, args.path);
        assert.ok(path.startsWith(dist + sep));
        return { path: `/rewritten/${relative(dist, path).split(sep).join('/')}`, external: true };
      });
    } }] : []
  }).then(result => result.outputFiles[0].text));
  return cache.get(key);
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript');
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/dist/visdelta.css"><body>');
    } else if (path === '/bundled.js') res.end(await bundle(resolve(dist, 'visdelta.esm.js'), false));
    else if (path.startsWith('/rewritten/')) {
      const file = resolve(dist, path.slice('/rewritten/'.length));
      assert.ok(file.startsWith(dist + sep));
      served.add(relative(dist, file));
      res.end(await bundle(file, true));
    } else {
      const file = resolve(root, path.slice(1));
      assert.ok(file.startsWith(dist + sep));
      res.end(await readFile(file));
    }
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  const modes = ['bundler', 'independent-lazy', 'global'];
  if (process.env.VISDELTA_CDN_VERSION) modes.push('cdn-esm', 'cdn-global');
  for (const mode of modes) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    if (mode === 'global' || mode === 'cdn-global') {
      await page.addScriptTag({ url: mode === 'global' ? '/dist/visdelta.global.js' : `https://cdn.jsdelivr.net/npm/visdelta@${process.env.VISDELTA_CDN_VERSION}` });
      await page.evaluate(() => { window.vd = window.VisDelta; });
    } else {
      const url = mode === 'bundler' ? '/bundled.js' : mode === 'independent-lazy' ? '/rewritten/visdelta.esm.js' : `https://cdn.jsdelivr.net/npm/visdelta@${process.env.VISDELTA_CDN_VERSION}/+esm`;
      await page.evaluate(async url => { window.vd = await import(url); }, url);
    }
    const result = await page.evaluate(async () => {
      const vd = window.vd;
      const check = (condition, message) => { if (!condition) throw Error(message); };
      const mount = (width = 600) => {
        const host = document.createElement('div');
        host.style.cssText = `width:${width}px;height:500px`;
        document.body.append(host);
        return host;
      };
      const transition = async (a, b, width = 600) => {
        const host = mount(width);
        const t = await vd.transition(a, b, { target: host, width, height: 500 });
        return { host, t, dispose() { t.destroy(); host.remove(); } };
      };
      const play = async (t, from = 0, to = 1) => {
        t.play({ duration: 50, from, to });
        const deadline = performance.now() + 10000;
        while (t.value !== to) {
          check(performance.now() < deadline, `play timeout at ${t.value}`);
          await new Promise(requestAnimationFrame);
        }
      };
      const heights = host => [...host.querySelectorAll('.vd-bar')].map(n => +n.getAttribute('height'));
      const ys = host => [...host.querySelectorAll('.vd-y-axis .tick text')].map(n => n.textContent).filter(Boolean);
      const paths = host => [...host.querySelectorAll('.vd-line')].filter(n => +getComputedStyle(n).opacity > 0).map(n => n.getAttribute('d')).sort();
      // Complementary progress can differ by floating-point roundoff; retain
      // geometry to 1e-8 pixels rather than comparing DOM number spellings.
      const numeric = value => +Number(value).toFixed(8);
      const points = host => [...host.querySelectorAll('.vd-line-point')].map(n => [n.getAttribute('data-key'), numeric(n.getAttribute('cx')), numeric(n.getAttribute('cy'))]).sort();
      const axisGeometry = host => [...host.querySelectorAll('.vd-axis .tick')].filter(n => n.textContent).map(n => [n.textContent, ...(n.getAttribute('transform')?.match(/[-\d.]+/g) ?? []).map(numeric)]);
      const snapshot = host => ({ ticks: ys(host), axes: axisGeometry(host), paths: paths(host), points: points(host) });
      const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), `${message}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      const rows = Array.from({ length: 10 }, (_, i) => [
        { date: new Date(2026, 0, i + 1), ticker: 'A', v: 300 + i * 10 },
        { date: new Date(2026, 0, i + 1), ticker: 'B', v: 2000 + i * 20 }
      ]).flat();
      const line = data => vd.line(data).x('date').y('v').key(['date', 'ticker']).breakdown('ticker').color('ticker')
        .with({ margin: { top: 24, right: 30, bottom: 50, left: 65 } });
      const base = line(rows);
      const onlyA = base.where({ ticker: 'A' });
      const products = [{ p: 'A', a: 12, b: 5 }, { p: 'B', a: 18, b: 11 }];
      const bar = vd.bar(products).x('p').y('a');
      const bars = await transition(bar, bar.y('b'));
      for (const p of [0, 0.5, 1, 0.25, 1]) {
        bars.t.progress(p);
        check(heights(bars.host).length === 2 && heights(bars.host).every(h => h > 0), `empty bars at ${p}`);
      }
      const lastHeights = heights(bars.host);
      await play(bars.t);
      same(heights(bars.host), lastHeights, 'bar play endpoint');
      await play(bars.t, 1, 0);
      bars.t.resize({ width: 360, height: 400 });
      bars.t.progress(1);
      check(heights(bars.host).every(h => h > 0), 'bars after resize');
      bars.dispose();

      const filtered = await transition(onlyA, onlyA);
      filtered.t.progress(1);
      same(ys(filtered.host).filter(s => /[0-9]/.test(s)).filter(s => !s.includes(',')), ['390','380','370','360','350','340','330','320','310','300'], 'visible y domain');
      check(!ys(filtered.host).includes('2,180'), 'filtered-out endpoint tick');
      const legendLabels = [...filtered.host.querySelectorAll('.vd-legend text')].map(n => n.textContent);
      check(legendLabels.includes('A') && legendLabels.includes('B'), 'filter changed full-lineage legend');
      check([...filtered.host.querySelectorAll('.vd-line')].every(n => +n.getAttribute('stroke-dashoffset') === 0), 'entering line remains undrawn');
      const independent = await transition(line(rows.filter(r => r.ticker === 'A')), line(rows.filter(r => r.ticker === 'A')));
      independent.t.progress(1);
      same(snapshot(filtered.host), snapshot(independent.host), 'filtered vs independent static endpoint');
      const colorA = filtered.host.querySelector('.vd-line').getAttribute('stroke');
      filtered.dispose(); independent.dispose();

      for (const width of [360, 800]) {
        const forward = await transition(onlyA, base, width);
        const reverse = await transition(base, onlyA, width);
        const inspection = await forward.t.inspect();
        const samples = new Set([0, 0.25, 0.5, 0.75, 1]);
        for (const phase of inspection.stages) {
          for (const local of [0, 0.25, 0.5, 0.75, 1]) samples.add(phase.start + (phase.end - phase.start) * local);
          for (const property of phase.properties) {
            const local = (property.start + property.end) / 2;
            if (local >= 0 && local <= 1) samples.add(phase.start + (phase.end - phase.start) * local);
          }
        }
        for (const p of [...samples].sort((a, b) => a - b).concat([0.5, 0])) {
          forward.t.progress(p); reverse.t.progress(1 - p);
          same(snapshot(forward.host), snapshot(reverse.host), `line reverse frame ${p}`);
        }
        await play(forward.t); await play(reverse.t);
        const start = await transition(onlyA, onlyA, width); start.t.progress(1);
        const end = await transition(base, base, width); end.t.progress(1);
        same(snapshot(forward.host), snapshot(end.host), 'complete forward endpoint');
        same(snapshot(reverse.host), snapshot(start.host), 'complete reverse endpoint');
        check(start.host.querySelector('.vd-line').getAttribute('stroke') === colorA, 'declared category colors changed');
        forward.t.resize({ width: width + 30, height: 500 }); forward.t.progress(0);
        const resized = await transition(onlyA, onlyA, width + 30); resized.t.progress(1);
        same(snapshot(forward.host), snapshot(resized.host), 'resized filtered endpoint');
        for (const c of [forward, reverse, start, end, resized]) c.dispose();
      }
      // Prefix filtering changes the inferred temporal domain as well as y.
      const prefixRows = rows.filter(r => r.ticker === 'B' && r.date < rows[12].date);
      const prefix = base.where({ ticker: 'B' }).where({ field: 'date', lt: rows[12].date });
      const prefixChange = await transition(base, prefix);
      const prefixStatic = await transition(line(prefixRows), line(prefixRows));
      prefixChange.t.progress(1); prefixStatic.t.progress(1);
      same(snapshot(prefixChange.host), snapshot(prefixStatic.host), 'prefix filtered static endpoint');
      const allStatic = await transition(base, base); allStatic.t.progress(1);
      const strokeB = [...allStatic.host.querySelectorAll('.vd-line')].find(n => n.__data__.rows[0].ticker === 'B').getAttribute('stroke');
      check(prefixChange.host.querySelector('.vd-line').getAttribute('stroke') === strokeB, 'B color lost after filtering A');
      prefixChange.dispose(); prefixStatic.dispose(); allStatic.dispose();
      // Keep this domain assertion independent of the compact default tick format.
      const fixed = base.y('v', { domain: [250, 2250], format: ',d' }).x('date', { domain: [rows[0].date, rows.at(-1).date] });
      const fixedChange = await transition(fixed, fixed.where({ ticker: 'A' }));
      fixedChange.t.progress(1);
      check(ys(fixedChange.host).includes('2,000'), `filter overrode explicit domain: ${ys(fixedChange.host)}`);
      fixedChange.dispose();
      for (const layout of ['simple', 'grouped', 'stacked']) {
        const raw = vd.bar([{ p: 'A', g: 'one', v: 8 }, { p: 'A', g: 'two', v: 5 }, { p: 'B', g: 'one', v: 9 }]).x('p').y('v');
        const state = (layout === 'simple' ? raw.rollup() : raw.breakdown('g', { layout })).y('v', { domain: [1.3, 19.7] });
        const explicit = await transition(state, state); explicit.t.progress(1);
        const values = ys(explicit.host).map(v => Number(v.replaceAll(',', '')));
        check(values.length > 0 && values.every(v => v >= 1.3 && v <= 19.7), `${layout} bar niced explicit domain: ${values}`);
        explicit.dispose();
      }
      const empty = await transition(onlyA, base.where({ ticker: 'missing' }));
      empty.t.progress(1);
      check(paths(empty.host).length === 0, 'empty filter leaves visible lines');
      empty.t.progress(0); check(paths(empty.host).length === 1, 'empty filter cannot restore'); empty.dispose();
      const gapped = await transition(base.where({ field: 'date', notEqual: rows[8].date }), base.where({ field: 'date', notEqual: rows[8].date }));
      gapped.t.progress(1);
      // Four stretches, two per series, must survive domain inference changes.
      check(paths(gapped.host).length === 4, `lost topology gaps: ${paths(gapped.host).length}`); gapped.dispose();

      const logged = base.y('v', { domain: [80, 3000], scale: { type: 'log', base: 10 } });
      const log = await transition(base, logged); log.t.progress(1);
      check(!ys(log.host).some(s => ['10','10k','2.18k'].includes(s)), `incorrect log ticks: ${ys(log.host)}`);
      const staticLog = await transition(logged, logged); staticLog.t.progress(1);
      same(snapshot(log.host), snapshot(staticLog.host), 'log static endpoint');
      await play(log.t, 1, 0); log.dispose(); staticLog.dispose();

      const seqHost = mount();
      const seq = await vd.sequence([onlyA, base, onlyA], { target: seqHost, width: 600, height: 500 });
      for (const p of [0, 1, 2, 1, 0]) {
        seq.progress(p);
        check([...seqHost.querySelectorAll('.vd-line')].every(n => +n.getAttribute('stroke-dashoffset') === 0), `sequence undrawn line at ${p}`);
      }
      const seqEndpoint = await transition(onlyA, onlyA); seqEndpoint.t.progress(1);
      same(snapshot(seqHost), snapshot(seqEndpoint.host), 'sequence restored endpoint');
      seqEndpoint.dispose(); seq.destroy(); seqHost.remove();
      return { widths: [360, 800], bars: lastHeights, filteredDomain: [300, 390], logDomain: [80, 3000] };
    });
    assert.deepEqual(errors, [], `${mode} page errors`);
    console.log(`${mode}: ${JSON.stringify(result)}`);
    await page.close();
  }
  assert.ok(served.has('charts/bar/plugin.js') && served.has('charts/line/plugin.js'), 'lazy plugins must load as independent bundles');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
