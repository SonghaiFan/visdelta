import { expectFit } from './fit';
import { expect, test } from '@playwright/test';
import { playgroundDemos, storyFrames } from '../components/playground/demos';

test('every curated story reaches its final saved frame and fits the narrow viewport', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const demo of playgroundDemos) {
    await test.step(demo.id, async () => {
      await page.goto(`playground/#${demo.id}`);
      const keys = page.locator('.pg-key');
      await expect(keys).toHaveCount(demo.edits.length + 1, { timeout: 30_000 });
      const chart = page.getByLabel('Chart', { exact: true });
      await expect(chart.locator('svg').first()).toBeVisible();
      await expect.poll(async () => (await page.getByLabel('Chart code').locator('.cm-line').allTextContents()).join('\n'), { timeout: 10_000 }).toBe(storyFrames(demo).at(-1));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${demo.id} should fit a 390px viewport`).toBeLessThanOrEqual(1);
    });
  }
});

test('changing stories and returning a scrolled fixed canvas to Fit keeps the chart visible', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#sort');
  const stage = page.getByLabel('Chart', { exact: true });
  const sizes = page.getByRole('group', { name: 'Chart size' });
  const box = (locator: ReturnType<typeof page.locator>) => locator.evaluate(node => ({
    width: Math.round(node.getBoundingClientRect().width), height: Math.round(node.getBoundingClientRect().height)
  }));
  for (const id of ['service-line-split', 'service-composition', 'swarm', 'steps', 'horizontal-rank', 'sort']) {
    await sizes.getByRole('button', { name: 'Fixed', exact: true }).click();
    await page.getByLabel('Chart width in pixels').fill('1500');
    await page.getByLabel('Chart height in pixels').fill('1100');
    await page.evaluate(id => { location.hash = id; }, id);
    const demo = playgroundDemos.find(demo => demo.id === id)!;
    await expect(page.locator('.pg-key')).toHaveCount(demo.edits.length + 1, { timeout: 20_000 });
    await expect.poll(async () => (await page.getByLabel('Chart code').locator('.cm-line').allTextContents()).join('\n')).toBe(storyFrames(demo).at(-1));
    await page.getByLabel('Keyframe timeline').fill('0.5');
    await stage.evaluate(node => { node.scrollLeft = node.scrollWidth; node.scrollTop = node.scrollHeight; });
    await sizes.getByRole('button', { name: 'Fit', exact: true }).click();
    const figure = stage.locator('.pg-layer[data-state="shown"] figure').first();
    await expectFit(stage);
    await expect(figure.locator('svg').first()).toHaveAttribute('viewBox', '0 0 1500 1100');
    await expect.poll(() => stage.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }))).toEqual({ left: 0, top: 0 });
    const svg = figure.locator('svg').first();
    await expect(svg).toBeVisible();
    expect((await box(svg)).height).toBeGreaterThan(100);
    await expect.poll(() => figure.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return [...node.querySelectorAll('.vd-bar, .vd-line, .vd-area, .vd-point, .vd-unit')].some(mark => {
        const box = mark.getBoundingClientRect();
        return (box.width > 0 || box.height > 0) && getComputedStyle(mark).opacity !== '0'
          && box.right > bounds.left && box.left < bounds.right && box.bottom > bounds.top && box.top < bounds.bottom;
      });
    })).toBe(true);
  }
});

test('Fit remains visible when the size mode changes during example loading and writing', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('playground/#sort');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25_000 });
  const sizes = page.getByRole('group', { name: 'Chart size' });
  for (const id of ['service-line-split', 'swarm', 'service-composition', 'sort']) {
    await sizes.getByRole('button', { name: 'Fixed', exact: true }).click();
    await page.evaluate(id => { location.hash = id; }, id);
    await sizes.getByRole('button', { name: 'Fit', exact: true }).click();
    await sizes.getByRole('button', { name: 'Fixed', exact: true }).click();
    await sizes.getByRole('button', { name: 'Fit', exact: true }).click();
    const demo = playgroundDemos.find(demo => demo.id === id)!;
    await expect(page.locator('.pg-key')).toHaveCount(demo.edits.length + 1, { timeout: 25_000 });
    const stage = page.getByLabel('Chart', { exact: true });
    await expectFit(stage);
  }
  expect(errors).toEqual([]);
});

test('a chart prepared during Fixed adopts Fit before replacing the previous chart', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#sort');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25_000 });
  await page.getByRole('group', { name: 'Chart size' }).getByRole('button', { name: 'Fixed', exact: true }).click();
  await page.evaluate(() => {
    const stage = document.querySelector('.pg-stage')!;
    const observer = new MutationObserver(records => {
      if (!records.some(record => [...record.addedNodes].some(node => node instanceof HTMLElement && node.classList.contains('pg-layer')))) return;
      observer.disconnect();
      const fit = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Chart size"] button')].find(button => button.textContent === 'Fit')!;
      fit.click();
    });
    observer.observe(stage, { childList: true });
    location.hash = 'service-line-split';
  });
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByRole('group', { name: 'Chart size' }).getByRole('button', { name: 'Fit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expectFit(page.locator('.pg-stage'));
});

test('the car summary uses gooey blending without authored effect settings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#summarize');
  await expect(page.locator('.pg-key')).toHaveCount(2, { timeout: 20_000 });
  await page.getByLabel('Keyframe timeline').fill('0.25');
  const layer = page.locator('.pg-layer[data-state="shown"]');
  await expect(layer.locator('.vd-point-blend-layer')).toHaveCSS('visibility', 'visible');
  await expect(layer.locator('.vd-point-crisp-layer')).toHaveCSS('visibility', 'hidden');
  await expect(layer.locator('.vd-point-blend-group')).toHaveCount(2);
  await page.getByLabel('Keyframe timeline').fill('1');
  await expect(layer.locator('.vd-point-crisp-layer')).toHaveCSS('visibility', 'visible');
  await expect(layer.locator('.vd-point-blend-layer')).not.toHaveCSS('visibility', 'visible');
});

test('scrubbing changes chart code at keyframes rather than leg midpoints', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#sort');
  const demo = playgroundDemos.find(demo => demo.id === 'sort')!;
  const frames = storyFrames(demo);
  await expect(page.locator('.pg-key')).toHaveCount(frames.length, { timeout: 20_000 });
  const slider = page.getByLabel('Keyframe timeline');
  const lines = page.getByLabel('Chart code').locator('.cm-line');
  const times = await page.locator('.pg-key').evaluateAll(keys => keys.map(key => Number((key as HTMLElement).dataset.time)));
  const middleA = (times[0] + times[1]) / 2;
  const middleB = (times[1] + times[2]) / 2;
  for (const time of [0, middleA - 0.01, middleA + 0.01, times[1] - 0.01, times[1],
    middleB - 0.01, middleB + 0.01, times[2] - 0.01, times[2], times[2] - 0.01, times[1], times[1] - 0.01, 0]) {
    await slider.fill(String(Math.round(time * 100) / 100));
    const reached = times.filter(boundary => boundary <= time + 1e-9).length - 1;
    await expect.poll(async () => (await lines.allTextContents()).join('\n'), { message: `code at ${time}s` }).toBe(frames[reached]);
  }
});
