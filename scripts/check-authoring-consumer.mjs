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
  for (const file of ['network-states.mjs', 'sales.mjs', 'mount-story.mjs', 'complete-states.mjs', 'bar-layouts.mjs', 'likert.mjs']) {
    await writeFile(join(consumer, file), await readFile(join(root, 'examples/authoring', file)));
  }
  await writeFile(join(consumer,'folded-bar.mjs'),await readFile(join(root,'tests/fixtures/folded-bar.mjs')));
  const bundle = (await build({ stdin: { contents: `
    import { from as likertStack, to as likertDiverging } from './likert.mjs';
    import { layouts } from './bar-layouts.mjs';
    import { inspectBarSpec } from 'visdelta/bar';
    import { mountStory } from './mount-story.mjs';
    import { states, network } from './network-states.mjs';
    import { chart as salesChart } from './sales.mjs';
    import { sales as completeSales } from './complete-states.mjs';
    import { foldedBar } from './folded-bar.mjs';
    import { transition, sequence, point, render, pie } from 'visdelta';
    import { defineChartType, registerChartModule } from 'visdelta/plugins';
    import { chartStylePresets, defineChartStyle } from 'visdelta/chart-style';
    window.storyExample = { likertStack, likertDiverging, layouts, inspectBarSpec, foldedSpec:foldedBar.toSpec(), completeSales, render, pie, mountStory, states, network, salesChart, transition, sequence, point, defineChartType, registerChartModule, chartStylePresets, defineChartStyle };
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

  const likert = await page.evaluate(async () => {
    const { render, likertStack, likertDiverging, inspectBarSpec } = window.storyExample;
    const view = await render('#a', likertStack);
    const initial = view.snapshot().spec;
    const options = inspectBarSpec(likertDiverging.toSpec()).distribution;
    const message = {requestId:'installed-likert',baseRevision:0,edits:[{method:'layout',args:['diverging',options]}]};
    const preview = await view.previewEdit(message);
    const receipt = await view.edit(message, {duration:80});
    const current = view.snapshot().spec;
    const marks = [...document.querySelectorAll('#a .vd-bar')].map(n=>n.__data__);
    const flip = await view.edit({requestId:'installed-likert-flip',baseRevision:receipt.revision,edits:[{method:'flip',args:[]}]},{duration:80});
    const facts = inspectBarSpec(view.snapshot().spec);
    const attention = [];
    for (const target of [likertStack,likertDiverging]) {
      await view.update(target,{animate:false});
      const before=view.snapshot();
      const highlight={requestId:`installed-highlight-${before.revision}`,baseRevision:before.revision,edits:[{method:'highlight',args:[{response:'Strongly agree'}]}]};
      const proposed=await view.previewEdit(highlight);
      await view.edit(highlight,{duration:60});
      const accepted=view.snapshot();
      const read=()=>[...document.querySelectorAll('#a .vd-bar')].map(node=>({key:node.getAttribute('data-key'),count:node.__data__.count,share:node.__data__.__distributionShare,opacity:+getComputedStyle(node).opacity}));
      const lit=read();
      await view.edit({requestId:`installed-lit-flip-${accepted.revision}`,baseRevision:accepted.revision,edits:[{method:'flip',args:[]}]},{duration:60});
      const flipped=view.snapshot();
      const afterFlip=read();
      await view.edit({requestId:`installed-clear-${flipped.revision}`,baseRevision:flipped.revision,edits:[{method:'highlight',args:[null]}]},{duration:60});
      attention.push({proposed:proposed.spec,accepted:accepted.spec,lit,afterFlip,cleared:read()});
    }
    const matrix=[];
    for(const target of [likertStack.layout('stacked'),likertStack,likertDiverging]) {
      for(const edits of [
        [{method:'color',args:['#123456']}], [{method:'focus',args:[{question:'Parks n=200'}]}],
        [{method:'sort',args:['question','descending']}], [{method:'where',args:[{question:'Parks n=200'}]}],
        [{method:'x',args:['count',{label:'Responses'}]}],
        [{method:'color',args:['#123456']},{method:'highlight',args:[{response:'Agree'}]}],
        [{method:'flip',args:[]},{method:'highlight',args:[{response:'Agree'}]}],
      ]) {
        await view.update(target,{animate:false});
        const before=view.snapshot();
        const request={requestId:`installed-matrix-${before.revision}`,baseRevision:before.revision,edits};
        const preview=await view.previewEdit(request);
        const stable=view.snapshot().revision===before.revision;
        await view.edit(request,{duration:40});
        const after=view.snapshot();
        matrix.push({stable,preview:preview.spec,actual:after.spec,count:document.querySelectorAll('#a .vd-bar').length,filter:edits[0].method==='where',ghosts:document.querySelectorAll('#a .vd-axis-ghost').length});
      }
    }
    const ghosts = document.querySelectorAll('#a .vd-axis-ghost').length;
    view.destroy();
    return {matrix,attention,initial,preview,receipt,current,marks,flip,facts,ghosts};
  });
  assert.equal(likert.matrix.length,21);
  for(const state of likert.matrix) {
    assert.ok(state.stable);
    assert.deepEqual(state.preview,state.actual);
    assert.equal(state.count,state.filter?5:15);
    assert.equal(state.ghosts,0);
  }
  for(const state of likert.attention) {
    assert.deepEqual(state.proposed,state.accepted);
    assert.equal(state.lit.length,15);
    assert.equal(state.lit.filter(mark=>mark.opacity===1).length,3);
    assert.equal(state.lit.filter(mark=>mark.opacity<1).length,12);
    assert.deepEqual(state.afterFlip,state.lit);
    assert.ok(state.cleared.every(mark=>mark.opacity===1));
    assert.deepEqual(state.cleared.map(({opacity,...mark})=>mark),state.lit.map(({opacity,...mark})=>mark));
  }
  assert.equal(likert.receipt.status,'applied');
  assert.equal(likert.flip.status,'applied');
  assert.deepEqual(likert.current,likert.preview.spec);
  assert.deepEqual(likert.current.data,likert.initial.data);
  assert.equal(likert.facts.layout,'diverging');
  assert.equal(likert.facts.distribution.normalize,'percent');
  assert.equal(likert.marks.length,15);
  assert.equal(likert.ghosts,0);
  for (const total of [100,200,80]) {
    const group = likert.marks.filter(row=>row.__distributionTotal===total);
    assert.equal(group.length,5);
    assert.ok(Math.abs(group.reduce((sum,row)=>sum+row.__stack1-row.__stack0,0)-1)<1e-12);
  }
  console.log('ok   installed Likert: semantic preview/edit/flip, source counts and full percentage denominator');

  const layoutResults = await page.evaluate(async () => {
    const { layouts, inspectBarSpec, render } = window.storyExample;
    const results = [];
    for (const [name, chart] of Object.entries(layouts)) {
      const spec = chart.toSpec();
      const facts = inspectBarSpec(spec);
      const view = await render('#a', spec);
      const bounds = [...document.querySelectorAll('#a .vd-bar')].map(node => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      const axis = facts.orientation === 'vertical' ? 'x' : 'y';
      results.push({ name, facts, count: bounds.length,
        positions: new Set(bounds.map(box => Math.round(box[axis] * 100))).size,
        positive: bounds.every(box => box.width > 0 && box.height > 0) });
      view.destroy();
    }
    return results;
  });
  for (const result of layoutResults) {
    assert.equal(result.facts.status, 'known');
    assert.equal(result.count, 4);
    assert.ok(result.positive);
    assert.equal(result.positions, result.facts.layout === 'grouped' ? 4 : 1, result.name);
  }
  console.log('ok   installed Bar layout inspection agrees with four rendered stacked/grouped orientations');


  const replacement = await page.evaluate(async () => {
    const { render, pie, salesChart } = window.storyExample;
    const view = await render('#a', salesChart);
    const result = await view.replace(pie([{ region: 'North', revenue: 18 }, { region: 'South', revenue: 12 }])
      .value('revenue').label('region').color({ field: 'region', type: 'nominal' }), { duration: 0 });
    const observed = view.inspectMarks();
    const capabilities = view.capabilities();
    const edited = await view.edit({ requestId: 'installed-pie', baseRevision: result.revision,
      edits: [{ method: 'highlight', args: [{ region: 'North' }] }] }, { animate: false });
    view.destroy();
    return { result, observed, capabilities, edited };
  });
  assert.equal(replacement.result.status, 'applied');
  assert.deepEqual(replacement.capabilities.editMethods, ['color', 'where', 'sort', 'highlight']);
  assert.equal(replacement.edited.status, 'applied');
  assert.equal(replacement.observed.revision, replacement.result.revision);
  assert.deepEqual(replacement.observed.marks.map(mark => mark.data.region).sort(), ['North', 'South']);
  console.log('ok   installed persistent view: cross-type replacement and source-row observation');

  const foldFlip = await page.evaluate(async () => {
    const { render, foldedSpec, completeSales } = window.storyExample;
    const view = await render('#a', foldedSpec, { data: { sales: completeSales } });
    const message = { requestId: 'fold-flip', baseRevision: 0, edits: [{ method: 'flip', args: [] }] };
    const preview = await view.previewEdit(message);
    const unchanged = view.snapshot().revision === 0;
    const result = await view.edit(message, { duration: 0 });
    const actual = view.snapshot().spec;
    view.destroy();
    return { preview, unchanged, result, actual };
  });
  assert.ok(foldFlip.unchanged);
  assert.equal(foldFlip.result.status, 'applied');
  assert.equal(foldFlip.actual.encoding.y.type, 'quantitative');
  assert.deepEqual(foldFlip.actual, foldFlip.preview.spec);
  console.log('ok   installed fold stack: preview and actual orientation-only edit agree');

  const layoutEdits = await page.evaluate(async () => {
    const { render, foldedSpec, completeSales, inspectBarSpec } = window.storyExample;
    const view = await render('#a', foldedSpec, { data: { sales: completeSales } });
    const steps = [];
    for (const [method, args] of [['layout', ['grouped']], ['flip', []], ['layout', ['stacked']]]) {
      const before = view.snapshot();
      const message = { requestId: `layout-${before.revision}`, baseRevision: before.revision, edits: [{ method, args }] };
      const preview = await view.previewEdit(message);
      const unchanged = view.snapshot().revision === before.revision;
      const receipt = await view.edit(message, { animate: false });
      const actual = view.snapshot().spec;
      const facts = inspectBarSpec(actual);
      const marks = Array.from(document.querySelectorAll('#a rect.vd-bar'));
      steps.push({ before: before.spec, preview: preview.spec, actual, unchanged, receipt, facts,
        positions: marks.map(mark => mark.getAttribute(facts.orientation === 'horizontal' ? 'y' : 'x')) });
    }
    const beforeRejected = view.snapshot().revision;
    const compound = await view.previewEdit({requestId:'mixed-fold-valid',baseRevision:beforeRejected,edits:[{method:'layout',args:['grouped']},{method:'flip',args:[]}]});
    if(inspectBarSpec(compound.spec).layout!=='grouped') throw Error('Compound fold layout lost');
    let rejected;
    try { await view.previewEdit({ requestId: 'mixed-fold', baseRevision: beforeRejected,
      edits: [{ method: 'layout', args: ['grouped'] }, { method: 'color', args: [{field:'missing',type:'nominal'}] }] }); }
    catch (error) { rejected = error.code; }
    const stable = view.snapshot().revision === beforeRejected;
    view.destroy();
    return { steps, rejected, stable };
  });
  for (const [index, step] of layoutEdits.steps.entries()) {
    assert.ok(step.unchanged);
    assert.equal(step.receipt.status, 'applied');
    assert.deepEqual(step.actual, step.preview);
    assert.deepEqual(step.actual.transform, step.before.transform);
    assert.deepEqual(step.actual.meta.object, step.before.meta.object);
    assert.equal(step.facts.layout, index < 2 ? 'grouped' : 'stacked');
    assert.equal(new Set(step.positions).size, index < 2 ? 4 : 1);
  }
  assert.equal(layoutEdits.rejected, 'MISSING_FIELD');
  assert.ok(layoutEdits.stable);
  console.log('ok   installed folded Bar: semantic layout/flip previews, receipts, geometry and atomic rejection');

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
  const styles = await page.evaluate(async () => {
    const { salesChart, sequence, transition, chartStylePresets, defineChartStyle } = window.storyExample;
    const a = document.querySelector('#a'), b = document.querySelector('#b');
    a.style.width = b.style.width = '600px';
    const theme = document.createElement('style');
    theme.textContent = ':root[data-page-theme=dark]{--vd-color-mark-default:#edf1ee;--vd-color-surface:#141b20;--vd-figure-bg:#141b20}';
    document.head.append(theme);
    document.documentElement.dataset.pageTheme = 'dark';
    const capture = host => ({
      style: host.querySelector('.vd-transition-root').dataset.chartStyle,
      font: getComputedStyle(host.querySelector('.vd-transition-root')).fontFamily,
      background: getComputedStyle(host.querySelector('.vd-figure')).backgroundColor,
      bars: [...host.querySelectorAll('.vd-bar')].map(n => ['x', 'y', 'width', 'height', 'fill', 'style'].map(attr => n.getAttribute(attr))),
      axes: [...host.querySelectorAll('.vd-axis .tick')].map(n => [n.textContent, n.getAttribute('transform'), getComputedStyle(n.querySelector('text')).fill]),
      legend: [...host.querySelectorAll('.vd-legend-item')].map(n => [n.textContent, n.getAttribute('transform')]),
    });
    const collected = [];
    const custom = defineChartStyle({ key: 'integration-compact', legendPosition: 'right', plot: { grid: 'horizontal', margin: { top: 40, right: 85 } } });
    for (const style of [...Object.values(chartStylePresets), custom]) {
      const colored = salesChart.color('region');
      const steps = [colored, colored.highlight({ region: 'North' }), colored];
      const story = await sequence(steps, { target: a, width: 'auto', height: 'auto', chartStyle: style });
      for (const index of [0, 1, 2, 1, 0]) {
        story.progress(index); story.resize();
        const reference = await transition(steps[index], steps[index], { target: b, width: 'auto', height: 'auto', chartStyle: style });
        reference.progress(1);
        collected.push({ key: style.key, actual: capture(a), expected: capture(b) });
        reference.destroy(); b.replaceChildren();
      }
      story.destroy(); a.replaceChildren();
      for (const [declaration, expectedFills] of [
        [salesChart.color('#c31c48'), ['#c31c48', '#c31c48', '#c31c48']],
        [salesChart.color('region', { range: ['#990000', '#009900', '#000099'] }), ['#990000', '#009900', '#000099']],
        [salesChart.color('region', { scheme: 'Tableau10' }), ['#4e79a7', '#f28e2c', '#e15759']],
      ]) {
        const fixed = await transition(declaration, declaration, { target: a, width: 'auto', height: 'auto', chartStyle: style });
        fixed.progress(1);
        collected.push({ key: style.key, fills: [...a.querySelectorAll('.vd-bar')].map(n => n.getAttribute('fill')), expectedFills });
        fixed.destroy(); a.replaceChildren();
      }
    }
    const neutral = await transition(salesChart, salesChart, { target: a, width: 'auto', height: 'auto', chartStyle: chartStylePresets.paper });
    neutral.progress(1);
    const ink = {
      actual: a.querySelector('.vd-bar').getAttribute('fill'),
      expected: getComputedStyle(a.querySelector('.vd-transition-root')).getPropertyValue('--vd-color-on-surface').trim(),
      background: getComputedStyle(a.querySelector('.vd-figure')).backgroundColor,
    };
    neutral.destroy(); a.replaceChildren();
    const paper = await sequence([salesChart, salesChart.highlight({ region: 'North' }), salesChart], { target: a, width: 'auto', height: 'auto', chartStyle: chartStylePresets.paper });
    const dark = await sequence([salesChart, salesChart.highlight({ region: 'North' }), salesChart], { target: b, width: 'auto', height: 'auto', chartStyle: chartStylePresets.dark });
    const coexist = [];
    for (const themeName of ['light', 'dark', 'light']) {
      document.documentElement.dataset.pageTheme = themeName;
      paper.progress(2); dark.progress(1); paper.resize(); dark.resize();
      coexist.push({ paper: capture(a), dark: capture(b) });
    }
    paper.destroy(); dark.destroy(); a.replaceChildren(); b.replaceChildren();
    delete document.documentElement.dataset.pageTheme; theme.remove();
    return { collected, ink, coexist };
  });
  for (const sample of styles.collected) {
    if (sample.actual) {
      assert.equal(sample.actual.style, sample.key);
      assert.deepEqual(sample.actual, sample.expected, `Style ${sample.key} must retain its scope across leg handoffs`);
    } else {
      assert.deepEqual(sample.fills, sample.expectedFills, 'Authored colors override preset palettes');
    }
  }
  assert.equal(styles.ink.background, 'rgb(255, 253, 247)', 'Paper keeps its light surface on a dark page');
  assert.equal(styles.ink.actual, styles.ink.expected, 'Paper neutral marks must use its ink rather than inherit dark-page white');
  for (const sample of styles.coexist) {
    assert.equal(sample.paper.style, 'paper'); assert.equal(sample.dark.style, 'dark');
    assert.equal(sample.paper.background, 'rgb(255, 253, 247)');
    assert.equal(sample.dark.background, 'rgb(17, 22, 28)');
    assert.notEqual(sample.paper.font, sample.dark.font);
    assert.equal(sample.paper.bars[0][4], styles.ink.expected, 'Paper ink remains stable when page theme changes');
    assert.equal(sample.dark.bars[0][4], '#ffffff', 'The dark preset retains its own neutral ink');
  }
  assert.deepEqual(errors, []);
  console.log('ok   styles: every preset/custom module, scoped fonts/axes/legends, authored colors and paper ink on a dark page');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(consumer, { recursive: true, force: true });
}
