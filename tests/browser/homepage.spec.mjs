import { test, expect } from '@playwright/test';

for (const width of [1100, 390]) {
  test(`canonical documentation homepage works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/docs\/\.vitepress\/dist\/$/);
    await expect(page).toHaveTitle(/VisDelta/);
    await expect(page.getByRole('heading', { name: 'Make data changes feel obvious.' })).toBeVisible();

    const showcase = page.locator('.transition-showcase');
    await showcase.scrollIntoViewIfNeeded();
    await expect(showcase).toBeVisible();
    await expect(showcase.locator('.transition-showcase-topline')).toContainText(/Auto-playing|Paused/);
    await expect(showcase.locator('rect.vd-bar').first()).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
