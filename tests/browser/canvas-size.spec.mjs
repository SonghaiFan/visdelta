import { test, expect } from '@playwright/test';

// A chart's canvas is either a fixed number of pixels or "auto": it follows the
// container it is mounted in, in width, in height, or in both.

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  await page.evaluate(() => {
    window.sl = window.VisDelta;
    document.body.innerHTML = '';
    window.mountHost = (css) => {
      const host = document.createElement('div');
      host.style.cssText = css;
      document.body.append(host);
      return host;
    };
    window.rows = [
      { category: 'A', value: 10, other: 35 },
      { category: 'B', value: 30, other: 5 },
      { category: 'C', value: 20, other: 15 }
    ];
    window.base = sl.bar().data(rows).x('category').y('value').key('category');
    window.next = base.y('other');
    window.rect = (element) => element.getBoundingClientRect();
    window.settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
  });
});

test('a fixed width and height are exact, and a narrower container overflows instead of clipping', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:300px;overflow:auto');
    const change = await sl.transition(base, next, { target: host, width: 640, height: 360 });
    change.progress(0.5);
    const svg = host.querySelector('svg');
    const first = { width: rect(svg).width, height: rect(svg).height, viewBox: svg.getAttribute('viewBox'), overflows: host.scrollWidth > host.clientWidth };
    // The container changing size does not move a fixed canvas.
    host.style.width = '900px';
    await settle();
    const after = { width: rect(svg).width, height: rect(svg).height };
    return { first, after };
  });
  expect(result.first).toEqual({ width: 640, height: 360, viewBox: '0 0 640 360', overflows: true });
  expect(result.after).toEqual({ width: 640, height: 360 });
});

test('auto width follows the container; a fixed height stays', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:400px');
    const change = await sl.transition(base, next, { target: host, height: 300 });
    change.progress(0.5);
    // The figure is the chart with its theme chrome; the canvas is its content area.
    // A resize redraws, so the nodes are looked up again each time.
    const measure = () => {
      const svg = host.querySelector('svg');
      return { figure: Math.round(rect(host.querySelector('figure')).width), canvas: Math.round(rect(svg).width), height: Math.round(rect(svg).height) };
    };
    const narrow = measure();
    host.style.width = '700px';
    await settle();
    return { narrow, wide: measure(), viewBox: host.querySelector('svg').getAttribute('viewBox') };
  });
  expect(result.narrow).toMatchObject({ figure: 400, height: 300 });
  expect(result.wide).toMatchObject({ figure: 700, height: 300 });
  expect(result.wide.canvas).toBeLessThanOrEqual(700);
  expect(result.viewBox).toBe(`0 0 ${result.wide.canvas} 300`);
});

test('auto height fills a container that has a height, and follows it in both dimensions', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:320px');
    const change = await sl.transition(base, next, { target: host, height: 'auto' });
    change.progress(0.5);
    const state = () => {
      const view = host.querySelector('.vd-view');
      const svg = host.querySelector('svg');
      return {
        figure: Math.round(rect(host.querySelector('figure')).height),
        svgIsView: Math.round(rect(svg).height) === view.clientHeight && Math.round(rect(svg).width) === view.clientWidth,
        viewBox: svg.getAttribute('viewBox'),
        view: `0 0 ${view.clientWidth} ${view.clientHeight}`
      };
    };
    const first = state();
    host.style.height = '480px';
    host.style.width = '640px';
    await settle();
    const second = state();
    return { first, second };
  });
  // The figure (title area plus chart) exactly fills the container, and the
  // canvas is exactly the room the figure leaves for the view.
  expect(result.first.figure).toBe(320);
  expect(result.first.svgIsView).toBe(true);
  expect(result.first.viewBox).toBe(result.first.view);
  expect(result.second.figure).toBe(480);
  expect(result.second.svgIsView).toBe(true);
  expect(result.second.viewBox).toBe(result.second.view);
  expect(Number(result.second.viewBox.split(' ')[3])).toBeGreaterThan(Number(result.first.viewBox.split(' ')[3]));
});

test('auto height in a container with no height of its own keeps the chart default and does not grow', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;padding:24px 0;border:1px solid #ccc');
    const change = await sl.transition(base, next, { target: host, height: 'auto' });
    change.progress(0.5);
    const svg = host.querySelector('svg');
    const heights = [Math.round(rect(svg).height)];
    for (let i = 0; i < 4; i += 1) {
      await settle();
      heights.push(Math.round(rect(svg).height));
    }
    return { heights, host: host.clientHeight };
  });
  expect(new Set(result.heights).size).toBe(1);
  expect(result.heights[0]).toBe(500);
});

test('resize() switches between fixed and auto, and rejects bad sizes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:340px');
    const change = await sl.transition(base, next, { target: host, height: 200 });
    change.progress(0.5);
    const svg = () => host.querySelector('svg');
    const figure = () => host.querySelector('figure');
    const size = () => [Math.round(rect(svg()).width), Math.round(rect(svg()).height)];
    const outer = () => [Math.round(rect(figure()).width), Math.round(rect(figure()).height)];
    change.resize({ width: 420, height: 260 });
    const resized = size();
    change.resize({ width: 'auto', height: 'auto' });
    const filled = outer();
    // Leaving a dimension out keeps its request: height stays "auto".
    change.resize({ width: 380 });
    const keptAuto = [size()[0], outer()[1]];
    change.resize({ width: 'auto', height: 200 });
    const fixed = [outer()[0], size()[1]];
    const errors = [];
    for (const bad of [{ width: 0 }, { height: -4 }, { width: Infinity }, { height: 'fill' }, { width: NaN }]) {
      try { change.resize(bad); errors.push(null); } catch (error) { errors.push(error.message); }
    }
    let option;
    try { await sl.transition(base, next, { target: mountHost(''), width: 'wide' }); } catch (error) { option = error.message; }
    return { fixed, resized, filled, keptAuto, errors, option };
  });
  expect(result.fixed).toEqual([500, 200]);
  expect(result.resized).toEqual([420, 260]);
  expect(result.filled).toEqual([500, 340]);
  expect(result.keptAuto).toEqual([380, 340]);
  expect(result.errors.every(message => /must be a finite positive number of pixels, or "auto"/.test(message))).toBe(true);
  expect(result.option).toMatch(/transition\(\) width must be/);
});

test('a sequence takes the same sizes and applies a resize to every leg', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:340px');
    const third = next.sort('other', 'ascending');
    const journey = await sl.sequence([base, next, third], { target: host, width: 460, height: 240 });
    const svg = () => host.querySelector('svg');
    const size = () => [Math.round(rect(svg()).width), Math.round(rect(svg()).height)];
    journey.progress(0.5);
    const first = size();
    // The new size reaches a leg that was prepared before the resize.
    journey.resize({ width: 'auto', height: 'auto' });
    journey.progress(1.5);
    const outer = () => { const box = rect(host.querySelector('figure')); return [Math.round(box.width), Math.round(box.height)]; };
    const filled = outer();
    // And it follows the container on its own.
    host.style.width = '620px';
    host.style.height = '400px';
    await settle();
    const followed = outer();
    journey.destroy();
    return { first, filled, followed };
  });
  expect(result.first).toEqual([460, 240]);
  expect(result.filled).toEqual([500, 340]);
  expect(result.followed).toEqual([620, 400]);
});
