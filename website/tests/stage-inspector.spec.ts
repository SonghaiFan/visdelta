import { test, expect } from '@playwright/test';

test('inspect saved stages, seek and highlight exact element tracks', async ({ page }) => {
  await page.goto('playground/#split');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  const inspector = page.getByLabel('Stage inspector');
  const phase = inspector.locator('.pg-inspector-phase').first();
  await expect(phase).toBeVisible();
  if (await phase.getAttribute('open') === null) await phase.locator('summary').click();
  const groups = phase.getByRole('tablist', { name: /Element groups/ });
  expect(await groups.getByRole('tab').count()).toBeGreaterThan(1);
  const axes = groups.getByRole('tab', { name: /Axes/ });
  await axes.click();
  await expect(phase.locator('h4')).toContainText('Axes');
  await groups.getByRole('tab', { name: /Marks/ }).click();
  const rows = phase.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  // Moving tracks are listed before tracks whose endpoints match.
  const still = await rows.evaluateAll(nodes => nodes.map(node => node.hasAttribute('data-still')));
  expect(still.indexOf(false)).toBeLessThanOrEqual(still.indexOf(true) < 0 ? still.length : still.indexOf(true));
  expect(still.slice(still.indexOf(true) < 0 ? still.length : still.indexOf(true)).every(Boolean)).toBe(true);
  const track = rows.first().locator('button');
  await track.click();
  await expect(track).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pg-element-highlight')).toHaveCount(1);
  await inspector.getByLabel('Filter element tracks').fill('opacity');
  await expect(inspector.locator('tbody tr').first()).toContainText('opacity');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(inspector).toBeVisible();
  await expect(page.getByLabel('Keyframe timeline')).toBeVisible();
  await page.getByRole('button', { name: 'Hide inspector', exact: true }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('.pg-element-highlight')).toHaveCount(0);
});

test('multi-stage inspection exposes stage numbers and exact element paths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('playground/#swarm');
  await expect.poll(() => page.locator('.pg-key').count(), { timeout: 25000 }).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.locator('.pg-stage-block').first().click();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  const inspector = page.getByLabel('Stage inspector');
  const phases = inspector.locator('.pg-inspector-phase');
  await expect(phases).toHaveCount(2);
  await expect(phases.first().locator('summary')).toContainText('Stage 1');
  if (await phases.first().getAttribute('open') === null) await phases.first().locator('summary').click();
  const element = inspector.locator('tbody tr button').first();
  await expect(element).toHaveAttribute('title', /nth-of-type/);
  await expect(phases.first().getByRole('tablist', { name: /Element groups/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/visdelta-stage-inspector-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear keys', exact: true }).click();
  await expect(inspector).toHaveCount(0);
});

test('the timeline itself labels intermediate stages and selects them with the keyboard', async ({ page }) => {
  await page.goto('playground/#focus');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const exit = page.locator('.pg-stage-block').nth(1);
  const enter = page.locator('.pg-stage-block').nth(2);
  await expect(exit).toHaveCount(1);
  await expect(enter).toHaveCount(1);
  await expect(exit).toBeVisible();
  await expect(enter).toBeVisible();
  const exitBox = await exit.boundingBox();
  const enterBox = await enter.boundingBox();
  expect(exitBox!.x + exitBox!.width).toBeCloseTo(enterBox!.x, 0);
  await enter.focus();
  await page.keyboard.press('Enter');
  await expect(enter).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(enter).toHaveAttribute('data-active', 'true');
  await expect(page.locator('.pg-key')).toHaveCount(3);
  await page.screenshot({ path: '/tmp/visdelta-labelled-stages.png', fullPage: true });
});

test('regroup shows all six intermediate stage captions without opening the inspector', async ({ page }) => {
  await page.goto('playground/#regroup');
  await expect(page.locator('.pg-key')).toHaveCount(2, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('.pg-stage-block')).toHaveCount(6);
  await expect(page.getByLabel('Stage inspector')).toHaveCount(0);
  const labels = await page.locator('.pg-stage-name').allTextContents();
  expect(labels.map(label => label.replace(/^Chart stage: /, ''))).toEqual([
    'grain.split · coordinate.reorient · layout.rearrange',
    'layout.rearrange',
    'encoding.remap(x) · layout.rearrange',
    'layout.rearrange',
    'grain.merge · coordinate.reorient · layout.rearrange',
    'Rename the horizontal axis to “Location”',
  ]);
  await page.screenshot({ path: '/tmp/visdelta-regroup-stages.png', fullPage: true });
});


test('timeline selection is passive, zoom and scrolling align rows, and boundaries seek exactly', async ({ page }) => {
  await page.goto('playground/#focus');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Chart code')).toContainText('.highlight({ cyl: 4 })');
  const time = page.getByLabel('Playhead time in seconds');
  await expect(time).toHaveValue('2.70');
  const before = await time.inputValue();
  await page.locator('.pg-stage-block').nth(1).click();
  await expect(time).toHaveValue(before);
  await expect(page.getByLabel('Selected stage')).toContainText('focus');
  const tracks = page.getByRole('region', { name: 'Timeline tracks', exact: true });
  await tracks.focus();
  await tracks.press('+');
  await tracks.press('+');
  await expect(time).toHaveValue(before);
  const aligned = await page.locator('.pg-stage-block').nth(1).boundingBox();
  const category = await page.locator('.pg-category-block').filter({ hasText: 'attention.exit(focus)' }).boundingBox();
  expect(aligned!.x).toBeCloseTo(category!.x, 0);
  expect(aligned!.width * 2).toBeCloseTo(category!.width, 0);
  await page.getByRole('region', { name: 'Timeline tracks', exact: true }).evaluate(node => { node.scrollLeft = 0; });
  await expect(time).toHaveValue(before);
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(time).toHaveValue('0.90');
  await tracks.focus();
  await tracks.press('Shift+ArrowRight');
  await expect(time).toHaveValue('1.80');
  await tracks.press('Shift+ArrowLeft');
  await expect(time).toHaveValue('0.90');
  await time.fill('1.35');
  await time.press('Enter');
  await expect(time).toHaveValue('1.35');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.locator('.pg-inspector-phase[open] table').first()).toBeVisible();
  await expect(page.locator('.pg-property-interval').first()).toBeVisible();
  await tracks.focus();
  await tracks.press('-');
  await tracks.press('-');
  await expect(page.getByLabel('Pan timeline')).toHaveCount(0);
  const ruler = await page.locator('.pg-ruler').boundingBox();
  await page.mouse.click(ruler!.x + 7 + 160 * 0.9 + 2, ruler!.y + 5);
  await expect(time).toHaveValue('0.90');
  await page.locator('.pg-stage-block').nth(1).dblclick();
  await expect(time).toHaveValue('1.80', { timeout: 5000 });
  await page.screenshot({ path: '/tmp/visdelta-timeline-navigation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await expect(page.getByLabel('Selected stage')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/visdelta-timeline-navigation-mobile.png', fullPage: true });
});


test('Swarm moves from grouped counts to measured unit layouts with readable configuration', async ({ page }) => {
  await page.goto('playground/#swarm');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('.pg-stage-name')).toHaveCount(4);
  await expect(page.locator('.pg-stage-name').filter({ hasText: 'beeswarm' })).toHaveCount(1);
  await expect(page.getByLabel('Chart code')).toContainText('Expand the grouped counts back to individuals');
  await expect(page.locator('.cm-content')).toContainText('.x("petalLength").layout("beeswarm")');
  await expect(page.locator('.cm-content')).toContainText('.size(6)');
  await page.locator('.pg-stage-block').nth(2).click();
  await page.getByText('Exact configuration', { exact: true }).click();
  await expect(page.getByLabel('Selected stage')).toContainText('petalLength');
  await expect(page.getByLabel('Selected stage')).toContainText('beeswarm');
  await page.screenshot({ path: '/tmp/visdelta-unit-layout-bundle.png', fullPage: true });
});
