import { test, expect } from '@playwright/test';

// A top legend is a block above the canvas, outside the SVG, so a chart's
// `width` and `height` are the canvas alone. A side legend stays inside it.

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
    window.rows = [
      { c: 'A', v: 10, w: 4, t: 'north' }, { c: 'B', v: 30, w: 9, t: 'south' },
      { c: 'C', v: 20, w: 6, t: 'north' }, { c: 'D', v: 25, w: 2, t: 'east' }
    ];
    window.plain = sl.bar().data(rows).x('c').y('v').key('c');
    window.colored = plain.color('t');
    window.size = (element) => { const b = element.getBoundingClientRect(); return { width: Math.round(b.width), height: Math.round(b.height) }; };
    window.within = (host, element) => Math.round(element.getBoundingClientRect().top - host.getBoundingClientRect().top);
    window.legendOf = (host) => [...host.querySelectorAll('.vd-legend-item')].map(item => ({ text: item.textContent, opacity: Number(getComputedStyle(item).opacity) }));
  });
});

test('a top legend is a block above the canvas, outside its SVG', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px');
    const change = await sl.transition(colored, colored, { target: host, width: 500, height: 300 });
    change.progress(1);
    const canvas = host.querySelector('svg');
    const block = host.querySelector('.vd-legend-svg');
    return {
      order: [...host.querySelector('.vd-view').children].map(child => child.getAttribute('class')?.split(' ')[0] ?? child.tagName),
      first: host.querySelector('svg') === canvas && canvas.classList.contains('vd-chart'),
      inCanvas: canvas.querySelectorAll('.vd-legend-item').length,
      inBlock: block.querySelectorAll('.vd-legend-item').length,
      canvas: size(canvas), block: size(block),
      blockBottom: Math.round(block.getBoundingClientRect().bottom), canvasTop: Math.round(canvas.getBoundingClientRect().top),
      role: block.getAttribute('role'), label: block.getAttribute('aria-label'),
      text: legendOf(host).map(item => item.text)
    };
  });
  // The canvas stays the view's first SVG, and the block is shown above it.
  expect(result.order).toEqual(['vd-chart', 'vd-legend-svg', 'vd-empty']);
  expect(result.first).toBe(true);
  expect(result.inCanvas).toBe(0);
  expect(result.inBlock).toBe(3);
  expect(result.text).toEqual(['north', 'south', 'east']);
  expect(result.canvas).toEqual({ width: 500, height: 300 });
  expect(result.block.width).toBe(500);
  expect(result.block.height).toBeGreaterThan(20);
  expect(result.blockBottom).toBeLessThanOrEqual(result.canvasTop);
  expect(result.role).toBe('group');
  expect(result.label).toBe('Legend');
});

test('a chart with no legend has one SVG, and a legend never changes the canvas size', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const bare = mountHost('width:500px');
    (await sl.transition(plain, plain, { target: bare, width: 500, height: 300 })).progress(1);
    const withLegend = mountHost('width:500px');
    (await sl.transition(colored, colored, { target: withLegend, width: 500, height: 300 })).progress(1);
    const frame = (host) => host.querySelector('svg .vd-frame').getAttribute('transform');
    return {
      bareSvgs: bare.querySelectorAll('svg').length, legendSvgs: withLegend.querySelectorAll('svg').length,
      bareCanvas: size(bare.querySelector('svg')), legendCanvas: size(withLegend.querySelector('svg')),
      bareFrame: frame(bare), legendFrame: frame(withLegend),
      bareFigure: size(bare.querySelector('figure')).height, legendFigure: size(withLegend.querySelector('figure')).height,
      block: size(withLegend.querySelector('.vd-legend-svg')).height
    };
  });
  expect(result.bareSvgs).toBe(1);
  expect(result.legendSvgs).toBe(2);
  expect(result.bareCanvas).toEqual({ width: 500, height: 300 });
  expect(result.legendCanvas).toEqual({ width: 500, height: 300 });
  // The legend takes no room from the canvas's own margins: the plot sits at the same place.
  expect(result.legendFrame).toBe(result.bareFrame);
  expect(result.legendFigure).toBe(result.bareFigure + result.block);
});

test('a legend that wraps makes its block taller, not the canvas', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const many = Array.from({ length: 14 }, (_, index) => ({ c: `Item ${index}`, v: index + 1, t: `A fairly long series name ${index}` }));
    const chart = sl.bar().data(many).x('c').y('v').key('c').color('t');
    const measure = async (width) => {
      const host = mountHost(`width:${width}px`);
      (await sl.transition(chart, chart, { target: host, width, height: 300 })).progress(1);
      return { canvas: size(host.querySelector('svg')), block: size(host.querySelector('.vd-legend-svg')).height };
    };
    return { wide: await measure(900), narrow: await measure(380) };
  });
  expect(result.wide.canvas.height).toBe(300);
  expect(result.narrow.canvas.height).toBe(300);
  expect(result.narrow.block).toBeGreaterThan(result.wide.block);
});

test('auto height takes the legend block and the heading from the container', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:420px');
    const chart = colored.title('Cases');
    const change = await sl.transition(chart, chart, { target: host, width: 'auto', height: 'auto' });
    change.progress(1);
    return {
      figure: size(host.querySelector('figure')).height,
      header: size(host.querySelector('.vd-figure-header')).height,
      block: size(host.querySelector('.vd-legend-svg')).height,
      canvas: size(host.querySelector('svg'))
    };
  });
  expect(result.figure).toBe(420);
  expect(result.canvas).toEqual({ width: 500, height: 420 - result.header - result.block });
});

test('a legend that appears holds its block still and fades by progress, both ways', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px');
    const change = await sl.transition(plain, colored, { target: host, width: 500, height: 300 });
    const sample = (p) => {
      change.progress(p);
      return { block: size(host.querySelector('.vd-legend-svg')).height, canvas: within(host, host.querySelector('svg')), items: legendOf(host) };
    };
    const forward = [0, 0.25, 0.5, 0.75, 1].map(sample);
    const backward = [1, 0.75, 0.5, 0.25, 0].map(sample).reverse();
    return { forward, backward };
  });
  // The block is as tall as the tallest legend of the pair from the first frame, so the canvas never moves.
  expect(new Set(result.forward.map(frame => frame.block)).size).toBe(1);
  expect(result.forward[0].block).toBeGreaterThan(20);
  expect(new Set(result.forward.map(frame => frame.canvas)).size).toBe(1);
  // The legend is absent at the start and shown at the end, and reversing is exact.
  expect(result.forward[0].items.every(item => item.opacity === 0)).toBe(true);
  expect(result.forward[4].items.map(item => item.opacity)).toEqual([1, 1, 1]);
  expect(result.backward).toEqual(result.forward);
});

test('a side legend stays in the canvas\'s right margin', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:700px');
    const change = await sl.transition(colored, colored, { target: host, width: 700, height: 300, chartStyle: sl.chartStylePresets.paper });
    change.progress(1);
    const canvas = host.querySelector('svg');
    return {
      svgs: host.querySelectorAll('svg').length,
      inCanvas: canvas.querySelectorAll('.vd-legend-item').length,
      block: host.querySelector('.vd-legend-svg') !== null,
      canvas: size(canvas),
      position: canvas.querySelector('.vd-legend').getAttribute('data-position')
    };
  });
  expect(result.svgs).toBe(1);
  expect(result.block).toBe(false);
  expect(result.inCanvas).toBe(3);
  expect(result.position).toBe('right');
  expect(result.canvas).toEqual({ width: 700, height: 300 });
});

test('a sequence keeps one legend block through its legs', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px');
    const journey = await sl.sequence([colored, colored.sort('v', 'ascending'), colored.sort('v', 'descending')], { target: host, width: 500, height: 300 });
    const frames = [0, 0.5, 1, 1.5, 2].map(position => {
      journey.progress(position);
      return { canvas: size(host.querySelector('svg')), top: within(host, host.querySelector('svg')), items: legendOf(host).length };
    });
    journey.destroy();
    return frames;
  });
  expect(new Set(result.map(frame => JSON.stringify(frame))).size).toBe(1);
  expect(result[0]).toMatchObject({ canvas: { width: 500, height: 300 }, items: 3 });
});
