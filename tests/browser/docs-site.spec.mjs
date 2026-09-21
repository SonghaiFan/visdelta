import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/reference.html');
  await expect(page.locator('.workbench-kicker')).toContainText('Ready');
});

test('VitePress reference loads the real seekable transition', async ({ page }) => {
  await expect(page).toHaveTitle(/API reference.*VisDelta/);
  await expect(page.locator('#VPSidebarNav').getByRole('link', { name: 'Chart types', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Search/ })).toBeVisible();
  const workbench = page.locator('.transition-workbench');
  await expect(workbench.locator('rect.vd-bar')).toHaveCount(4);

  const range = page.getByRole('slider', { name: 'Transition progress', exact: true });
  const firstHeight = async () => Number(await workbench.locator('rect.vd-bar').first().getAttribute('height'));
  const start = await firstHeight();
  await range.fill('1');
  await expect(page.locator('.workbench-readout output')).toHaveText('1.00');
  expect(await firstHeight()).not.toBe(start);

  await page.getByRole('tab', { name: 'Delta' }).click();
  await expect(page.locator('.workbench-inspector')).toContainText('encoding.y');
  await expect(page.locator('.workbench-inspector')).toContainText('semantic');
});

test('application state controls drive the same transition progress', async ({ page }) => {
  await page.getByRole('button', { name: 'Next state' }).click();
  await expect(page.locator('.workbench-readout output')).toHaveText('0.50');
  await expect(page.locator('.workbench-seq-head output')).toHaveText('2 / 3');
  await expect(page.locator('.workbench-seq p')).toContainText('halfway');

  await page.getByRole('button', { name: 'Next state' }).click();
  await expect(page.locator('.workbench-readout output')).toHaveText('1.00');
  await expect(page.locator('.workbench-seq-head output')).toHaveText('3 / 3');
});

test('ontology playground recompiles live, reports errors, and switches state differences', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/language-framework.html#run-a-state-difference');
  await page.locator('.syntax-playground').scrollIntoViewIfNeeded();
  await expect(page.locator('.ontology-inspector')).toHaveCount(0);
  await expect(page.getByText('Live semantic inspection', { exact: true })).toHaveCount(0);
  const editor = page.getByRole('textbox', { name: 'Editable VisDelta code' });
  const status = page.locator('.playground-status');
  await expect(status).toHaveText('Ready');
  await expect(editor).toContainText('.y("sales"');

  await editor.fill(`const all = bar(rows)
  .x("category")
  .y("sales")
  .key("category");
const north = all.where({ region: "North" });
return { from: all, to: north };`);
  await expect(status).toHaveText('Waiting for input');
  await expect(status).toHaveText('Ready');
  await page.getByRole('slider', { name: 'Playground transition progress' }).fill('1');
  await expect(page.locator('.playground-chart rect.vd-bar')).toHaveCount(2);

  await editor.fill('const broken = ;');
  await expect(status).toHaveText('Waiting for input');
  await expect(status).toHaveText('Error');
  await expect(page.getByRole('alert')).toContainText('Unexpected token');

  await page.getByRole('combobox', { name: 'Syntax example' }).selectOption('line');
  await expect(status).toHaveText('Waiting for input');
  await expect(status).toHaveText('Ready');
  await expect(page.locator('.playground-chart path.vd-line')).toHaveCount(1);
});

test('every editable preset produces real marks', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/language-framework.html#run-a-state-difference');
  await page.locator('.syntax-playground').scrollIntoViewIfNeeded();
  const picker = page.getByRole('combobox', { name: 'Syntax example' });
  const status = page.locator('.playground-status');
  const cases = [
    ['measure', 'rect.vd-bar'],
    ['filter', 'rect.vd-bar'],
    ['focus', 'rect.vd-bar'],
    ['highlight', 'rect.vd-bar'],
    ['split', 'rect.vd-bar'],
    ['flip', 'rect.vd-bar'],
    ['line', 'path.vd-line'],
    ['unit', 'circle']
  ];

  await expect(page.locator('.playground-chart rect.vd-bar')).toHaveCount(4);
  for (const [sample, mark] of cases) {
    await picker.selectOption(sample);
    await expect(status).toHaveText('Waiting for input');
    await expect(status).toHaveText('Ready');
    expect(await page.locator(`.playground-chart ${mark}`).count()).toBeGreaterThan(0);
  }
});

test('reference stays usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.transition-workbench')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('slider', { name: 'Transition progress', exact: true })).toBeEnabled();
});

test('ontology documents the implemented state model and core boundary', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/language-framework.html');
  await expect(page).toHaveTitle(/Ontology and transition contracts.*VisDelta/);
  await expect(page.getByRole('heading', { name: 'Four layers, kept separate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rules that guide implementation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Every frame is true/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Core knows no chart types/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run a state difference' })).toBeVisible();
  await expect(page.locator('.syntax-playground')).toHaveCount(1);
});

test('legacy examples page routes readers to the ontology playground', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/examples.html');
  await expect(page.locator('.syntax-playground')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ontology and transition contracts' }))
    .toHaveAttribute('href', '/docs/.vitepress/dist/language-framework.html#run-a-state-difference');
});
