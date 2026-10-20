import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) test(`timeline seconds keep their pixel scale and scroll together at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 860 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#unit-value');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 20_000 });
  const scale = () => page.locator('.pg-key').evaluateAll(keys => {
    const first = keys[0].getBoundingClientRect();
    const next = keys[1].getBoundingClientRect();
    const start = first.left + first.width / 2;
    const end = next.left + next.width / 2;
    const seconds = Number((keys[1] as HTMLElement).dataset.time);
    return (end - start) / seconds;
  });
  expect(await scale()).toBeCloseTo(160, 1);
  await page.setViewportSize({ width: width + 80, height: 860 });
  expect(await scale()).toBeCloseTo(160, 1);
  await page.setViewportSize({ width, height: 860 });
  await page.evaluate(() => { location.hash = 'focus'; });
  await expect(page.getByLabel('Chart code')).toContainText('.highlight({ cyl: 4 })');
  await expect(page.locator('.pg-key').last()).toHaveAttribute('data-time', '2.7');
  expect(await scale()).toBeCloseTo(160, 1);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Stage inspector')).toBeVisible();
  const timeBeforeViewportChange = await page.getByLabel('Playhead time in seconds').inputValue();
  if (width === 1280) {
    await page.getByRole('region', { name: 'Timeline tracks', exact: true }).focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await expect.poll(scale).toBeCloseTo(640, 1);
  }
  const pixelsPerSecond = width === 1280 ? 640 : 160;
  const viewport = page.getByRole('region', { name: 'Timeline tracks', exact: true });
  const labelLeft = await page.locator('.pg-lane-labels').evaluate(node => node.getBoundingClientRect().left);
  await expect.poll(() => viewport.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await viewport.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  await expect.poll(() => viewport.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('.pg-lane-labels').evaluate(node => node.getBoundingClientRect().left)).toBe(labelLeft);
  await expect(page.getByLabel('Playhead time in seconds')).toHaveValue(timeBeforeViewportChange);
  const interval = await page.locator('.pg-category-block').first().evaluate(node => ({ start: Number((node as HTMLElement).dataset.start), end: Number((node as HTMLElement).dataset.end), x: node.getBoundingClientRect().x, width: node.getBoundingClientRect().width }));
  const origin = (await page.locator('.pg-ruler').boundingBox())!.x + 7;
  expect(interval.x).toBeCloseTo(origin + interval.start / 1000 * pixelsPerSecond, 0);
  expect(interval.width).toBeCloseTo((interval.end - interval.start) / 1000 * pixelsPerSecond, 0);
  await page.locator('.pg-ruler').scrollIntoViewIfNeeded();
  const ruler = (await page.locator('.pg-ruler').boundingBox())!;
  const room = (await viewport.boundingBox())!;
  const targetX = room.x + room.width / 2;
  const expected = Math.max(0, Math.min(2.7, (targetX - ruler.x - 7) / pixelsPerSecond));
  await page.keyboard.down('Alt');
  await page.mouse.click(targetX, ruler.y + 5);
  await page.keyboard.up('Alt');
  await expect.poll(async () => Number(await page.getByLabel('Playhead time in seconds').inputValue())).toBeCloseTo(expected, 2);
  const slider = page.getByLabel('Keyframe timeline');
  const before = Number(await slider.inputValue());
  await slider.focus();
  await slider.press('ArrowRight');
  await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(before + 0.01, 2);
  await viewport.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  const right = await viewport.evaluate(node => node.scrollLeft);
  await viewport.focus();
  await viewport.press('ArrowLeft');
  await expect.poll(() => viewport.evaluate(node => node.scrollLeft)).toBeLessThan(right);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/visdelta-time-scale-${width}.png`, fullPage: true });
  if (width === 1280) {
    await viewport.focus();
    await page.keyboard.press('0');
    await viewport.evaluate(node => { node.scrollLeft = 0; });
    await page.getByRole('region', { name: 'Keyframes', exact: true }).screenshot({ path: '/tmp/visdelta-time-scale-panel.png' });
  }
});
