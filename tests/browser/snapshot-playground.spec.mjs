import { test, expect } from '@playwright/test';
import { editorCode, setEditorCode } from './code-editor.mjs';

const open = async page => {
  await page.goto('/docs/.vitepress/dist/playground.html#bar/measure');
  await expect(page.locator('.playground-status')).toHaveText('Ready');
};

test('snapshots restore code, rows and marks; edits and deletion preserve history', async ({ page }) => {
  await open(page);
  const editor = page.getByRole('textbox', { name: 'Editable VisDelta code', exact: true });
  const frame = page.locator('.snapshot-frame');
  await expect(frame).toHaveCount(2);
  const startCode = await editorCode(editor);
  const startRows = await page.locator('.data-code-chart-table').innerText();
  await page.getByRole('button', { name: 'Select End snapshot', exact: true }).click();
  await expect.poll(() => editorCode(editor)).not.toBe(startCode);
  const endCode = await editorCode(editor);
  await page.getByRole('button', { name: 'Select Start snapshot', exact: true }).click();
  await expect.poll(() => editorCode(editor)).toBe(startCode);
  await expect(page.locator('.data-code-chart-table')).toHaveText(startRows, { useInnerText: true });
  await setEditorCode(editor, 'const chart = bar([{ name: "A", value: 7 }, { name: "B", value: 12 }]).x("name").y("value").color("#ff0000");');
  await expect(frame).toHaveCount(3);
  await expect(page.locator('.playground-chart rect.vd-bar')).toHaveCount(2);
  await expect(page.locator('.data-code-chart-table')).toContainText('12');
  await page.getByRole('button', { name: 'Select End snapshot', exact: true }).click();
  await expect.poll(() => editorCode(editor)).toBe(endCode);
  await frame.nth(1).locator('.snapshot-select').click();
  await expect(page.locator('.data-code-chart-table')).toContainText('12');
  await frame.nth(1).locator('.snapshot-delete').click();
  await expect(frame).toHaveCount(2);
  await expect.poll(() => editorCode(editor)).toBe(startCode);
  await expect(page.locator('.data-code-chart-table')).toHaveText(startRows, { useInnerText: true });
  await setEditorCode(editor, 'const chart = ;');
  await expect(page.getByRole('alert')).toContainText('Unexpected token');
  await expect(frame).toHaveCount(2);
  await page.getByRole('button', { name: 'Select End snapshot', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await frame.first().locator('.snapshot-delete').click();
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('.snapshot-delete')).toBeDisabled();
});

test('all chart types render snapshots and fit desktop and narrow screens', async ({ page }) => {
  await open(page);
  for (const name of ['Bar', 'Line', 'Area', 'Point', 'Unit']) {
    await page.locator('.chart-playground-tabs').getByRole('tab', { name, exact: true }).click();
    await expect(page.locator('.playground-status')).toHaveText('Ready');
    await expect(page.locator('.snapshot-frame img')).toHaveCount(2);
    await expect.poll(() => page.locator('.snapshot-frame img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    await page.getByRole('button', { name: 'Play next →' }).click();
    await expect(page.locator('.snapshot-frame.is-active')).toContainText('End');
    await expect.poll(() => page.getByRole('slider', { name: 'Playground transition progress' }).inputValue(), { timeout: 20000 }).toBe('1');
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.locator('.chart-playground').screenshot({ path: `/tmp/visdelta-floating-${width}.png`, style: '.VPNav, .VPLocalNav { visibility: hidden !important; }' });
    if (width === 1440) {
      const editor = await page.locator('.snapshot-code').boundingBox();
      const chart = await page.locator('.snapshot-chart').boundingBox();
      expect(chart.x).toBeGreaterThan(editor.x);
      expect(chart.x).toBeLessThan(editor.x + editor.width);
      expect(chart.y).toBeGreaterThan(editor.y);
      const editable = await page.locator('.snapshot-code .playground-code-cell').boundingBox();
      expect(editable.x + editable.width).toBeLessThanOrEqual(chart.x);
      expect(await page.locator('.snapshot-code').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(48, 48, 57)');
      await expect(page.locator('.VPSidebar')).toHaveCount(0);
    }
    if (width === 390) {
      const boxes = await Promise.all(['data', 'code', 'chart'].map(part => page.locator(`.data-code-chart-${part}`).boundingBox()));
      expect(boxes[0].y).toBeLessThan(boxes[1].y);
      expect(boxes[1].y).toBeLessThan(boxes[2].y);
    }
  }
});


test('demo and uploaded datasets create restorable snapshots, malformed files preserve the current frame', async ({ page }) => {
  await open(page);
  const editor = page.getByRole('textbox', { name: 'Editable VisDelta code', exact: true });
  const original = await editorCode(editor);
  await page.getByRole('button', { name: 'Load data' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByLabel('Demo dataset').selectOption('mtcars');
  await expect(dialog).toContainText('32 records');
  await page.getByRole('button', { name: 'Use dataset' }).click();
  await expect(page.locator('.snapshot-frame')).toHaveCount(3);
  await expect(page.locator('.snapshot-data-tools')).toContainText('Motor cars');
  await expect(page.locator('.data-code-chart-table')).toContainText('Mazda RX4');
  await page.getByRole('button', { name: 'Load data' }).click();
  await page.getByLabel('Upload dataset').setInputFiles({ name: 'my-data.csv', mimeType: 'text/csv', buffer: Buffer.from('team,revenue\nNorth,12\nSouth,27') });
  await expect(dialog).toContainText('my-data.csv');
  await expect(page.getByRole('button', { name: 'Use dataset' })).toBeDisabled();
  await page.getByLabel('X field', { exact: true }).selectOption('team');
  await page.getByLabel('Y field', { exact: true }).selectOption('revenue');
  await page.getByRole('button', { name: 'Use dataset' }).click();
  await expect(page.locator('.snapshot-frame')).toHaveCount(4);
  await expect(page.locator('.playground-chart rect.vd-bar')).toHaveCount(2);
  await expect(page.locator('.snapshot-data-tools')).toContainText('my-data.csv');
  await expect(page.locator('.data-code-chart-table')).toContainText('South');
  const uploaded = await editorCode(editor);
  await page.getByRole('button', { name: 'Select Start snapshot', exact: true }).click();
  await expect.poll(() => editorCode(editor)).toBe(original);
  await page.getByRole('button', { name: 'Select my-data.csv snapshot', exact: true }).click();
  await expect.poll(() => editorCode(editor)).toBe(uploaded);
  await expect(page.locator('.data-code-chart-table')).toContainText('27');
  await page.getByRole('button', { name: 'Load data' }).click();
  await page.getByLabel('Upload dataset').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use dataset' })).toBeDisabled();
  await page.getByLabel('Upload dataset').setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from('[{"team":"East","revenue":41}]') });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('X field', { exact: true }).selectOption('team');
  await page.getByLabel('Y field', { exact: true }).selectOption('revenue');
  await page.getByRole('button', { name: 'Use dataset' }).click();
  await expect(page.locator('.snapshot-frame')).toHaveCount(5);
  await expect(page.locator('.playground-chart rect.vd-bar')).toHaveCount(1);
  await expect(page.locator('.data-code-chart-table')).toContainText('East');
});
