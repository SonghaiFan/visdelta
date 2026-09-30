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

test('getting started leads with a runnable, reversible first transition', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/getting-started.html');
  await expect(page).toHaveTitle(/Getting started.*VisDelta/);
  const logo = page.locator('.VPNavBarTitle img.logo');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', '/docs/.vitepress/dist/visdelta-logo.svg');
  expect(await logo.evaluate(node => [node.naturalWidth, node.naturalHeight])).toEqual([640, 380]);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/docs/.vitepress/dist/visdelta-logo.svg');
  await expect(page.getByRole('heading', { name: 'See the model first' })).toBeVisible();
  const demo = page.locator('.getting-started-demo');
  await expect(demo.locator('rect.vd-bar')).toHaveCount(3);
  const slider = demo.getByRole('slider', { name: 'First transition progress' });
  const height = async () => Number(await demo.locator('rect.vd-bar').first().getAttribute('height'));
  const start = await height();
  await slider.fill('1');
  expect(await height()).not.toBe(start);
  await demo.getByRole('button', { name: '← Reverse' }).click();
  await expect(demo.locator('output')).toHaveText('0.00', { timeout: 3000 });
  await expect(page.locator('.VPDoc')).toContainText('https://cdn.jsdelivr.net/npm/visdelta@0.3.0/+esm');

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(slider).toBeEnabled();
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

  await page.getByRole('tab', { name: /^Appearance/i }).click();
  await page.locator('[data-scenario="line"]').click();
  await expect(status).toHaveText('Ready');
  await expect(page.locator('.playground-chart path.vd-line')).toHaveCount(1);
});

test('ontology presents seven responsive category icons', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/language-framework.html');
  const catalogue = page.locator('.state-change-catalogue');
  await expect(catalogue.locator('article')).toHaveCount(7);
  await expect(catalogue.locator('svg')).toHaveCount(7);
  await expect(catalogue.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
  await expect(catalogue.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await catalogue.scrollIntoViewIfNeeded();
  const overflow = await catalogue.evaluate(node => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('lab category icons and case rail keep the content position stable', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#x');
  const tabs = page.locator('.playground-category-tabs');
  const cases = page.locator('.playground-example-list');
  const toolbar = page.locator('.playground-toolbar');
  await expect(tabs.locator('.playground-category-icon svg')).toHaveCount(7);

  const readLayout = async () => ({
    caseHeight: await cases.evaluate(node => node.getBoundingClientRect().height),
    toolbarTop: await toolbar.evaluate(node => node.getBoundingClientRect().top + window.scrollY)
  });
  const layouts = [];
  for (const name of ['Data', 'Grain', 'Encoding', 'Coordinate', 'Attention']) {
    await page.getByRole('tab', { name: new RegExp(`^${name}`, 'i') }).click();
    layouts.push(await readLayout());
  }
  expect(new Set(layouts.map(layout => layout.caseHeight)).size).toBe(1);
  expect(new Set(layouts.map(layout => layout.toolbarTop)).size).toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayouts = [];
  for (const name of ['Data', 'Encoding', 'Attention']) {
    await page.getByRole('tab', { name: new RegExp(`^${name}`, 'i') }).click();
    mobileLayouts.push(await readLayout());
  }
  expect(new Set(mobileLayouts.map(layout => layout.caseHeight)).size).toBe(1);
  expect(new Set(mobileLayouts.map(layout => layout.toolbarTop)).size).toBe(1);
});

test('lab controls belong to code and the scenario description follows the chart', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/area-lab.html#y');
  const editor = page.locator('.playground-editor-pane');
  const output = page.locator('.playground-output-pane');
  await expect(editor.locator('.playground-toolbar')).toHaveCount(1);
  await expect(output.locator('.playground-description')).toHaveCount(1);
  const order = await page.evaluate(() => {
    const toolbar = document.querySelector('.playground-toolbar');
    const codeLabel = document.querySelector('.playground-editor-pane .playground-pane-label');
    const chart = document.querySelector('.playground-chart');
    const description = document.querySelector('.playground-description');
    const progress = document.querySelector('.playground-output-pane input[type="range"]');
    const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      toolbarBeforeCode: before(toolbar, codeLabel),
      chartBeforeDescription: before(chart, description),
      descriptionBeforeProgress: before(description, progress)
    };
  });
  expect(order).toEqual({
    toolbarBeforeCode: true,
    chartBeforeDescription: true,
    descriptionBeforeProgress: true
  });
});

test('every editable preset produces real marks', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/language-framework.html#run-a-state-difference');
  await page.locator('.syntax-playground').scrollIntoViewIfNeeded();
  const status = page.locator('.playground-status');
  const cases = [
    ['encoding', 'measure', 'rect.vd-bar'],
    ['data', 'filter', 'rect.vd-bar'],
    ['attention', 'focus', 'rect.vd-bar'],
    ['attention', 'highlight', 'rect.vd-bar'],
    ['grain', 'split', 'rect.vd-bar'],
    ['coordinate', 'flip', 'rect.vd-bar'],
    ['appearance', 'line', 'path.vd-line'],
    ['layout', 'unit', 'circle']
  ];

  await expect(page.locator('.playground-chart rect.vd-bar')).toHaveCount(4);
  for (const [category, sample, mark] of cases) {
    await page.getByRole('tab', { name: new RegExp(`^${category}`, 'i') }).click();
    await page.locator(`[data-scenario="${sample}"]`).click();
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
  await expect(page.getByRole('heading', { name: 'The four-layer constitution' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The seven state-change categories' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vocabulary governance' })).toBeVisible();
  await expect(page.getByText('Emitted actions', { exact: true }).first()).toBeVisible();
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

test('documentation keeps readable lines and chart-style previews fit their charts', async ({ page }) => {
  await page.setViewportSize({ width: 1607, height: 1089 });
  await page.goto('/docs/.vitepress/dist/language-framework.html');
  const contentWidth = await page.locator('.VPDoc .content-container').evaluate(node =>
    node.getBoundingClientRect().width);
  expect(contentWidth).toBeLessThanOrEqual(1040);

  const listMeasure = await page.getByRole('listitem').filter({ hasText: 'Identity and correspondence' })
    .first().evaluate(node => parseFloat(getComputedStyle(node).maxWidth));
  expect(listMeasure).toBeGreaterThan(0);

  await page.goto('/docs/.vitepress/dist/chart-style.html');
  await page.locator('.style-gallery-chart .vd-chart').first().waitFor();
  const dimensions = await page.locator('.style-gallery-chart').first().evaluate(node => {
    const view = node.querySelector('.vd-view');
    const svg = node.querySelector('svg');
    const header = node.querySelector('.vd-figure-header');
    return {
      host: node.getBoundingClientRect().height,
      view: view?.getBoundingClientRect().height ?? 0,
      svg: svg?.getBoundingClientRect().height ?? 0,
      header: header ? getComputedStyle(header).display : null
    };
  });
  expect(dimensions.header).toBe('none');
  expect(Math.abs(dimensions.view - dimensions.svg)).toBeLessThanOrEqual(1);
  expect(dimensions.host - dimensions.svg).toBeLessThanOrEqual(4);
});
