import { test, expect } from '@playwright/test';

test('inspect saved stages, seek and highlight exact element tracks', async ({ page }) => {
  await page.goto('playground/#split');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  const inspector = page.getByLabel('Stage inspector');
  await expect(inspector.locator('.pg-inspector-phase').first()).toBeVisible();
  // The selected stage opens with the inspector.
  await expect(inspector.locator('.pg-inspector-phase[open]').first()).toBeVisible();
  await expect(inspector.getByRole('columnheader', { name: 'Property', exact: true }).first()).toBeVisible();
  await inspector.getByRole('button', { name: 'Show phase midpoint' }).first().click();
  await expect(inspector.locator('.pg-inspector-phase[data-active]')).toHaveCount(1);
  const track = inspector.locator('td button').first();
  await track.click();
  await expect(track).toHaveAttribute('aria-pressed', 'true');
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
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  const inspector = page.getByLabel('Stage inspector');
  await expect(inspector.locator('.pg-inspector-phase')).toHaveCount(1);
  await expect(inspector.locator('summary').first()).toContainText('Stage 1');
  // The selected stage opens with the inspector.
  await expect(inspector.locator('.pg-inspector-phase[open]').first()).toBeVisible();
  const element = inspector.locator('td button').first();
  await expect(element).toHaveAttribute('title', /nth-of-type/);
  expect(await inspector.locator('tbody tr').count()).toBeLessThanOrEqual(50);
  await inspector.getByRole('button', { name: 'Next tracks' }).click();
  await expect(inspector.getByRole('navigation')).toContainText('51–100');
  await inspector.getByRole('button', { name: 'Previous tracks' }).click();
  await inspector.getByRole('button', { name: 'Show phase midpoint' }).first().click();
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


test('selecting a stage seeks to it, aligns with its category lane, and inspects it', async ({ page }) => {
  await page.goto('playground/#focus');
  await expect(page.locator('.pg-key')).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  // The minimal panel has no ruler, zoom, time field or stepper: one stage line.
  await expect(page.locator('.pg-ruler, .pg-time-tools')).toHaveCount(0);
  const readout = page.locator('.pg-row').getByText(/^\d\.\d\ds$/).first();
  await page.locator('.pg-stage-block').nth(1).click();
  await expect(readout).toHaveText('0.90s');
  await expect(page.getByLabel('Selected stage')).toContainText('focus');
  const aligned = await page.locator('.pg-stage-block').nth(1).boundingBox();
  const category = await page.locator('.pg-category-block').filter({ hasText: 'attention.exit(focus)' }).boundingBox();
  expect(aligned!.x).toBeCloseTo(category!.x, 0);
  expect(aligned!.width * 2).toBeCloseTo(category!.width, 0);
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.locator('.pg-inspector-phase[open]').first()).toBeVisible();
  await expect(page.locator('.pg-property-interval').first()).toBeVisible();
  await page.locator('.pg-stage-block').nth(2).click();
  await expect(page.getByLabel('Selected stage')).toContainText('2.2');
  await page.locator('.pg-stage-block').nth(1).dblclick();
  await expect(readout).toHaveText('1.80s', { timeout: 5000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await expect(page.getByLabel('Selected stage')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Swarm uses one complete layout stage with readable configuration', async ({ page }) => {
  await page.goto('playground/#swarm');
  await expect(page.locator('.pg-key')).toHaveCount(2, { timeout: 25000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('.pg-stage-name')).toHaveCount(1);
  await expect(page.locator('.pg-stage-name')).toHaveText('Change layout from grid to beeswarm');
    await expect(page.locator('.cm-content')).toContainText('.layout("beeswarm", { x: "petalLength" })');
  await expect(page.locator('.cm-content')).toContainText('.size(6)');
  await page.locator('.pg-stage-block').click();
  await page.getByText('Exact configuration', { exact: true }).click();
  await expect(page.getByLabel('Selected stage')).toContainText('petalLength');
  await expect(page.getByLabel('Selected stage')).toContainText('"columns":15');
  await page.screenshot({ path: '/tmp/visdelta-unit-layout-bundle.png', fullPage: true });
});
