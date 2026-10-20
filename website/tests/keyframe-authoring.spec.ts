import { test, expect } from '@playwright/test';

const source = (title: string) => `const chart = bar(rows).x("state").y("population").key(["state", "age"]).where({ age: "<10" }).where({ field: "state", oneOf: ["CA", "TX"] }).y("population", { label: "${title}" });`;

for (const width of [1280, 390]) test(`Saving a draft updates, inserts and refreshes saved snapshots at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 860 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#split');
  const keys = page.locator('.pg-key');
  const snapshots = page.locator('.pg-snapshot-card');
  await expect(keys).toHaveCount(3, { timeout: 25000 });
  await page.getByRole('switch', { name: 'Auto-run' }).uncheck({ force: true });
  const edit = async (title: string, runBeforeSave = false) => {
    await page.getByLabel('Chart code').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(source(title));
    if (runBeforeSave) {
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByLabel('Chart', { exact: true }).locator('.pg-layer[data-state=shown] .vd-y-label')).toContainText(title);
    }
    await expect(page.locator('.pg-snapshot-card[data-draft]')).toHaveCount(1);
    await page.getByLabel('Chart code').click();
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.locator('.pg-snapshot-card[data-draft]')).toHaveCount(0);
  };
  await keys.first().click();
  await expect(page.getByLabel('Playhead time in seconds')).toHaveValue('0.00');
  await edit('Updated first');
  await expect(keys).toHaveCount(3);
  await expect(snapshots.first().locator('img')).toHaveAttribute('src', /Updated%20first/);
  const lastId = await snapshots.last().getAttribute('data-frame-id');
  const time = page.getByLabel('Playhead time in seconds');
  await time.fill('0.45');
  await time.press('Enter');
  await expect(time).toHaveValue('0.45');
  await edit('Inserted between', true);
  await expect(keys).toHaveCount(4);
  await expect(snapshots.nth(1).locator('img')).toHaveAttribute('src', /Inserted%20between/);
  await expect(snapshots.last()).toHaveAttribute('data-frame-id', lastId!);
  const insertedId = await snapshots.nth(1).getAttribute('data-frame-id');
  await edit('Revised insertion');
  await expect(keys).toHaveCount(4);
  await expect(snapshots.nth(1)).toHaveAttribute('data-frame-id', insertedId!);
  await expect(snapshots.nth(1).locator('img')).toHaveAttribute('src', /Revised%20insertion/);
  await keys.last().click();
  await edit('Updated last');
  await expect(keys).toHaveCount(4);
  await expect(snapshots.last().locator('img')).toHaveAttribute('src', /Updated%20last/);
  await expect(page.getByRole('button', { name: 'Play keyframes', exact: true })).toBeVisible();
  await keys.first().click();
  await snapshots.last().click();
  const endTime = Number(await keys.last().getAttribute('data-time')).toFixed(2);
  await expect(page.getByLabel('Playhead time in seconds')).toHaveValue(endTime);
  await expect(page.getByLabel('Chart', { exact: true }).locator('.pg-layer[data-state=shown]')).toContainText('Updated last');
});

test('timeline endpoints seek and pause, while saved snapshots play the route', async ({ page }) => {
  await page.goto('playground/#split');
  const keys = page.locator('.pg-key');
  await expect(keys).toHaveCount(3, { timeout: 25000 });
  await keys.first().click();
  await expect(page.getByLabel('Playhead time in seconds')).toHaveValue('0.00');
  await expect(page.getByRole('button', { name: 'Play keyframes', exact: true })).toBeVisible();
  await page.locator('.pg-snapshot-card').last().click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await keys.nth(1).click();
  await expect(page.getByLabel('Playhead time in seconds')).toHaveValue('1.80');
  await expect(page.getByRole('button', { name: 'Play keyframes', exact: true })).toBeVisible();
});
