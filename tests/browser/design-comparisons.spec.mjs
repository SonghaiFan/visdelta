import { test, expect } from '@playwright/test';
const site = '/docs/.vitepress/dist/design-guides.html';

test('every design comparison renders its supported chart sides with real library marks', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(site);
  await expect(page.locator('.comparison-example')).toHaveCount(53);
  const panels = page.locator('.comparison-panel');
  for (let i = 0; i < await panels.count(); i++) {
    const panel = panels.nth(i);
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.locator('svg.vd-chart')).toHaveCount(1, { timeout: 15000 });
    await expect(panel.locator('.comparison-status')).toHaveCount(0);
    expect(await panel.locator('svg.vd-chart').evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(490);
    await expect(panel.locator('.vd-figure-header')).toBeHidden();
    expect(await panel.locator('.vd-bar, .vd-pie-slice, .vd-point, .vd-line, .vd-area').count()).toBeGreaterThan(0);
  }
  const frames = page.locator('.comparison-frame');
  expect(await frames.count()).toBe(106);
  for (const part of ['.comparison-headline', '.comparison-description', '.comparison-footer']) {
    expect(await page.locator(`.comparison-frame ${part}`).count()).toBe(106);
  }
  await expect(page.locator('.comparison-footer').first()).toContainText('Source: Illustrative data');
  expect(await page.locator('.vd-axis .tick text').evaluateAll(nodes => nodes.filter(node => /^\d,\d{3}(\.\d)?$/.test(node.textContent)).length)).toBe(0);
  const differences = page.locator('[data-comparison="bar-change"] [data-side="after"]');
  await differences.scrollIntoViewIfNeeded();
  expect(await differences.evaluate(node => {
    const bounds = node.querySelector('svg').getBoundingClientRect();
    return [...node.querySelectorAll('rect.vd-bar')].every(bar => {
      const mark = bar.getBoundingClientRect();
      return mark.height > 0 && mark.top >= bounds.top && mark.bottom <= bounds.bottom + 1;
    });
  })).toBe(true);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Stacked columns', exact: true }).click();
  await expect(page.locator('.comparison-example')).toHaveCount(12);
  const split = page.locator('[data-comparison="stack-components"]');
  await split.scrollIntoViewIfNeeded();
  await expect(split.locator('.comparison-pair')).toHaveCount(1);
  await expect(split.locator('.repeat-motion-demo')).toHaveCount(0);
  await expect(split.locator('[data-side="after"] .vd-facet-panel')).toHaveCount(4);
  await page.screenshot({ path: '/tmp/visdelta-design-comparisons-desktop.png' });
  await page.getByRole('button', { name: 'Pie alternatives', exact: true }).click();
  await expect(page.locator('.comparison-example')).toHaveCount(10);
  await expect(page.locator('.comparison-limit')).toHaveCount(0);
});

test('core Repeat syntax and plugin Pie examples remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/.vitepress/dist/repeat.html');
  await expect(page.locator('.repeat-motion-status')).toHaveText('Ready');
  await page.getByRole('slider', { name: 'Repeat progress' }).fill('1');
  await expect(page.locator('.vd-facet-panel')).toHaveCount(4);
  await expect(page.locator('.vd-facet-x-label, .vd-facet-y-label')).toHaveText(['','','','','','','','']);
  await expect(page.locator('.vd-x-label')).toHaveText('Label →');
  await expect(page.locator('.vd-y-label')).toHaveText('↑ Sum of Units');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Play repeat', exact: true }).click();
  await page.getByRole('button', { name: 'Reverse repeat', exact: true }).click();
  await page.screenshot({ path: '/tmp/visdelta-repeat-syntax-mobile.png' });
  await page.locator('.comparison-code summary').click();
  await expect(page.locator('.comparison-code')).toContainText('.repeat("part"');
  await page.goto('/docs/.vitepress/dist/extending-with-plugins.html');
  await expect(page.locator('.pie-motion-status')).toHaveText('Ready');
  await page.getByRole('slider', { name: 'Arc progress' }).fill('0.5');
  await expect(page.locator('[data-pie-motion="series"] .vd-pie-slice')).toHaveCount(3);
  await page.getByRole('button', { name: 'Play arcs', exact: true }).click();
  await page.getByRole('button', { name: 'Reverse arcs', exact: true }).click();
});
