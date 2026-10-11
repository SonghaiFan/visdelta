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

for (const width of [1100, 390]) {
  test(`Datawrapper explanations and source links fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(site);
    await expect(page.locator('.VPDoc')).toBeVisible();
    await expect(page.locator('.VPPage')).toHaveCount(0);
    if (width >= 960) await expect(page.locator('.VPSidebar')).toBeVisible();
    const header = await page.locator('.vp-doc > div').first().boundingBox();
    for (const selector of ['.comparison-intro', '.design-comparisons']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(Math.abs(bounds.x - header.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds.width - header.width)).toBeLessThanOrEqual(1);
    }
    const blocks = page.locator('.datawrapper-guidance');
    await expect(blocks).toHaveCount(6);
    for (const block of await blocks.all()) {
      await expect(block).toContainText('Why this can be less effective.');
      await expect(block).toContainText('What VisDelta can detect.');
      await expect(block.getByRole('link', { name: 'Source: Datawrapper Academy' })).toHaveAttribute('href', /^https:\/\/www.datawrapper.de\/academy\//);
      expect(await block.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

for (const width of [1440, 390]) {
  test(`compact pie remains visible beside its explanation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(site);
    await page.getByRole('button', { name: 'Pie alternatives', exact: true }).click();
    const compact = page.locator('[data-comparison="pie-space"] [data-side="after"]');
    await compact.scrollIntoViewIfNeeded();
    await expect(compact.locator('.vd-pie-slice')).toHaveCount(4);
    const radii = await compact.locator('.vd-pie-slice').evaluateAll(nodes => nodes.map(node => Number(node.dataset.radius)));
    expect(Math.min(...radii)).toBeGreaterThan(25);
    await expect(compact.locator('.comparison-compact-message')).toContainText('60%');
    expect(await compact.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await compact.screenshot({ path: `/tmp/visdelta-compact-pie-${width}.png` });
  });
}

for (const width of [1100, 1440]) {
test(`design guides provide the standard right-hand section outline at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(site);
  const outline = page.locator('.VPDocAsideOutline');
  await expect(outline).toBeVisible();
  await expect(outline.locator('a')).toHaveCount(6);
  await outline.getByRole('link', { name: 'Pie alternatives', exact: true }).click();
  await expect(page).toHaveURL(/#guide-pie$/);
  await expect(page.locator('h2#guide-pie')).toBeInViewport();
  const content = await page.locator('.VPDoc > .container > .content').boundingBox();
  const aside = await page.locator('.VPDoc .aside').boundingBox();
  expect(content.x + content.width).toBeLessThanOrEqual(aside.x + 1);
});
}

for (const width of [1440, 390]) {
  test(`expanded comparison code stays within the docs column at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(site);
    const example = page.locator('[data-comparison="stack-irregular"]');
    await example.scrollIntoViewIfNeeded();
    const details = example.locator('[data-side="after"] .comparison-code');
    const before = await example.boundingBox();
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    const after = await example.boundingBox();
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    for (const selector of ['.comparison-frame', '.comparison-tools', '.doc-code-block']) {
      for (const node of await example.locator(selector).all()) {
        if (!await node.isVisible()) continue;
        const box = await node.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(after.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(after.x + after.width + 1);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
