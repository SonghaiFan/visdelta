import { test, expect } from '@playwright/test';

// A title and subtitle are figure text above the canvas, not part of the SVG.
// They follow the authored progress of a pair, and never reach route planning.

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  await page.evaluate(() => {
    window.sl = window.VisDelta;
    document.body.innerHTML = '';
    window.mountHost = (css = '') => {
      const host = document.createElement('div');
      host.style.cssText = css;
      document.body.append(host);
      return host;
    };
    const rows = [
      { id: 'r1', year: 2020, location: 'A', cases: 10 },
      { id: 'r2', year: 2020, location: 'B', cases: 20 },
      { id: 'r3', year: 2021, location: 'A', cases: 12 },
      { id: 'r4', year: 2021, location: 'B', cases: 8 }
    ];
    window.base = sl.bar().data(rows).datumKey('id').x('location').y('cases').key('id');
    window.box = (element) => {
      const { width, height, top } = element.getBoundingClientRect();
      return { width: Math.round(width), height: Math.round(height), top: Math.round(top) };
    };
    /** Where an element sits inside its host: hosts are stacked down the page, so absolute tops differ. */
    window.within = (host, element) => Math.round(element.getBoundingClientRect().top - host.getBoundingClientRect().top);
    window.size = (element) => { const { width, height } = box(element); return { width, height }; };
    /** What the reader sees of one heading line: visible text and its opacity. */
    window.lines = (host) => ['title', 'subtitle'].map(kind => {
      const element = host.querySelector(`.vd-figure-${kind}`);
      if (!element || element.hidden) return null;
      return [...element.children]
        .map(span => ({ text: span.textContent, visible: getComputedStyle(span).visibility === 'visible', opacity: Number(getComputedStyle(span).opacity) }))
        .filter(span => span.visible && span.text);
    });
  });
});

test('a heading sits above the canvas and never changes its size', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const plainHost = mountHost('width:500px');
    const plain = await sl.transition(base, base, { target: plainHost, width: 500, height: 300 });
    plain.progress(1);
    const headedHost = mountHost('width:500px');
    const headed = base.where({ year: 2020 }).x('location', { label: 'Place' }).y('cases', { label: 'Cases counted' })
      .title('Cases by place').subtitle('2020 to 2021');
    const change = await sl.transition(headed, headed, { target: headedHost, width: 500, height: 300 });
    change.progress(1);
    const svg = headedHost.querySelector('svg');
    return {
      plainHeader: plainHost.querySelector('.vd-figure-header').hidden,
      canvas: box(svg),
      plainCanvas: box(plainHost.querySelector('svg')),
      headerBottom: Math.round(headedHost.querySelector('.vd-figure-header').getBoundingClientRect().bottom),
      canvasTop: box(svg).top,
      insideSvg: svg.textContent.includes('Cases by place'),
      axisLabels: [svg.querySelector('.vd-x-label').textContent, svg.querySelector('.vd-y-label').textContent],
      lines: lines(headedHost),
      tag: headedHost.querySelector('.vd-figure-header').tagName
    };
  });
  // With no heading nothing is reserved for one.
  expect(result.plainHeader).toBe(true);
  // The canvas is the same size with or without a heading; the heading is outside it.
  expect(result.canvas).toMatchObject({ width: 500, height: 300 });
  expect(result.plainCanvas).toMatchObject({ width: 500, height: 300 });
  expect(result.headerBottom).toBeLessThanOrEqual(result.canvasTop);
  expect(result.insideSvg).toBe(false);
  expect(result.axisLabels[0]).toContain('Place');
  expect(result.axisLabels[1]).toContain('Cases counted');
  expect(result.tag).toBe('FIGCAPTION');
  expect(result.lines).toEqual([[{ text: 'Cases by place', visible: true, opacity: 1 }], [{ text: '2020 to 2021', visible: true, opacity: 1 }]]);
});

test('a changing heading fades by authored progress and reverses frame for frame', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px');
    const from = base.title('Before').subtitle('Same');
    const to = base.title('After').subtitle('Same').y('year');
    const change = await sl.transition(from, to, { target: host, height: 300 });
    const at = {};
    for (const p of [0, 0.25, 0.5, 0.75, 1]) { change.progress(p); at[p] = lines(host); }
    // Scrub forward, then back to the same values: the picture depends only on p.
    const there = {}, back = {};
    for (const p of [0.1, 0.4, 0.6, 0.9]) { change.progress(p); there[p] = lines(host); }
    for (const p of [0.9, 0.6, 0.4, 0.1]) { change.progress(p); back[p] = lines(host); }
    const playedBack = {};
    change.progress(1);
    for (const p of [0.9, 0.6, 0.4, 0.1]) { change.progress(p); playedBack[p] = lines(host); }
    return { at, there, back, playedBack };
  });
  const title = (text, opacity = 1) => [{ text, visible: true, opacity }];
  // An unchanged subtitle is one static text throughout.
  const same = [{ text: 'Same', visible: true, opacity: 1 }];
  expect(result.at['0']).toEqual([title('Before'), same]);
  expect(result.at['0.25']).toEqual([title('Before', 0.5), same]);
  // At the midpoint nothing overlaps: the old text is gone and the new one has not arrived.
  expect(result.at['0.5']).toEqual([[], same]);
  expect(result.at['0.75']).toEqual([title('After', 0.5), same]);
  expect(result.at['1']).toEqual([title('After'), same]);
  expect(result.back).toEqual(result.there);
  expect(result.playedBack).toEqual(result.there);
});

test('a heading that appears makes room by progress: the ends are the states drawn alone', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const headed = base.title('Arrives').subtitle('and its note');
    const measure = (host) => ({ canvas: { ...size(host.querySelector('svg')), top: within(host, host.querySelector('svg')) }, header: box(host.querySelector('.vd-figure-header')).height, hidden: host.querySelector('.vd-figure-header').hidden });
    const alone = async (state) => {
      const host = mountHost('width:500px');
      (await sl.transition(state, state, { target: host, width: 500, height: 300 })).progress(1);
      return measure(host);
    };
    const plainAlone = await alone(base);
    const headedAlone = await alone(headed);
    const host = mountHost('width:500px');
    const change = await sl.transition(base, headed, { target: host, width: 500, height: 300 });
    const at = {};
    for (const p of [0, 0.25, 0.5, 0.75, 1]) { change.progress(p); at[p] = { ...measure(host), text: lines(host) }; }
    return { plainAlone, headedAlone, at };
  });
  const { plainAlone, headedAlone, at } = result;
  // Frame 0 is the old state drawn on its own, frame 1 the new one: same canvas, same place.
  expect(at['0'].hidden).toBe(true);
  expect(at['0'].canvas).toEqual(plainAlone.canvas);
  expect(at['1'].canvas).toEqual(headedAlone.canvas);
  expect(at['1'].header).toBe(headedAlone.header);
  expect(headedAlone.header).toBeGreaterThan(20);
  // In between the room opens in proportion to progress; the canvas only slides.
  for (const p of ['0.25', '0.5', '0.75']) {
    // Sizes are rounded to whole pixels, so allow the rounding.
    expect(Math.abs(at[p].header - headedAlone.header * Number(p))).toBeLessThanOrEqual(1);
    expect(at[p].canvas).toMatchObject({ width: 500, height: 300 });
  }
  expect(at['0.5'].text).toEqual([[], []]);
  expect(at['0'].text).toEqual([null, null]);
  expect(at['1'].text[0]).toEqual([{ text: 'Arrives', visible: true, opacity: 1 }]);
});

test('reversing is exact: the heading room is a function of progress alone', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px');
    const change = await sl.transition(base, base.title('Arrives'), { target: host, width: 500, height: 300 });
    const sample = (p) => { change.progress(p); return { top: within(host, host.querySelector('svg')), header: box(host.querySelector('.vd-figure-header')).height, text: lines(host) }; };
    const forward = [0.2, 0.4, 0.6, 0.8].map(sample);
    const backward = [0.8, 0.6, 0.4, 0.2].map(sample).reverse();
    return { forward, backward };
  });
  expect(result.backward).toEqual(result.forward);
});

test('a heading change does not disturb the planned route', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const root = base.rollup('year');
    const detailed = base.rollup('location');
    const plain = await sl.transition(root.x('year').rollup('year'), root.x('location').rollup('location'), { target: mountHost('width:500px'), height: 300 });
    const headed = await sl.transition(
      root.x('year').rollup('year').title('By year'),
      root.x('location').rollup('location').title('By place'),
      { target: mountHost('width:500px'), height: 300 }
    );
    headed.progress(0.5);
    const host = headed.view.closest('.vd-chart-root').parentElement;
    return {
      plainStages: plain.stageCount(), headedStages: headed.stageCount(),
      changes: headed.delta.stateChanges.filter(change => change.category === 'appearance'),
      state: lines(host)[0]
    };
  });
  expect(result.plainStages).toBeGreaterThan(1);
  expect(result.headedStages).toBe(result.plainStages);
  expect(result.changes).toEqual([{ category: 'appearance', action: 'restyle', property: 'title' }]);
  expect(result.state).toEqual([]);
});

test('auto height interpolates heading room and restores the unheaded endpoint', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:400px');
    const headed = base.title('Cases').subtitle('by place');
    const change = await sl.transition(headed, headed, { target: host, width: 'auto', height: 'auto' });
    change.progress(1);
    const header = box(host.querySelector('.vd-figure-header')).height;
    const canvas = box(host.querySelector('svg'));
    const bare = mountHost('width:500px;height:400px');
    const plain = await sl.transition(base, base, { target: bare, width: 'auto', height: 'auto' });
    plain.progress(1);
    // An arriving heading takes progressively more room from the canvas.
    const arriving = mountHost('width:500px;height:400px');
    const move = await sl.transition(base, headed, { target: arriving, width: 'auto', height: 'auto' });
    const held = [0, 0.5, 1].map(p => { move.progress(p); return { canvas: size(arriving.querySelector('svg')), header: box(arriving.querySelector('.vd-figure-header')).height, figure: box(arriving.querySelector('figure')).height }; });
    return { header, canvas: size(host.querySelector('svg')), figure: box(host.querySelector('figure')).height, bare: size(bare.querySelector('svg')), held };
  });
  expect(result.figure).toBe(400);
  expect(result.header).toBeGreaterThan(20);
  expect(result.canvas).toMatchObject({ width: 500, height: 400 - result.header });
  expect(result.bare).toMatchObject({ width: 500, height: 400 });
  result.held.forEach((frame, index) => {
    expect(Math.abs(frame.header - result.header * index / 2)).toBeLessThanOrEqual(1);
    expect(frame.canvas.height).toBe(400 - frame.header);
    expect(frame.figure).toBe(400);
  });
});

test('a sequence shows each state\'s own heading, and the canvas is continuous at every handoff', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const states = [base.title('One'), base.title('Two'), base.title('Three, a much longer heading that wraps in a narrow figure to more lines').subtitle('last')];
    const alone = async (state) => {
      const host = mountHost('width:300px');
      (await sl.transition(state, state, { target: host, width: 300, height: 300 })).progress(1);
      return within(host, host.querySelector('svg'));
    };
    const host = mountHost('width:300px');
    const journey = await sl.sequence(states, { target: host, width: 300, height: 300 });
    const out = {};
    for (const position of [0, 0.999, 1, 1.001, 1.999, 2]) {
      journey.progress(position);
      out[position] = { lines: lines(host), top: within(host, host.querySelector('svg')) };
    }
    journey.destroy();
    return { out, alone: [await alone(states[0]), await alone(states[1]), await alone(states[2])] };
  });
  const title = (text) => [{ text, visible: true, opacity: 1 }];
  expect(result.out['0'].lines).toEqual([title('One'), null]);
  expect(result.out['1'].lines).toEqual([title('Two'), null]);
  expect(result.out['2'].lines[1]).toEqual(title('last'));
  // Each state sits exactly where it does when drawn alone.
  expect([result.out['0'].top, result.out['1'].top, result.out['2'].top]).toEqual(result.alone);
  // The canvas is continuous across a handoff and slides within a leg.
  expect(Math.abs(result.out['0.999'].top - result.out['1'].top)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.out['1.001'].top - result.out['1'].top)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.out['1.999'].top - result.out['2'].top)).toBeLessThanOrEqual(1);
  expect(result.alone[2]).toBeGreaterThan(result.alone[0]);
});

test('with auto height sequence endpoints match independently rendered states', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const states = [base.title('One'), base.title('Two').subtitle('with a note'), base.title('Three, a much longer heading that wraps in a narrow figure').subtitle('last')];
    const host = mountHost('width:300px;height:420px');
    const journey = await sl.sequence(states, { target: host, width: 'auto', height: 'auto' });
    const boxes = [0, 0.5, 1, 1.5, 2].map(position => { journey.progress(position); return { ...size(host.querySelector('svg')), top: within(host, host.querySelector('svg')) }; });
    const alone = [];
    for (const state of states) {
      const single = mountHost('width:300px;height:420px');
      const controller = await sl.transition(state, state, { target: single, width: 'auto', height: 'auto' });
      alone.push({ ...size(single.querySelector('svg')), top: within(single, single.querySelector('svg')) });
      controller.destroy();
    }
    journey.destroy();
    return { boxes, alone };
  });
  expect([result.boxes[0], result.boxes[2], result.boxes[4]]).toEqual(result.alone);
  expect(result.boxes[1].top).toBeGreaterThan(result.boxes[0].top);
  expect(result.boxes[1].top).toBeLessThan(result.boxes[2].top);
});

for (const width of [600, 320]) test(`fit yields legend, subtitle, then title and restores them at ${width}px`, async ({ page }) => {
  const result = await page.evaluate(async (width) => {
    const host = mountHost(`width:${width}px;height:500px`);
    const budget = Math.min(200, width / 2);
    const state = base.color('location').title('Cases').subtitle('by place');
    const change = await sl.transition(state, state, { target: host, width: 'auto', height: 'auto' });
    const read = () => ({
      title: !host.querySelector('.vd-figure-title').hidden,
      subtitle: !host.querySelector('.vd-figure-subtitle').hidden,
      legend: getComputedStyle(host.querySelector('.vd-legend')).display !== 'none',
      height: box(host.querySelector('svg')).height,
    });
    const full = read();
    const header = box(host.querySelector('.vd-figure-header')).height;
    const subtitle = box(host.querySelector('.vd-figure-subtitle')).height + 4;
    const frames = [];
    for (const height of [budget + header, budget + header - subtitle, budget - 10, 500]) {
      host.style.height = `${height}px`;
      change.resize();
      change.progress(0);
      const start = read();
      change.progress(0.5);
      const middle = read();
      change.progress(1);
      frames.push({ start, middle, end: read() });
    }
    change.resize({ height: 100 });
    const fixed = read();
    change.destroy();
    return { full, frames, fixed };
  }, width);
  expect(result.full).toMatchObject({ title: true, subtitle: true, legend: true });
  const expected = [
    { title: true, subtitle: true, legend: false },
    { title: true, subtitle: false, legend: false },
    { title: false, subtitle: false, legend: false, height: Math.min(200, width / 2) - 10 },
    { title: true, subtitle: true, legend: true },
  ];
  result.frames.forEach((frame, index) => {
    expect(frame.start).toMatchObject(expected[index]);
    expect(frame.middle).toEqual(frame.start);
    expect(frame.end).toEqual(frame.start);
  });
  expect(result.fixed).toMatchObject({ title: true, subtitle: true, legend: true, height: 100 });
});
