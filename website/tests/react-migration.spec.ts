import { expect, test } from '@playwright/test';

test('React style previews keep shared progress while replacing styles', async ({ page }) => {
  await page.goto('docs/guides/styling/');
  const gallery = page.getByRole('region', { name: 'Switch the whole chart style' });
  await expect(gallery.getByText('D3 active · 5 charts', { exact: true })).toBeVisible();
  const progress = gallery.getByLabel('Style preview transition progress');
  await progress.fill('0.8');
  await gallery.getByRole('button', { name: /^Paper/ }).click();
  await expect(gallery.getByText('Paper active · 5 charts', { exact: true })).toBeVisible();
  await expect(progress).toHaveValue('0.8');
  await expect(gallery.locator('.vd-docs-chart .vd-chart-figure')).toHaveCount(5);
});
