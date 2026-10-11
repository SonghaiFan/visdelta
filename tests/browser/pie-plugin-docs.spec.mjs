import { test, expect } from '@playwright/test';

for (const width of [1100, 390]) {
  test(`Pie documentation demo plays, reverses and scrubs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/docs/.vitepress/dist/extending-with-plugins.html');
    const demo = page.getByRole('region', { name: 'Live Pie plugin demo' });
    const marks = demo.locator('.vd-pie-slice');
    await expect(marks).toHaveCount(4);
    const angles = () => marks.evaluateAll(nodes => nodes.map(node => +node.getAttribute('data-end-angle')));
    const start = await angles();
    expect(start[0]).toBeCloseTo(2 * Math.PI * 100 / 1350, 8);
    await demo.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(demo.locator('output')).toHaveText('100%');
    const end = await angles();
    expect(end[0]).toBeCloseTo(2 * Math.PI * 625 / 1353, 8);
    await demo.getByRole('button', { name: 'Reverse' }).click();
    await expect(demo.locator('output')).toHaveText('0%');
    expect(await angles()).toEqual(start);
    await demo.getByRole('slider', { name: 'Pie progress' }).fill('0.5');
    const middle = await angles();
    expect(middle[0]).toBeGreaterThan(start[0]);
    expect(middle[0]).toBeLessThan(end[0]);
    await page.setViewportSize({ width: width === 390 ? 430 : 950, height: 850 });
    await expect.poll(angles).toEqual(middle);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await demo.getByText('View Pie module.ts', { exact: true }).click();
    await expect(demo.locator('details').filter({ hasText: 'View Pie module.ts' })).toContainText('defineChartModule');
    await expect(page.locator('a[href*="examples/plugins/orbit/index.js"]')).toHaveCount(0);
  });
}
