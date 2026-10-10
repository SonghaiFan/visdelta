import { test, expect } from '@playwright/test';

const site = '/docs/.vitepress/dist';

test('navigation exposes the four site sections and Docs groups philosophy and syntax', async ({ page }) => {
  await page.goto(`${site}/overview.html`);
  const nav = page.locator('.VPNavBarMenu');
  for (const name of ['Home', 'Docs', 'Playground', 'Gallery']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Docs', exact: true })).toHaveClass(/active/);
  const sidebar = page.locator('#VPSidebarNav');
  for (const group of ['Philosophy', 'Syntax', 'Runtime', 'Integrate']) {
    await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.docs-track')).toHaveCount(2);
});

test('gallery renders every idiom with the library and links each to its playground scenario', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/gallery.html`);
  const cards = page.locator('.idiom-card');
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(20);
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.idiom-card-chart svg.vd-chart')).toHaveCount(1, { timeout: 15000 });
    await expect(card.locator('.idiom-card-status')).toHaveCount(0);
    const id = await card.getAttribute('data-idiom');
    const [chart, ...scenario] = id.split('-');
    await expect(card.getByRole('link', { name: 'Open in Playground' }))
      .toHaveAttribute('href', `./playground.html#${chart}/${scenario.join('-')}`);
  }

  // Filtering unmounts cards; returning cards must render again, not stay blank.
  const filters = page.getByRole('group', { name: 'Filter by chart module' });
  await filters.getByRole('button', { name: 'Unit', exact: true }).click();
  await expect(cards).toHaveCount(await page.locator('.idiom-card[data-idiom^="unit-"]').count());
  await expect(page.locator('.idiom-card:not([data-idiom^="unit-"])')).toHaveCount(0);
  await filters.getByRole('button', { name: 'All', exact: true }).click();
  await expect(cards).toHaveCount(count);
  const bar = page.locator('.idiom-card[data-idiom="bar-measure"]');
  await bar.scrollIntoViewIfNeeded();
  await expect(bar.locator('.idiom-card-chart rect.vd-bar').first()).toBeVisible({ timeout: 15000 });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('playground chart floats by default, docks beside the code, and remembers the choice', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${site}/playground.html#bar/measure`);
  await expect(page.locator('.playground-status')).toHaveText('Ready');
  const root = page.locator('.snapshot-playground');
  await expect(root).toHaveClass(/is-chart-float/);

  await page.getByRole('button', { name: 'Dock' }).click();
  await expect(root).toHaveClass(/is-chart-dock/);
  const code = await page.locator('.snapshot-code').boundingBox();
  const chart = await page.locator('.snapshot-chart').boundingBox();
  expect(chart.x).toBeGreaterThanOrEqual(code.x + code.width);
  await expect.poll(() => page.locator('.playground-chart svg.vd-chart').evaluate(svg => svg.getBoundingClientRect().width))
    .toBeLessThanOrEqual(chart.width);

  await page.reload();
  await expect(page.locator('.playground-status')).toHaveText('Ready');
  await expect(root).toHaveClass(/is-chart-dock/);
  await page.getByRole('button', { name: 'Float' }).click();
  await expect(root).toHaveClass(/is-chart-float/);

  const head = page.locator('.snapshot-chart .snapshot-panel-head');
  const before = await page.locator('.snapshot-chart').boundingBox();
  const grip = await head.boundingBox();
  await page.mouse.move(grip.x + 30, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 170, grip.y + 60, { steps: 6 });
  await page.mouse.up();
  const after = await page.locator('.snapshot-chart').boundingBox();
  expect(after.x).toBeLessThan(before.x - 100);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Dock' })).toBeHidden();
});

test('design token reference reads live values for both appearances', async ({ page }) => {
  await page.goto(`${site}/design-tokens.html`);
  const canvas = page.locator('.token-swatch', { hasText: '--ui-color-canvas' });
  await expect(canvas.locator('span')).toHaveText('#f4f4f2');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(canvas.locator('span')).toHaveText('#111210');
});
