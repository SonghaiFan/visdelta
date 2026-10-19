import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Australia/Melbourne' });
for (const width of [1280, 390]) {
  test(`monthly service chart has readable ticks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto('playground/#area-labels');
    await expect(page.locator('.pg-key')).toHaveCount(2, { timeout: 25_000 });
    const chart = page.getByLabel('Chart', { exact: true }).locator('.pg-layer[data-state=shown]');
    await expect(chart.locator('.vd-x-axis .tick text').first()).toContainText('Jan');
    const dates = await chart.locator('.vd-x-axis .tick text').allTextContents();
    expect(dates.every(label => /^(Jan|Feb|Mar|Apr|May|Jun|Jul)$/.test(label))).toBe(true);
    const numbers = await chart.locator('.vd-y-axis .tick text').allTextContents();
    expect(numbers).toContain('332');
    expect(numbers.every(label => !/[eE][+-]/.test(label))).toBe(true);
  });
}
