import { test, expect } from '@playwright/test';

for (const width of [1100, 390]) {
  test(`product-first documentation homepage works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/docs\/\.vitepress\/dist\/$/);
    await expect(page).toHaveTitle(/VisDelta/);
    await expect(page.getByRole('heading', { name: 'Chart change, animated.' })).toBeVisible();
    await expect(page.getByLabel('Install VisDelta with npm')).toContainText('npm install visdelta');
    await expect(page.locator('.hero-data-table-shell tbody tr')).toHaveCount(6);

    const demo = page.locator('.hero-demo');
    await expect(demo).toBeVisible();
    await expect(demo.locator('rect.vd-bar').first()).toBeVisible();
    await expect(demo.getByRole('tab')).toHaveCount(5);
    await expect(demo.getByRole('slider')).toHaveCount(0);
    await expect(page.locator('.home-studio')).toHaveCount(0);

    const code = page.locator('.hero-demo-code');
    await expect(code).toContainText('Auto editing');
    await expect(code).toContainText('.x("year")');
    await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.color("country")');
    await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.layout("grouped")');
    await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.flip()');

    await expect.poll(async () => {
      const bars = await demo.locator('rect.vd-bar').evaluateAll(nodes => nodes.map(node => ({
        width: Number(node.getAttribute('width')),
        height: Number(node.getAttribute('height'))
      })));
      return bars.some(bar => bar.width > bar.height);
    }, { timeout: 3000 }).toBe(true);

    await demo.getByRole('tab', { name: 'Line' }).click();
    await expect(demo.getByRole('tab', { name: 'Line' })).toHaveAttribute('aria-selected', 'true');
    await expect(code).toContainText('const chart = line(rows)');
    await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.curve("curveBumpX")');

    if (width === 1100) {
      await demo.getByRole('tab', { name: 'Area' }).click();
      await expect(demo.getByRole('tab', { name: 'Area' })).toHaveAttribute('aria-selected', 'true');
      await expect(code).toContainText('const chart = area(rows)');
      await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.layout("stream")');

      await demo.getByRole('tab', { name: 'Point' }).click();
      await expect(demo.getByRole('tab', { name: 'Point' })).toHaveAttribute('aria-selected', 'true');
      await expect(code).toContainText('const chart = point(rows)');
      await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.connector({ by: "country", orderBy: "year" })');

      await demo.getByRole('tab', { name: 'Unit' }).click();
      await expect(demo.getByRole('tab', { name: 'Unit' })).toHaveAttribute('aria-selected', 'true');
      await expect(code).toContainText('const chart = unit(rows)');
      await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.group("country")');
      await expect.poll(() => code.innerText(), { timeout: 7000 }).toContain('.layout("force")');
    }

    await expect(page.locator('.product-proof > div')).toHaveCount(3);
    await expect(page.locator('.product-code')).toContainText('change.progress(0.42)');
    await expect(page.getByRole('link', { name: 'Run a difference' }))
      .toHaveAttribute('href', './playground.html');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
