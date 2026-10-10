import { test, expect } from '@playwright/test';
import { setCells } from './code-editor.mjs';

test('Bar uses its supported atomic declaration route', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    const rows = [{ id: 'A', value: 2, group: 'a' }, { id: 'B', value: 5, group: 'b' }];
    const target = document.createElement('div');
    target.style.width = '500px';
    document.body.append(target);
    const base = api.bar(rows).key('id').x('id').y('value');
    const change = await api.transition(base.focus({ group: 'a' }),
      base.color('#3366ff').highlight({ group: 'b' }), { target, height: 300 });
    change.progress(0.52);
    const count = change.view.__visDeltaScene.seekSequence?.phases.length;
    const snapshot = () => [...target.querySelectorAll('[data-key]')].map(node => node.outerHTML);
    const middle = snapshot();
    change.progress(1);
    change.progress(0.52);
    const reverse = snapshot();
    change.destroy();
    target.remove();
    return { count, middle, reverse };
  });
  expect(result.count).toBe(3);
  expect(result.middle.length).toBeGreaterThan(0);
  expect(result.reverse).toEqual(result.middle);
});

test('Bar Grain phase boundaries equal their complete states and scrub identically in reverse', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    document.body.innerHTML = '<div id="a" style="width:560px"></div><div id="b" style="width:560px"></div>';
    const rows = [
      { id: 'a', category: 'A', segment: 'one', value: 2 },
      { id: 'b', category: 'A', segment: 'two', value: 4 },
      { id: 'c', category: 'B', segment: 'one', value: 5 },
      { id: 'd', category: 'B', segment: 'two', value: 7 }
    ];
    const detailed = api.bar(rows).datumKey('id').x('category').y('value', { title: 'Value' })
      .breakdown('segment', { op: 'sum', title: false });
    const from = detailed.rollup({ op: 'sum', title: 'Value' });
    const to = detailed.layout('grouped').color('#3366ff');
    const options = target => ({ target, width: 560, height: 320 });
    const plan = api.planDeclarationTransition(from.toSpec(), to.toSpec(),
      api.createBarGrainDeclarationOperationCodec());
    const change = await api.transition(from, to, options('#a'));
    const phases = change.view.__visDeltaScene.seekSequence?.phases ?? [];
    const stateAtEnd = phase => phase.reverse
      ? phase.transitionSource.effectiveViewSpec
      : phase.spec;
    const normalizeNumber = value => Number(Number(value).toFixed(4));
    const normalizeAttribute = value => String(value)
      .replace(/,\s*/g, ',')
      .replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, token => {
        const number = Number(token);
        return Number.isFinite(number) ? String(normalizeNumber(number)) : token;
      });
    const boundaries = [[0, from.toSpec()], ...phases.map(phase => [phase.end, stateAtEnd(phase)])];
    const snapshot = host => ({
      bars: [...host.querySelectorAll('rect.vd-bar')].map(node => ({
        key: node.dataset.semanticKey ?? node.dataset.key,
        geometry: ['x', 'y', 'width', 'height'].map(name => normalizeNumber(node.getAttribute(name))),
        fill: getComputedStyle(node).fill,
        opacity: normalizeNumber(getComputedStyle(node).opacity),
        className: node.getAttribute('class')
      })).sort((a, b) => a.key.localeCompare(b.key)),
      axes: [...host.querySelectorAll('.tick, .domain, .vd-x-label, .vd-y-label')].map(node => ({
        text: node.textContent,
        geometry: [...node.attributes].filter(attribute => attribute.name !== 'id')
          .map(attribute => [attribute.name, normalizeAttribute(attribute.value)]).sort()
      }))
    });
    const asBar = spec => ({ toSpec: () => spec, chartModule: () => from.chartModule() });
    const boundaryMatches = [];
    for (const [progress, spec] of boundaries) {
      change.progress(progress);
      const expected = await api.transition(asBar(spec), asBar(spec), options('#b'));
      expected.progress(1);
      boundaryMatches.push({ progress, actual: snapshot(change.view), expected: snapshot(expected.view) });
      expected.destroy();
    }
    const forward = [0.17, 0.48, 0.82].map(progress => {
      change.progress(progress);
      return snapshot(change.view);
    });
    change.progress(1);
    const reverse = [0.82, 0.48, 0.17].map(progress => {
      change.progress(progress);
      return snapshot(change.view);
    }).reverse();
    const operationIds = plan.stages.map(stage => stage.operation.id);
    change.destroy();
    return { operationIds, phaseCount: phases.length, boundaryMatches, forward, reverse };
  });

  expect(result.operationIds).toEqual([
    '__visdeltaBarGrain/grouping', '__visdeltaBarGrain/layout', 'encoding/color'
  ]);
  expect(result.phaseCount).toBeGreaterThanOrEqual(3);
  expect(result.boundaryMatches.length).toBe(result.phaseCount + 1);
  for (const boundary of result.boundaryMatches) {
    expect(boundary.actual, `phase boundary ${boundary.progress}`).toEqual(boundary.expected);
  }
  expect(result.reverse).toEqual(result.forward);
});

test('generated declaration stages render complete states and preserve sequence boundaries', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const vd = window.VisDelta;
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const rows = [
      { id: 'a', group: 'A', x: 1, y: 2, other: 6 },
      { id: 'b', group: 'B', x: 3, y: 5, other: 3 },
      { id: 'c', group: 'B', x: 5, y: 8, other: 1 }
    ];
    const base = vd.bar(rows).key('id').x('group').y('y');
    const from = base.focus({ group: 'A' });
    const to = base.y('other').highlight({ group: 'B' });
    const options = target => ({ target, width: 700, height: 400 });
    // SVG transform interpolation goes through browser float32 matrices.
    const normalized = value => value.replace(/,\s+/g, ',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
      token => String(Math.round((Number(token) + 1e-7) * 100) / 100));
    const snapshot = target => [...document.querySelector(target).querySelectorAll('rect.vd-bar, .tick, .vd-x-label, .vd-y-label')].map(node => ({
      text: node.textContent,
      attrs: [...node.attributes].map(({ name, value }) => [name, normalized(value)]).sort()
    }));
    const change = await vd.transition(from, to, options('#a'));
    const phases = change.view.__visDeltaScene.seekSequence.phases;
    const count = phases.length;
    const asBar = spec => ({ toSpec: () => spec, chartModule: () => base.chartModule() });
    const boundaries = [[0, from.toSpec()], ...phases.map(phase => [phase.end,
      phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec])];
    const stageSnapshots = [];
    for (const [progress, state] of boundaries) {
      change.progress(progress);
      const expected = await vd.transition(asBar(state), asBar(state), options('#b'));
      expected.progress(1);
      stageSnapshots.push({ actual: snapshot('#a'), expected: snapshot('#b') });
      expected.destroy();
    }
    const samples = [0.12, 0.45, 0.82].map(progress => { change.progress(progress); return snapshot('#a'); });
    change.progress(1);
    const reverse = [0.82, 0.45, 0.12].map(progress => { change.progress(progress); return snapshot('#a'); }).reverse();
    const story = await vd.sequence([from, to, base], options('#b'));
    story.progress(0.5);
    const authoredMiddle = snapshot('#b');
    const authoredExpected = await vd.transition(to, to, options('#a'));
    authoredExpected.progress(1);
    const authoredBoundary = JSON.stringify(authoredMiddle) === JSON.stringify(snapshot('#a'));
    authoredExpected.destroy();
    story.progress(1);
    const authoredEnd = await vd.transition(base, base, options('#a'));
    authoredEnd.progress(1);
    const sequenceEnd = JSON.stringify(snapshot('#b')) === JSON.stringify(snapshot('#a'));
    authoredEnd.destroy();
    return { count, stageSnapshots, samples, reverse, authoredBoundary, sequenceEnd, value: story.value };
  });
  expect(result.count).toBe(3);
  expect(result.stageSnapshots).toHaveLength(4);
  for (const { actual, expected } of result.stageSnapshots) expect(actual).toEqual(expected);
  expect(result.reverse).toEqual(result.samples);
  expect(result.authoredBoundary).toBe(true);
  expect(result.sequenceEnd).toBe(true);
  expect(result.value).toBe(1);
});

test('Point, Line, Area, and Unit planned routes render complete boundaries and seek reversibly', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('svg');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    const [{ canonicalPointTransitionPair }, { canonicalLineTransitionPair }, { canonicalAreaTransitionPair }, { canonicalUnitTransitionPair }] = await Promise.all([
      import('/dist/charts/point/state.js'),
      import('/dist/charts/line/state.js'),
      import('/dist/charts/area/state.js'),
      import('/dist/charts/unit/state.js')
    ]);
    const rows = [
      { id: 'a', group: 'A', x: 1, y: 2 },
      { id: 'b', group: 'B', x: 3, y: 5 },
      { id: 'c', group: 'A', x: 5, y: 8 }
    ];
    const cases = [
      ['point', api.point(rows).key('id').x('x').y('y').color('#ff0000'), canonicalPointTransitionPair],
      ['line', api.line(rows).key('id').x('x').y('y').color('group'), canonicalLineTransitionPair],
      ['area', api.area(rows).key('id').x('x').y('y').color('#ff0000'), canonicalAreaTransitionPair],
      ['unit', api.unit(rows).key('id').layout('grid').radius(12).color('group'), canonicalUnitTransitionPair]
    ];
    const outcomes = [];
    for (const [name, base, canonicalPair] of cases) {
      const target = document.createElement('div');
      target.style.width = '500px';
      document.body.append(target);
      const dimensions = { width: 500, height: 300, margin: { top: 30, right: 30, bottom: 40, left: 50 } };
      const fixedMargin = state => ({
        toSpec: () => ({ ...state.toSpec(), margin: dimensions.margin }),
        chartModule: () => base.chartModule()
      });
      const from = fixedMargin(base.focus({ group: 'A' }));
      const to = fixedMargin(base.color('#3366ff').highlight({ group: 'B' }));
      const canonicalReverse = canonicalPair(from.toSpec(), to.toSpec()).reverse;
      const change = await api.transition(from, to, { target, ...dimensions });
      change.progress(0.42);
      const snapshot = node => {
        const color = value => value?.startsWith('#') && value.length === 7
          ? `rgb(${parseInt(value.slice(1, 3), 16)}, ${parseInt(value.slice(3, 5), 16)}, ${parseInt(value.slice(5, 7), 16)})`
          : value;
        const geometry = mark => Object.fromEntries(['cx', 'cy', 'r', 'd', 'transform', 'x', 'y', 'width', 'height']
          .filter(name => mark.hasAttribute(name)).map(name => [name, mark.getAttribute(name).replace(/,\s+/g, ',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
            token => String(Math.round(Number(token) * 100) / 100))]));
        const visible = mark => getComputedStyle(mark).visibility !== 'hidden' && Number(getComputedStyle(mark).opacity || 1) > 0;
        return {
          marks: [...node.querySelectorAll('[data-key]')].filter(visible).map(mark => ({
            tag: mark.tagName,
            key: mark.getAttribute('data-key'),
            fill: color(mark.getAttribute('fill')),
            stroke: color(mark.getAttribute('stroke')),
            opacity: mark.style.opacity || mark.getAttribute('opacity'),
            geometry: geometry(mark)
          })),
          axes: [...node.querySelectorAll('.tick, .domain')].filter(visible).map(axis => ({
            text: axis.textContent,
            geometry: geometry(axis)
          })),
          labels: [...node.querySelectorAll('.vd-x-label, .vd-y-label')].filter(visible).map(label => ({
            text: label.textContent,
            geometry: geometry(label)
          }))
        };
      };
      const phases = change.view.__visDeltaScene?.seekSequence?.phases;
      if (!phases) {
        outcomes.push({ name, noSequence: true });
        change.destroy();
        target.remove();
        continue;
      }
      const boundaries = [
        [0, from.toSpec()],
        ...phases.slice(0, -1).map(phase => [canonicalReverse ? 1 - phase.end : phase.end,
          phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec]).sort((left, right) => left[0] - right[0]),
        [1, to.toSpec()]
      ];
      const stageSnapshots = [];
      for (const [progress, state] of boundaries) {
        change.progress(progress);
        const actual = snapshot(target);
        const staticTarget = document.createElement('div');
        staticTarget.style.width = '500px';
        document.body.append(staticTarget);
        const asState = spec => ({ toSpec: () => spec, chartModule: () => base.chartModule() });
        const neutral = { ...state, meta: { ...(state.meta ?? {}), state: { ...(state.meta?.state ?? {}) } } };
        delete neutral.meta.state.scopes;
        if (!Object.keys(neutral.meta.state).length) delete neutral.meta.state;
        if (!Object.keys(neutral.meta).length) delete neutral.meta;
        const expected = await api.transition(asState(neutral), asState(state), { target: staticTarget, ...dimensions });
        expected.progress(1);
        stageSnapshots.push({ progress, actual, expected: snapshot(staticTarget) });
        expected.destroy();
        staticTarget.remove();
      }
      change.progress(0.42);
      const forwardSample = snapshot(target);
      change.progress(1);
      const endpoint = snapshot(target);
      change.progress(0.42);
      const scrubbedSample = snapshot(target);
      change.progress(0);
      const start = snapshot(target);
      change.progress(0.42);
      const reverseSample = snapshot(target);
      outcomes.push({ name, count: phases.length, stageSnapshots, forwardSample, scrubbedSample, reverseSample, endpoint, start });
      change.destroy();
      target.remove();
    }
    return outcomes;
  });
  expect(result).toHaveLength(4);
  for (const outcome of result) {
    expect(outcome.noSequence, outcome.name).toBeUndefined();
    expect(outcome.count, outcome.name).toBe(3);
    expect(outcome.stageSnapshots).toHaveLength(4);
    for (const { progress, actual, expected } of outcome.stageSnapshots) expect(actual, `${outcome.name} at ${progress}`).toEqual(expected);
    expect(outcome.endpoint.marks.length, outcome.name).toBeGreaterThan(0);
    expect(outcome.start.marks.length, outcome.name).toBeGreaterThan(0);
    expect(outcome.scrubbedSample).toEqual(outcome.forwardSample);
    expect(outcome.reverseSample).toEqual(outcome.forwardSample);
  }
});

test('non-idempotent prepareSpec does not re-prepare waypoints or move the final endpoint', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="a"></div><div id="b"></div>');
    const [{ createTransitionSurface }, { plugin }, { DEFAULT_CHART_RUNTIME }, { createChartTypeRegistry }] = await Promise.all([
      import('/dist/runtime/transition-surface.js'),
      import('/dist/charts/bar/plugin.js'),
      import('/dist/runtime/chart-runtime.js'),
      import('/dist/charts/index.js')
    ]);
    const baseType = plugin.createChartType(DEFAULT_CHART_RUNTIME);
    let prepareCalls = 0;
    const chartType = {
      ...baseType,
      transitionEvaluation: 'reconstruct',
      prepareSpec(spec) { prepareCalls++; return { ...spec, value: spec.value + 10 }; },
      renderer(chart, _rows, spec) {
        const marks = chart.g.selectAll('circle.prepared-test').data([spec.value]);
        const merged = marks.enter().append('circle').attr('class', 'prepared-test').attr('cy', 10).attr('r', 4).merge(marks);
        DEFAULT_CHART_RUNTIME.motion(merged, chart.transition.base).attr('cx', spec.value);
      },
      intermediateSpecs(_from, to) { return [{ spec: { ...to, value: 50 } }]; }
    };
    const registry = createChartTypeRegistry().register(chartType);
    const rows = [{ id: 'A', group: 'a', y: 2 }, { id: 'B', group: 'b', y: 5 }];
    const from = { mark: 'bar', data: { values: rows }, encoding: { x: { field: 'group', type: 'nominal' }, y: { field: 'y', type: 'quantitative' } }, value: 0 };
    const to = { ...from, value: 100 };
    const surface = createTransitionSurface(from, to, { target: '#a', height: 300 }, registry);
    const values = [];
    for (const progress of [0, 0.5, 0.5001, 0.55, 0.999999, 1]) {
      surface.progress(progress);
      values.push({ progress, preparedValue: surface.view.__visDeltaScene.previousSpec.value, x: Math.round(Number(surface.view.querySelector('circle.prepared-test')?.getAttribute('cx')) * 100) / 100 });
    }
    const stages = surface.stageCount();
    surface.destroy();
    const singleType = { ...chartType, intermediateSpecs: () => [] };
    const single = createTransitionSurface(from, to, { target: '#b', height: 300 }, createChartTypeRegistry().register(singleType));
    const singleValues = [];
    for (const progress of [0, 0.5, 0.999, 1]) {
      single.progress(progress);
      singleValues.push({ preparedValue: single.view.__visDeltaScene.previousSpec.value, x: Math.round(Number(single.view.querySelector('circle.prepared-test')?.getAttribute('cx')) * 100) / 100 });
    }
    const singleStages = single.stageCount();
    single.destroy();
    return { calls: prepareCalls, stages, values, singleStages, singleValues };
  });
  expect(result.calls).toBe(4);
  expect(result.stages).toBe(2);
  expect(result.values.map(item => item.preparedValue)).toEqual([10, 50, 110, 110, 110, 110]);
  expect(result.values[0].x).toBe(10);
  expect(result.values[1].x).toBe(50);
  expect(result.values[2].x).toBe(50);
  expect(result.values[3].x).toBeCloseTo(50.24, 1);
  expect(result.values[4].x).toBe(110);
  expect(result.values[5].x).toBe(110);
  expect(result.singleStages).toBe(1);
  expect(result.singleValues.map(item => item.preparedValue)).toEqual([10, 110, 110, 110]);
  expect(result.singleValues.map(item => item.x)).toEqual([10, 60, 110, 110]);
});

for (const width of [1100, 390]) {
  test(`arbitrary compound pair in point lab supports play, reverse, and scrub at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/docs/.vitepress/dist/playground.html#point/x');
    await expect(page.getByRole('tab', { name: 'Point', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await page.locator('#chart').scrollIntoViewIfNeeded();
    await expect(page.locator('#status')).toHaveText('Ready');
    await setCells(page, `const cars = point(rows).key('name').x('wt').y('mpg');
const from = cars.focus({ cyl: 4 });`, `const cars = point(rows).key('name').x('wt').y('mpg');
const to = cars.y('hp').highlight({ cyl: 8 });`);
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await expect(page.locator('#status')).toHaveText('Ready');
    const snapshot = () => page.locator('#chart circle.vd-point').evaluateAll(nodes => nodes.map(node => [node.getAttribute('cx'), node.getAttribute('cy'), node.style.opacity]));
    const start = await snapshot();
    await page.locator('#progress').fill('0.48');
    const middle = await snapshot();
    expect(middle).not.toEqual(start);
    await page.locator('#play').click();
    await expect(page.locator('#value')).toHaveText('1.00', { timeout: 15000 });
    await page.locator('#reverse').click();
    await expect(page.locator('#value')).toHaveText('0.00', { timeout: 15000 });
    expect(await snapshot()).toEqual(start);
    await page.locator('#progress').fill('0.48');
    expect(await snapshot()).toEqual(middle);
    await page.locator('#start').click();
    expect(await snapshot()).toEqual(start);
    expect(errors).toEqual([]);
  });
}

for (const scenario of ['focus', 'highlight']) {
  test(`tab switching does not skip an attention-only ${scenario} difference`, async ({ page }) => {
    await page.goto(`/docs/.vitepress/dist/playground.html#point/${scenario}`);
    await expect(page.locator('#status')).toHaveText('Ready');
    await page.locator('#end').click();
    await page.getByRole('tab', { name: /^encoding/i }).click();
    await expect(page.locator('#status')).toHaveText('Switching tabs');
    await expect(page.locator('#progress')).toBeDisabled();
    await expect(page.locator('#status')).toHaveText('Ready');
    await expect(page.locator('#value')).toHaveText('0.00');
  });
}
