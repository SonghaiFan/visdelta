import { test, expect } from '@playwright/test';

// A chart's canvas (its SVG, margins included) is either a fixed number of pixels
// or "auto": exactly the container's content box, in width, in height, or both.
// Omitted, the width follows the container inside the figure's own chrome.

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

test('auto width makes the canvas exactly the container wide and follows it; a fixed height stays', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:400px');
    const change = await sl.transition(base, next, { target: host, width: 'auto', height: 300 });
    change.progress(0.5);
    // A resize redraws, so the nodes are looked up again each time.
    const measure = () => {
      const svg = host.querySelector('svg');
      return { canvas: Math.round(rect(svg).width), height: Math.round(rect(svg).height), viewBox: svg.getAttribute('viewBox') };
    };
    const narrow = measure();
    host.style.width = '700px';
    await settle();
    return { narrow, wide: measure() };
  });
  expect(result.narrow).toEqual({ canvas: 400, height: 300, viewBox: '0 0 400 300' });
  expect(result.wide).toEqual({ canvas: 700, height: 300, viewBox: '0 0 700 300' });
});

test('an omitted width follows the container inside the figure\'s own chrome', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:400px');
    const change = await sl.transition(base, next, { target: host, height: 300 });
    change.progress(0.5);
    const border = parseFloat(getComputedStyle(host.querySelector('figure')).borderLeftWidth);
    return { figure: Math.round(rect(host.querySelector('figure')).width), canvas: Math.round(rect(host.querySelector('svg')).width), border };
  });
  expect(result.figure).toBe(400);
  expect(result.border).toBeGreaterThan(0);
  expect(result.canvas).toBe(400 - 2 * result.border);
});

test('auto makes the canvas exactly the container, and follows it in both dimensions', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:320px');
    const change = await sl.transition(base, next, { target: host, width: 'auto', height: 'auto' });
    change.progress(0.5);
    const state = () => {
      const svg = host.querySelector('svg');
      const box = rect(svg);
      return { canvas: [Math.round(box.width), Math.round(box.height)], viewBox: svg.getAttribute('viewBox'), figure: [Math.round(rect(host.querySelector('figure')).width), Math.round(rect(host.querySelector('figure')).height)] };
    };
    const first = state();
    host.style.height = '480px';
    host.style.width = '640px';
    await settle();
    return { first, second: state() };
  });
  // The canvas is the container: no border or empty title strip takes room from it.
  expect(result.first).toEqual({ canvas: [500, 320], viewBox: '0 0 500 320', figure: [500, 320] });
  expect(result.second).toEqual({ canvas: [640, 480], viewBox: '0 0 640 480', figure: [640, 480] });
});

test('auto height alone leaves the width as it was', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const host = mountHost('width:500px;height:320px');
    const change = await sl.transition(base, next, { target: host, height: 'auto' });
    change.progress(0.5);
    const svg = host.querySelector('svg');
    const border = parseFloat(getComputedStyle(host.querySelector('figure')).borderLeftWidth);
    return { canvas: [Math.round(rect(svg).width), Math.round(rect(svg).height)], border };
  });
  expect(result.canvas).toEqual([500 - 2 * result.border, 320]);
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
    const size = () => [Math.round(rect(svg()).width), Math.round(rect(svg()).height)];
    change.resize({ width: 420, height: 260 });
    const resized = size();
    change.resize({ width: 'auto', height: 'auto' });
    const filled = size();
    // Leaving a dimension out keeps its request: height stays "auto".
    change.resize({ width: 380 });
    const keptAuto = size();
    // Fixed again: the chrome the "auto" request removed comes back around the canvas.
    change.resize({ width: 'auto', height: 200 });
    const fixed = size();
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
    const outer = () => { const box = rect(host.querySelector('svg')); return [Math.round(box.width), Math.round(box.height)]; };
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
