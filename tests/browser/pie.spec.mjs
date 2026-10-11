import { test, expect } from '@playwright/test';

test('pie and donut use angular motion, preserve keys, and restore both endpoints', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { pie } = await import('/dist/pie.js');
    const { transition } = await import('/dist/transition-entry.js');
    const rows = [{ part: 'A', apples: 25, oranges: 75 }, { part: 'B', apples: 75, oranges: 25 }];
    const a = pie(rows).value('apples').color('part').key('part').label('part');
    const b = a.value('oranges').innerRadius(0.75).labels('inside');
    const host = document.querySelector('#chart');
    const frame = () => [...host.querySelectorAll('path.vd-pie-slice')].map(node => ({ key: node.dataset.key, d: node.getAttribute('d'), end: +node.getAttribute('data-end-angle'), inner: +node.getAttribute('data-inner-radius') }));
    const staticHost = document.createElement('div');
    staticHost.style.width = `${host.clientWidth}px`;
    document.body.append(staticHost);
    const staticA = await transition(a, a, { target: staticHost, height: 320 }); staticA.progress(1);
    const endpointA = [...staticHost.querySelectorAll('path.vd-pie-slice')].map(node => node.getAttribute('d')); staticA.destroy();
    const staticB = await transition(b, b, { target: staticHost, height: 320 }); staticB.progress(1);
    const endpointB = [...staticHost.querySelectorAll('path.vd-pie-slice')].map(node => node.getAttribute('d')); staticB.destroy();
    const motion = await transition(a, b, { target: host, height: 320 });
    motion.progress(0); const start = frame();
    motion.progress(0.5); const middle = frame();
    motion.progress(1); const end = frame();
    motion.progress(0); const restored = frame();
    async function waitFor(value) {
      const until = performance.now() + 5000;
      while (motion.value !== value && performance.now() < until) await new Promise(requestAnimationFrame);
      if (motion.value !== value) throw new Error('Pie playback did not reach its endpoint');
    }
    motion.play({ from: 0, to: 1, duration: 100 }); await waitFor(1);
    const forward = frame();
    motion.play({ from: 1, to: 0, duration: 100 }); await waitFor(0);
    const reverse = frame();
    motion.destroy(); staticHost.remove();
    return { start, middle, end, restored, forward, reverse, endpointA, endpointB, rows };
  });
  expect(result.start.map(d => d.d)).toEqual(result.endpointA);
  expect(result.end.map(d => d.d)).toEqual(result.endpointB);
  expect(result.restored).toEqual(result.start);
  expect(result.forward.map(d => d.d)).toEqual(result.endpointB);
  expect(result.reverse.map(d => d.d)).toEqual(result.endpointA);
  expect(result.middle.map(d => d.key)).toEqual(['A', 'B']);
  expect(result.middle[0].end).toBeGreaterThan(result.start[0].end);
  expect(result.middle[0].end).toBeLessThan(result.end[0].end);
  expect(result.middle[0].inner).toBeGreaterThan(0);
  expect(result.middle.every(d => !/NaN|Infinity/.test(d.d))).toBe(true);
  expect(result.rows[0].apples).toBe(25);
});

test('pie updates membership, resizes and renders valid small-label geometry', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  await page.evaluate(async () => {
    const { pie } = await import('/dist/pie.js');
    const { transition } = await import('/dist/transition-entry.js');
    const rows = [{ part: 'Large', n: 90 }, { part: 'Small one', n: 3 }, { part: 'Small two', n: 3 }, { part: 'Small three', n: 4 }];
    const a = pie(rows).value('n').key('part').color('part').label('part');
    globalThis.pieMotion = await transition(a, a.where({ field: 'n', gt: 3 }), { target: '#chart', height: 320 });
    pieMotion.progress(1);
  });
  const paths = page.locator('#chart path.vd-pie-slice');
  await expect(paths).toHaveCount(2);
  await page.evaluate(() => pieMotion.progress(0));
  await expect(paths).toHaveCount(4);
  const radius = Number(await paths.first().getAttribute('data-radius'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => pieMotion.resize());
  await expect.poll(async () => Number(await paths.first().getAttribute('data-radius'))).toBeLessThan(radius);
  await expect.poll(() => paths.first().getAttribute('d')).not.toMatch(/NaN|Infinity/);
  await page.evaluate(() => pieMotion.destroy());
});
