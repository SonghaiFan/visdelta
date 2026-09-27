import { test, expect } from '@playwright/test';

for (const width of [1100, 390]) {
  test(`Orbit documentation demo plays, reverses and scrubs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/docs/.vitepress/dist/extending-with-plugins.html');
    const demo = page.getByRole('region', { name: 'Live Orbit plugin demo' });
    const marks = demo.locator('.orbit-mark');
    await expect(marks).toHaveCount(4);
    const radii = () => marks.evaluateAll(nodes => nodes.map(node => +node.getAttribute('r')));
    expect(await radii()).toEqual([10, 20, 15, 25]);
    await demo.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(demo.locator('output')).toHaveText('100%');
    expect(await radii()).toEqual([25, 12, 22, 10]);
    await demo.getByRole('button', { name: 'Reverse' }).click();
    await expect(demo.locator('output')).toHaveText('0%');
    expect(await radii()).toEqual([10, 20, 15, 25]);
    await demo.getByRole('slider', { name: 'Orbit progress' }).fill('0.5');
    const middle = await radii();
    expect(middle[0]).toBeGreaterThan(10);
    expect(middle[0]).toBeLessThan(25);
    await page.setViewportSize({ width: width === 390 ? 430 : 950, height: 850 });
    await expect.poll(radii).toEqual(middle);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await demo.getByText('View Orbit plugin source', { exact: true }).click();
    await expect(demo.locator('details')).toContainText('defineChartModule');
    await expect(page.locator('a[href*="examples/plugins/orbit/index.js"]')).toHaveCount(0);
  });
}
