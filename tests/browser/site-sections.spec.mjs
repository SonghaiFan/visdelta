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

test('gallery draws every idiom tile with the library, grouped by mark', async ({ page }) => {
  test.setTimeout(150000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/gallery.html`);
  await expect(page.locator('.idiom-group h2')).toHaveText(['Bar', 'Line', 'Area', 'Point', 'Unit']);
  const tiles = page.locator('.idiom-tile');
  const count = await tiles.count();
  expect(count).toBeGreaterThanOrEqual(40);
  for (let index = 0; index < count; index += 1) {
    const tile = tiles.nth(index);
    await tile.scrollIntoViewIfNeeded();
    await expect(tile.locator('svg.vd-chart')).toHaveCount(1, { timeout: 15000 });
    await expect(tile.locator('.idiom-thumb-status')).toHaveCount(0, { timeout: 15000 });
  }

  // Filtering unmounts tiles; returning tiles must draw again, not stay blank.
  const search = page.getByRole('searchbox', { name: 'Filter idioms' });
  await search.fill('stream');
  await expect(tiles).toHaveCount(2);
  await search.fill('');
  await expect(tiles).toHaveCount(count);
  const first = page.locator('[data-idiom-tile="vertical-bars"]');
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator('rect.vd-bar').first()).toBeVisible({ timeout: 15000 });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('gallery viewer shows a live idiom with its code and hands it to the Playground', async ({ page }) => {
  await page.goto(`${site}/gallery.html`);
  await page.locator('[data-idiom-tile="stacked-bars"]').click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByRole('heading', { name: 'Stacked bar chart' })).toBeVisible();
  await expect(viewer.locator('.idiom-viewer-target rect.vd-bar').first()).toBeVisible();
  await expect(viewer.locator('.doc-code-block')).toContainText('.breakdown("age")');
  await expect(page).toHaveURL(/#stacked-bars$/);

  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByRole('heading', { level: 2 })).toHaveText('Stacked bars, many categories');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer.getByRole('heading', { level: 2 })).toHaveText('Stacked bar chart');
  const edit = viewer.getByRole('link', { name: 'Edit in Playground →' });
  await expect(edit).toHaveAttribute('href', './playground.html#bar/idiom=stacked-bars');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  await page.goto(`${site}/playground.html#point/idiom=dumbbell`);
  await expect(page.locator('.playground-status')).toHaveText('Ready');
  await expect(page.locator('.snapshot-frame')).toHaveCount(1);
  await expect(page.locator('.snapshot-frame')).toContainText('Dumbbell chart');
  await expect(page.locator('.playground-chart circle').first()).toBeVisible();
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
