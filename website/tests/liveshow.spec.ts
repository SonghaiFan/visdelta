import { expect, test } from '@playwright/test';
for (const width of [1280, 390]) {
 test(`Liveshow independent app entry at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('liveshow/');
  await expect(page.getByRole('heading', { name: 'VisDelta Liveshow' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Liveshow ↗' })).toHaveAttribute('href', 'https://songhaifan.github.io/visdelta-liveshow/');
  await expect(page.getByRole('link', { name: 'Source and integration documentation ↗' })).toHaveAttribute('href', 'https://github.com/SonghaiFan/visdelta-liveshow');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
 });
}
