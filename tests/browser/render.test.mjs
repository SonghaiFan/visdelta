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
    import { pie, pieModule } from './dist/pie.js';
    import { defineChartType } from './dist/plugins.js';
    import { specs, sales } from './examples/authoring/complete-states.mjs';
    import { foldedBar } from './tests/fixtures/folded-bar.mjs';
    window.api = { specs: {...specs,stacked:foldedBar.toSpec()}, sales, defineChartType, render, createRenderer, bar, barModule, pie, pieModule, availableChartTypes, registerChartType };
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
  assert.equal(await page.locator('#chart figcaption, #chart .vd-figure-header').count(), 0);
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
  assert.equal(await page.evaluate(() => view.snapshot().spec.data[0].y), 4);
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
    const s = view.snapshot(); s.spec.data[0].y = 'mutated';
    if (view.snapshot().spec.data[0].y !== 4) throw Error('snapshot leaked');
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
    next.encoding.y.label = 'mutated';
    await updating;
    if (view.snapshot().spec.encoding.y.label === 'mutated') throw Error('input mutation leaked');
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
  assert.equal(await page.evaluate(() => view.snapshot().spec.data[0].y), 9);
  await page.evaluate(() => {
    window.a = view.update(make(10), { duration: 1000 });
  });
  await page.waitForFunction(() => view.snapshot().spec.data[0].y === 10 && !document.querySelector('#chart [aria-hidden]'));
  await page.evaluate(() => {
    window.b = view.update(make(11));
    view.destroy(); view.destroy();
  });
  assert.deepEqual(await page.evaluate(async () => (await Promise.all([a,b])).map(r => r.status)), ['destroyed','destroyed']);
  assert.equal(await page.locator('#chart svg').count(), 0);
  assert.ok(await page.evaluate(async () => { try { await view.update(make(12)); } catch (e) { return e.message; } }));

  // Render each complete builder-generated declaration using actual named rows.
  await page.evaluate(async () => {
    for (const [name, spec] of Object.entries(api.specs)) {
      const example = await api.render('#chart', spec, { data: { sales: api.sales }, height: 280 });
      const observation = example.inspectMarks();
      if (!observation.marks.length) throw Error(`No visible keyed marks for ${name}`);
      if (name === 'stacked') {
        const before = example.snapshot();
        const message = { requestId: 'preview-flip', baseRevision: before.revision, edits: [{ method: 'flip', args: [] }] };
        const preview = await example.previewEdit(message);
        const colored = await example.previewEdit({ ...message, edits: [{ method: 'color', args: ['#ff0000'] }] });
        if (colored.spec.encoding.color.value !== '#ff0000') throw Error('Fold color preview lost requested color');
        if (JSON.stringify(colored.spec.transform) !== JSON.stringify(before.spec.transform)) throw Error('Color preview rewrote fold');
        if (JSON.stringify(example.snapshot()) !== JSON.stringify(before)) throw Error('Preview accepted a revision');
        if (document.querySelector('#chart [aria-hidden]')) throw Error('Preview leaked a mount');
        if (preview.spec.encoding.y.type !== 'quantitative') throw Error('Preview did not flip horizontal to vertical');
        if (JSON.stringify(preview.spec.transform) !== JSON.stringify(before.spec.transform)) throw Error('Preview rewrote transforms');
        await example.edit(message, { duration: 40 });
        if (JSON.stringify(example.snapshot().spec) !== JSON.stringify(preview.spec)) throw Error('Applied endpoint differs from preview');
        const endpoint = example.inspectMarks();
        if (endpoint.marks.length !== 4) throw Error('Flip lost stacked segments');
        const second = { requestId: 'restore-flip', baseRevision: example.snapshot().revision, edits: [{ method: 'flip', args: [] }] };
        await example.previewEdit(second);
        await example.edit(second, { duration: 40 });
        if (JSON.stringify(example.snapshot().spec) !== JSON.stringify(before.spec)) throw Error('Second flip did not restore declaration');
        const after = example.inspectMarks();
        if (JSON.stringify(after.marks.map(mark => mark.bounds)) !== JSON.stringify(observation.marks.map(mark => mark.bounds))) throw Error('Double flip did not restore geometry');
      }
      if (name !== 'stacked') {
        const capabilities = example.capabilities();
        if (!capabilities.editMethods.includes('highlight')) throw Error(`Missing capability for ${name}`);
        capabilities.editMethods.length = 0;
        if (!example.capabilities().editMethods.length) throw Error('Leaked capabilities');
        const prior = example.snapshot();
        try {
          await example.edit({ requestId: 'atomic', baseRevision: prior.revision, edits: [
            { method: 'color', args: [{ value: 'red' }] },
            { method: 'highlight', args: [{ product: {} }] },
          ] });
          throw Error('Accepted invalid selector');
        } catch (error) {
          if (error.editIndex !== 1 || error.path !== '/edits/1/args/0/product' || error.method !== 'highlight') throw error;
        }
        if (JSON.stringify(example.snapshot()) !== JSON.stringify(prior)) throw Error('Partially accepted edits');
        await example.edit({ requestId: 'common', baseRevision: prior.revision, edits: [
          { method: 'color', args: [{ value: '#ff0000' }] },
          { method: 'highlight', args: [{ product: 'Atlas' }] },
          { method: 'sort', args: ['revenue', 'descending'] },
        ] }, { animate: false });
        if (example.snapshot().spec.encoding.color.value !== '#ff0000') throw Error('Lost explicit color');
      }
      example.destroy();
    }
  });

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
  await page.waitForFunction(() => customView.snapshot().spec.data[0].y === 3);
  assert.match(await page.evaluate(async () => {
    try { await customView.update({ ...make(13), meta: { rejectRender: true } }); } catch (e) { return e.message; }
  }), /custom rejection/);
  assert.deepEqual(await page.evaluate(async () => (await Promise.all([customFirst,customPending])).map(r => r.status)), ['applied','applied']);
  assert.equal(await page.evaluate(() => customView.snapshot().spec.data[0].y), 3);
  const observed = await page.evaluate(() => customView.inspectMarks());
  assert.equal(observed.marks.length, 2);
  assert.deepEqual(observed.orders.leftToRight.map(id => observed.marks.find(mark => mark.id === id).data.x), ['A', 'B']);
  const captured = await page.evaluate(() => customView.capture());
  assert.equal(captured.revision, observed.revision);
  assert.match(captured.dataUrl, /^data:image\/png;base64,iVBOR/);
  assert.ok(captured.width > 0 && captured.height > 0);
  const occupiedHeight = await page.locator('#chart').evaluate(node => node.getBoundingClientRect().height);
  await page.evaluate(async () => {
    const empty = api.bar([{ x: 'A', y: 3 }, { x: 'B', y: 10 }]).x('x').y('y').where({ y: { lt: 0 } });
    await customView.update(empty);
  });
  assert.equal(await page.locator('#chart .vd-empty').isVisible(), true);
  assert.equal(await page.locator('#chart').evaluate(node => node.getBoundingClientRect().height), occupiedHeight, 'empty state must not add another canvas-height block');
  await page.evaluate(async () => { await customView.update(make(3)); });
  assert.equal(await page.locator('#chart .vd-empty').isVisible(), false, 'restoring data clears empty-state text even on compiled/seek render paths');
  await page.evaluate(() => customView.destroy());
  assert.equal(await page.locator('#chart').evaluate(n => n.childElementCount), 0);
  // Explicit replacement is generic; the scoped renderer still owns its module list.
  await page.evaluate(async () => {
    window.switchView = await api.createRenderer({ modules: [api.barModule, api.pieModule] }).render('#chart', make(3), { height: 280 });
    window.pieSpec = api.pie([{ x: 'A', y: 3 }, { x: 'B', y: 10 }]).value('y').label('x').color('x').toSpec();
    await switchView.replace(pieSpec, { duration: 80 });
  });
  assert.equal(await page.locator('#chart .vd-pie-slice').count(), 2);
  assert.equal(await page.evaluate(() => switchView.snapshot().spec.mark), 'pie');
  assert.deepEqual(await page.evaluate(() => switchView.inspectMarks().marks.map(mark => mark.data.x).sort()), ['A', 'B']);
  const attention = await page.evaluate(async () => {
    const opacities = () => switchView.inspectMarks().marks.map(mark => mark.appearance.opacity);
    const highlighted = api.pie([{ x: 'A', y: 3 }, { x: 'B', y: 10 }]).value('y').label('x').highlight({ x: 'A' });
    await switchView.update(highlighted, { animate: false });
    const one = opacities();
    const cleared = switchView.snapshot().spec;
    delete cleared.meta.state.scopes.highlight;
    await switchView.update(cleared, { animate: false });
    const none = opacities();
    await switchView.update(highlighted.with({ scopes: { highlight: { mode: 'highlight', filters: [] } } }), { animate: false });
    const empty = opacities();
    await switchView.update(highlighted.with({ scopes: { highlight: null } }).highlight({ x: ['A', 'B'] }), { animate: false });
    const all = opacities();
    return { one, none, empty, all, hasAllScope: !!switchView.snapshot().spec.meta.state.scopes.highlight };
  });
  assert.equal(attention.one.filter(value => value === 1).length, 1);
  assert.ok(attention.none.every(value => value === 1));
  assert.ok(attention.empty.every(value => value < 1));
  assert.ok(attention.all.every(value => value === 1));
  assert.ok(attention.hasAllScope, 'select all retains an authored scope');
  const beforeReplacementFailure = await page.evaluate(() => switchView.snapshot());
  assert.match(await page.evaluate(async () => { try { await switchView.replace({ ...pieSpec, encoding: {} }); } catch (error) { return error.message; } }), /value|angle/i);
  assert.deepEqual(await page.evaluate(() => switchView.snapshot()), beforeReplacementFailure);
  await page.evaluate(async () => { await switchView.replace(make(3), { animate: false }); });
  assert.equal(await page.locator('#chart .vd-pie-slice').count(), 0);
  assert.equal(await page.evaluate(() => switchView.snapshot().spec.mark), 'bar');
  await page.evaluate(() => switchView.destroy());
  // A genuinely independent chart module exercises replacement lifecycle without built-in geometry.
  await page.evaluate(async () => {
    const module = { key: 'probe', async load() { return { plugin: api.defineChartType({
      key: 'probe', createRenderer() { return (chart, rows, spec) => {
        if (spec.meta?.rejectRender) throw Error('probe rejection');
        chart.scene.markRoot.selectAll('circle').data(rows).join('circle')
          .attr('data-key', d => d.id).attr('cx', 30).attr('cy', 30).attr('r', 10);
      }; },
    }) }; } };
    window.probeModule = module;
    window.probe = { mark: 'probe', data: [{ id: 'a', value: 3 }], encoding: {}, key: 'id' };
    window.probeView = await api.createRenderer({ modules: [api.barModule, module] }).render('#chart', make(1));
    window.fading = probeView.replace(probe, { duration: 1500 });
  });
  await page.waitForFunction(() => {
    const mount = document.querySelector('#chart > div');
    return mount?.style.opacity !== '' && Number(mount?.style.opacity) > 0;
  });
  assert.equal(await page.evaluate(() => {
    const mount = document.querySelector('#chart > div');
    const opacity = mount.style.opacity;
    probeView.resize({ width: 320 });
    return mount.style.opacity === opacity;
  }), true, 'resize preserves replacement fade');
  assert.equal(await page.evaluate(async () => (await fading).status), 'applied');
  assert.equal(await page.evaluate(() => probeView.inspectMarks().marks[0].data.value), 3);
  await page.evaluate(() => { window.crossActive = probeView.replace(make(2), { duration: 600 }); });
  await page.waitForFunction(() => probeView.snapshot().spec.mark === 'bar' && !document.querySelector('#chart [aria-hidden]'));
  await page.evaluate(() => { window.crossPending = probeView.replace(probe); });
  await page.waitForFunction(() => probeView.snapshot().spec.mark === 'probe');
  await page.evaluate(() => { window.crossLatest = probeView.replace(make(3), { animate: false }); });
  assert.deepEqual(await page.evaluate(async () => (await Promise.all([crossActive, crossPending, crossLatest])).map(r => r.status)),
    ['applied', 'superseded', 'applied'], 'cross-type replacements retain latest scheduling');
  await page.evaluate(async () => { await probeView.replace(probe, { animate: false }); });
  assert.deepEqual(await page.evaluate(() => probeView.capabilities()), { mark: 'probe', fluentEdits: false, editMethods: [] });
  const probeBefore = await page.evaluate(() => probeView.snapshot());
  assert.match(await page.evaluate(async () => {
    try { await probeView.replace({ ...probe, meta: { rejectRender: true } }); } catch (e) { return e.message; }
  }), /probe rejection/);
  assert.deepEqual(await page.evaluate(() => probeView.snapshot()), probeBefore);
  assert.equal(await page.evaluate(async () => {
    const capture = probeView.capture().then(() => 'unexpected', e => e.message);
    probeView.resize({ width: 330 });
    return capture;
  }), 'Chart changed during capture. Capture again.');
  assert.equal(await page.evaluate(async () => {
    const pending = probeView.transition(probe);
    let blocked = false;
    try { probeView.inspectMarks(); } catch { blocked = true; }
    const controller = await pending;
    controller.progress(1);
    await probeView.replace(make(1), { animate: false });
    return blocked;
  }), true, 'manual preparation cannot be observed as a settled endpoint');
  await page.evaluate(() => { window.destroyedFade = probeView.replace(probe, { duration: 2000 }); });
  await page.waitForFunction(() => document.querySelector('#chart circle') && document.querySelector('#chart > div')?.style.opacity !== '');
  await page.evaluate(() => probeView.destroy());
  assert.equal(await page.evaluate(async () => (await destroyedFade).status), 'destroyed');
  assert.equal(await page.locator('#chart').evaluate(n => n.childElementCount), 0);
  const legacyCapabilities = await page.evaluate(async () => {
    const legacy = await api.createRenderer({ modules: [{ ...probeModule, edit: async spec => spec }] }).render('#chart', probe);
    const capabilities = legacy.capabilities();
    const preview = await legacy.previewEdit({ requestId: 'legacy-preview', baseRevision: 0, edits: [{ method: 'custom', args: [] }] });
    if (preview.revision !== 0 || legacy.snapshot().revision !== 0) throw Error('Custom preview mutated revision');
    await legacy.edit({ requestId: 'legacy', baseRevision: 0, edits: [{ method: 'custom', args: [] }] }, { animate: false });
    try {
      await legacy.previewEdit({ requestId: 'stale-preview', baseRevision: 0, edits: [{ method: 'custom', args: [] }] });
      throw Error('Stale preview accepted');
    } catch (error) { if (error.code !== 'REVISION_CONFLICT') throw error; }
    legacy.destroy();
    return capabilities;
  });
  assert.deepEqual(legacyCapabilities, { mark: 'probe', fluentEdits: true, editMethods: null });
  assert.deepEqual(errors, []);
});
