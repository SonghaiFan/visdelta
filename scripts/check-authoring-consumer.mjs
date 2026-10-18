// Exercise the downstream lifecycle example against an installed tarball.
// Never alias imports to src/ or rebuild dist during this browser run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const consumer = await mkdtemp(join(tmpdir(), 'visdelta-authoring-'));
let server, browser;
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}
try {
  let tarball = process.env.VISDELTA_CONSUMER_TARBALL;
  if (!tarball) {
    const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', consumer], root));
    tarball = join(consumer, packed.filename);
  }
  await writeFile(join(consumer, 'package.json'), '{"type":"module","private":true}');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
  const installed = JSON.parse(await readFile(join(consumer, 'node_modules/visdelta/package.json'), 'utf8'));
  console.log(`Installed consumer: ${installed.name}@${installed.version}`);
  for (const file of ['network-states.mjs', 'sales.mjs', 'mount-story.mjs']) {
    await writeFile(join(consumer, file), await readFile(join(root, 'examples/authoring', file)));
  }
  const bundle = (await build({ stdin: { contents: `
    import { mountStory } from './mount-story.mjs';
    import { states, network } from './network-states.mjs';
    import { chart as salesChart } from './sales.mjs';
    import { transition, sequence, point } from 'visdelta';
    import { defineChartType, registerChartModule } from 'visdelta/plugins';
    window.storyExample = { mountStory, states, network, salesChart, transition, sequence, point, defineChartType, registerChartModule };
  `, resolveDir: consumer }, bundle: true, write: false, format: 'esm' })).outputFiles[0].text;
  const css = await readFile(join(consumer, 'node_modules/visdelta/dist/visdelta.css'));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); }
    else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><link rel="stylesheet" href="/style.css"><style>body{font-family:Arial,sans-serif;--integration-probe:3}.vd-transition-root{--integration-probe:19}.host{width:600px;height:360px}</style><div id="a" class="host"></div><div id="b" class="host"></div><script type="module" src="/app.js"></script>`); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.storyExample);

  const scoped = await page.evaluate(async () => {
    const { sequence, transition, defineChartType, registerChartModule } = window.storyExample;
    registerChartModule({ plugin: defineChartType({
      key: 'integration-scope-probe',
      createRenderer(runtime) {
        return (chart, rows) => {
          const circles = chart.scene.markRoot.selectAll('circle').data(rows).join('circle');
          runtime.motion(circles, chart.transition.base).attr('cx', row => row.value + runtime.themeValue('--integration-probe', -1)).attr('cy', 20).attr('r', 3);
        };
      },
    }) });
    const state = value => ({ mark: 'integration-scope-probe', data: [{ id: 'a', value }], encoding: {}, key: 'id' });
    const states = [state(1), state(2), state(1)];
    const a = document.querySelector('#a'), b = document.querySelector('#b');
    const story = await sequence(states, { target: a, width: 'auto', height: 'auto' });
    const samples = [];
    for (const index of [0, 1, 2, 1, 0]) {
      story.progress(index); story.resize();
      const reference = await transition(states[index], states[index], { target: b, width: 'auto', height: 'auto' });
      reference.progress(1);
      samples.push({ actual: Number(a.querySelector('circle').getAttribute('cx')), expected: Number(b.querySelector('circle').getAttribute('cx')), authored: 19 + states[index].data[0].value });
      reference.destroy(); b.replaceChildren();
    }
    a.querySelector('.vd-transition-root').style.setProperty('--integration-probe', '29');
    story.resize();
    const themed = Number(a.querySelector('circle').getAttribute('cx'));
    story.destroy(); a.replaceChildren();
    return { samples, themed };
  });
  for (const sample of scoped.samples) {
    assert.equal(sample.actual, sample.authored, 'Custom plugin lost its chart-scoped theme after reparenting');
    assert.equal(sample.actual, sample.expected);
  }
  assert.equal(scoped.themed, 30, 'Resize must read the current chart-root theme');
  console.log('ok   custom plugin: chart-scoped tokens survive leg handoff, reversal, resize and theme changes');

  const frames = await page.evaluate(async () => {
    const { mountStory, states, transition } = window.storyExample;
    const a = document.querySelector('#a'), b = document.querySelector('#b');
    const story = mountStory(a, states);
    story.seek(1); // The last requested frame survives asynchronous creation.
    const controller = await story.ready;
    const capture = host => ({
      marks: [...host.querySelectorAll('.vd-line')].map(n => ({ d: n.getAttribute('d'), opacity: n.getAttribute('opacity'), stroke: n.getAttribute('stroke') })),
      ticks: [...host.querySelectorAll('.vd-x-axis .tick, .vd-y-axis .tick')].map(n => ({ text: n.textContent, transform: n.getAttribute('transform') })),
      legend: [...host.querySelectorAll('.vd-legend-item')].map(n => ({ text: n.textContent, transform: n.getAttribute('transform') })),
    });
    const endpoints = [];
    for (const index of [1, 2, 0, 2, 1, 0]) {
      story.seek(index);
      const reference = await transition(states[index], states[index], { target: b, width: 'auto', height: 'auto' });
      reference.progress(1);
      endpoints.push({ actual: capture(a), expected: capture(b) });
      reference.destroy(); b.replaceChildren();
    }
    story.seek(0.5); const half = capture(a);
    story.seek(1.5); story.seek(0.5); const revisited = capture(a);
    a.style.width = '390px'; story.resize();
    const width = a.querySelector('svg').getBoundingClientRect().width;
    const value = controller.value;
    story.destroy(); story.destroy();
    let rejected = false; try { story.seek(1); } catch { rejected = true; }
    return { endpoints, half, revisited, width, value, empty: !a.children.length, rejected };
  });
  for (const frame of frames.endpoints) {
    assert.equal(frame.actual.marks.length, 2, 'Expected two nonempty line geometries');
    assert.ok(frame.actual.marks.every(mark => mark.d && /[1-9]/.test(mark.d)), 'Line endpoint must contain geometry');
    assert.ok(frame.actual.ticks.length > 0, 'Authored frame must include explanatory axes');
    assert.deepEqual(frame.actual, frame.expected, 'Authored endpoint differs from independent static render');
  }
  assert.deepEqual(frames.half, frames.revisited, 'Scrubbing must not accumulate frame history');
  assert.equal(Number(frames.width), 390);
  assert.equal(frames.value, 0.5);
  assert.ok(frames.empty && frames.rejected);
  console.log('ok   installed story: authored boundaries, pending seek, reverse, jumps, resize and cleanup');

  const lifecycle = await page.evaluate(async () => {
    const { mountStory, states, network, point } = window.storyExample;
    const a = document.querySelector('#a'), b = document.querySelector('#b');
    const before = document.body.children.length;
    const stale = mountStory(a, states);
    stale.destroy();
    const current = mountStory(a, states);
    const staticChart = mountStory(b, [network.north]);
    current.seek(2); staticChart.seek(99);
    const [cancelled, active, single] = await Promise.all([stale.ready, current.ready, staticChart.ready]);
    const result = { cancelled: cancelled === null, mounts: a.children.length, single: b.querySelectorAll('.vd-line').length, staticValue: staticChart.value, active: active.value };
    staticChart.destroy();
    result.independent = a.querySelectorAll('.vd-line').length === 2;
    // A failing preparation must release earlier legs and hidden mounts.
    const incompatible = point([{ x: 1, y: 2 }]).x('x').y('y');
    const bad = mountStory(b, [states[0], states[1], incompatible]);
    try { await bad.ready; result.error = ''; } catch (error) { result.error = error.message; }
    bad.destroy(); current.destroy();
    result.remaining = document.body.children.length - before;
    return result;
  });
  assert.ok(lifecycle.cancelled);
  assert.equal(lifecycle.mounts, 1, 'Stale asynchronous creation replaced the current mount');
  assert.equal(lifecycle.single, 2);
  assert.equal(lifecycle.staticValue, 0);
  assert.equal(lifecycle.active, 2);
  assert.ok(lifecycle.independent);
  assert.match(lifecycle.error, /same chart type/);
  assert.equal(lifecycle.remaining, 0, 'Preparation/error cleanup leaked hidden mounts');
  const minimal = await page.evaluate(async () => {
    const { salesChart, mountStory, transition } = window.storyExample;
    // This is the order the application collects from Step chart props.
    const steps = [salesChart, salesChart.highlight({ region: 'North' }), salesChart];
    const a = document.querySelector('#a'), b = document.querySelector('#b');
    a.style.width = b.style.width = '600px';
    const session = mountStory(a, steps);
    await session.ready;
    const capture = host => ({
      bars: [...host.querySelectorAll('.vd-bar')].map(node => ({
        geometry: ['x', 'y', 'width', 'height', 'fill'].map(name => node.getAttribute(name)),
        opacity: getComputedStyle(node).opacity,
      })),
      ticks: [...host.querySelectorAll('.vd-axis .tick')].map(node => ({ text: node.textContent, transform: node.getAttribute('transform') })),
    });
    const frames = [];
    for (const index of [0, 1, 2, 1, 0]) {
      session.seek(index);
      const reference = await transition(steps[index], steps[index], { target: b, width: 'auto', height: 'auto' });
      reference.progress(1);
      frames.push({ index, actual: capture(a), expected: capture(b) });
      reference.destroy(); b.replaceChildren();
    }
    session.destroy();
    return frames;
  });
  for (const { index, actual, expected } of minimal) {
    assert.deepEqual(actual, expected, 'Minimal Bar Step must match an independently mounted declaration');
    assert.equal(actual.bars.length, 3, 'Every region remains present without an explicit key');
    assert.ok(actual.bars.every(bar => Number(bar.geometry[2]) > 0 && Number(bar.geometry[3]) > 0), 'All minimal bars have nonzero geometry');
    assert.equal(actual.bars.filter(bar => Number(bar.opacity) === 1).length, index === 1 ? 1 : 3, 'Only the highlighted Step dims other regions');
  }
  assert.deepEqual(errors, []);
  console.log('ok   installed story: cancelled generation, static state, independent instances and preparation failure cleanup');
  console.log('ok   minimal Bar: inferred identity, inline Step attention and independent endpoints in both directions');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(consumer, { recursive: true, force: true });
}
