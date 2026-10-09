import { test, expect } from '@playwright/test';
import { setCells } from './code-editor.mjs';

test('all built-in peers opt into the shared compound declaration route', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const results = await page.evaluate(async () => {
    const api = window.VisDelta;
    const rows = [{ id: 'A', value: 2, group: 'a' }, { id: 'B', value: 5, group: 'b' }];
    const results = [];
    for (const type of ['bar', 'point', 'line', 'area', 'unit']) {
      const target = document.createElement('div');
      target.style.width = '500px';
      document.body.append(target);
      const base = (type === 'unit' ? api.unit(rows).layout('grid') : api[type](rows).x('id').y('value')).key('id');
      const from = base.focus({ group: 'a' });
      const to = base.color('#3366ff').highlight({ group: 'b' });
      const change = await api.transition(from, to, { target, height: 300 });
      // Reconstruction renderers instantiate serial phases only away from endpoints.
      change.progress(0.52);
      const count = change.view.__visDeltaScene.seekSequence?.phases.length;
      const snapshot = () => [...target.querySelectorAll('[data-key]')].map(node => node.outerHTML);
      const middle = snapshot();
      change.progress(1);
      change.progress(0.52);
      results.push({ type, count, middle, reverse: snapshot() });
      change.destroy();
      target.remove();
    }
    return results;
  });
  for (const result of results) {
    expect(result.count, result.type).toBe(3);
    expect(result.middle.length, result.type).toBeGreaterThan(0);
    expect(result.reverse, result.type).toEqual(result.middle);
  }
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
    const base = vd.point(rows).key('id').x('x').y('y');
    const from = base.focus({ group: 'A' });
    const to = base.y('other').highlight({ group: 'B' });
    const options = target => ({ target, width: 700, height: 400 });
    // SVG transform interpolation goes through browser float32 matrices.
    const normalized = value => value.replace(/,\s+/g, ',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
      token => String(Math.round((Number(token) + 1e-7) * 100) / 100));
    const snapshot = target => [...document.querySelector(target).querySelectorAll('circle.vd-point, .tick, .vd-x-label, .vd-y-label')].map(node => ({
      text: node.textContent,
      attrs: [...node.attributes].map(({ name, value }) => [name, normalized(value)]).sort()
    }));
    const change = await vd.transition(from, to, options('#a'));
    const count = change.view.__visDeltaScene.seekSequence.phases.length;
    const matches = [];
    for (const [progress, state] of [[0, from], [1 / 3, base], [2 / 3, base.y('other')], [1, to]]) {
      change.progress(progress);
      const expected = await vd.transition(state, state, options('#b'));
      expected.progress(1);
      matches.push({ actual: snapshot('#a'), expected: snapshot('#b') });
      expected.destroy();
    }
    const samples = [0.12, 0.45, 0.82].map(progress => { change.progress(progress); return snapshot('#a'); });
    change.progress(1);
    const reverse = [0.82, 0.45, 0.12].map(progress => { change.progress(progress); return snapshot('#a'); }).reverse();
    const story = await vd.sequence([from, to, base], options('#b'));
    story.progress(1);
    change.progress(1);
    return { count, matches, samples, reverse, boundary: JSON.stringify(snapshot('#a')) === JSON.stringify(snapshot('#b')), value: story.value };
  });
  expect(result.count).toBe(3);
  for (const { actual, expected } of result.matches) expect(actual).toEqual(expected);
  expect(result.reverse).toEqual(result.samples);
  expect(result.boundary).toBe(true);
  expect(result.value).toBe(1);
});

for (const width of [1100, 390]) {
  test(`arbitrary compound pair in point lab supports play, reverse, and scrub at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/docs/.vitepress/dist/playground.html#point/x');
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
