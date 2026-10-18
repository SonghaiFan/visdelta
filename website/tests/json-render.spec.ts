import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`JSON rendering guide exposes the persistent view API at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto('docs/guides/json/');
    const comparison = page.locator('section[aria-label="Chart authoring comparison"]');
    await comparison.getByRole('tab', { name: 'JSON spec', exact: true }).click();
    const panel = comparison.locator('[role="tabpanel"]:visible');
    await expect(panel).toContainText("import { render } from 'visdelta'");
    await expect(panel).toContainText('await view.update(nextSpec)');
    await expect(panel).not.toContainText('registerChartModule');
    await expect(comparison.locator('.vd-docs-chart svg').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
