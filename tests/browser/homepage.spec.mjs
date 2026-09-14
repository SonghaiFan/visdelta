import { test, expect } from '@playwright/test';

for (const width of [1100, 390]) {
  test(`canonical documentation homepage works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/docs\/\.vitepress\/dist\/$/);
    await expect(page).toHaveTitle(/VisDelta/);
    await expect(page.getByRole('heading', { name: 'Make data changes feel obvious.' })).toBeVisible();

    const hero = page.locator('.hero-transition');
    await expect(hero).toBeVisible();
    await expect(hero).toContainText('Live chart');
    await expect(hero.locator('rect.vd-bar').first()).toBeVisible();

    const studio = page.locator('.home-studio');
    await studio.scrollIntoViewIfNeeded();
    const inputTable = studio.getByRole('table');
    await expect(inputTable).toBeVisible();
    await expect(inputTable.getByRole('columnheader')).toHaveCount(2);
    await expect(inputTable.getByRole('row')).toHaveCount(3);
    await expect(inputTable.getByRole('row').nth(1)).toContainText(/2004.*22/i);
    await expect(studio.locator('.home-studio-data strong')).toContainText('2 rows after 1 transform');
    const initialTableHeight = await studio.locator('.home-studio-table-wrap').evaluate(
      node => node.getBoundingClientRect().height
    );
    await expect(studio.getByRole('textbox', { name: 'Editable VisDelta chart code' })).toBeVisible();
    await expect(studio.locator('.home-studio-status')).toContainText('Ready');
    await expect(studio.locator('rect.vd-bar').first()).toBeVisible();
    const syntaxColors = await studio.locator('.cm-content span').evaluateAll(nodes =>
      [...new Set(nodes.map(node => getComputedStyle(node).color))]
    );
    expect(syntaxColors.length).toBeGreaterThan(1);

    const paneOrder = await studio.evaluate(node => {
      const visualization = node.querySelector('.home-studio-output-pane').getBoundingClientRect();
      const code = node.querySelector('.home-studio-editor-pane').getBoundingClientRect();
      return { visualization, code };
    });
    if (width > 900) expect(paneOrder.visualization.x).toBeLessThan(paneOrder.code.x);
    else expect(paneOrder.visualization.y).toBeLessThan(paneOrder.code.y);

    const before = Number(await studio.getAttribute('data-transition-count'));
    await studio.getByRole('button', { name: 'Line' }).click();
    await expect(studio.locator('.home-studio-status')).toHaveText('Ready');
    await expect(studio).toHaveAttribute('data-transition-count', String(before));
    const editor = studio.getByRole('textbox', { name: 'Editable VisDelta chart code' });
    await expect(editor).toContainText('const chart = line(rows)');
    await expect(studio.locator('path.vd-line')).toHaveCount(3);
    await expect(studio.getByRole('button', { name: 'Line' })).toHaveAttribute('aria-pressed', 'true');
    await expect(inputTable.getByRole('columnheader')).toHaveCount(3);
    await expect(inputTable.getByRole('row')).toHaveCount(7);
    await expect(inputTable.getByRole('row').nth(1)).toContainText(/2004.*Norway.*5/i);
    await expect(studio.locator('.home-studio-data strong')).toContainText('6 source rows');
    const sourceTableHeight = await studio.locator('.home-studio-table-wrap').evaluate(
      node => node.getBoundingClientRect().height
    );
    expect(sourceTableHeight).toBeCloseTo(initialTableHeight, 5);

    await studio.getByRole('button', { name: 'Point' }).click();
    await expect(studio.locator('.home-studio-status')).toHaveText('Ready');
    await expect(studio.locator('circle.vd-point')).toHaveCount(6);
    await expect(editor).toContainText('const chart = point(rows)');

    await studio.getByRole('button', { name: 'Area' }).click();
    await expect(studio.locator('.home-studio-status')).toHaveText('Ready');
    await expect(studio.locator('path.vd-area')).toHaveCount(6);

    await studio.getByRole('button', { name: 'Unit' }).click();
    await expect(studio.locator('.home-studio-status')).toHaveText('Ready');
    await expect(studio.locator('circle.vd-unit')).toHaveCount(55);

    await studio.getByRole('button', { name: 'Bar' }).click();
    await expect(studio.locator('rect.vd-bar').first()).toBeVisible();

    const beforeEnter = Number(await studio.getAttribute('data-transition-count'));
    await editor.press('Enter');
    await editor.type('chart = detail.layout("grouped");');
    await editor.press('Enter');
    await expect(studio).toHaveAttribute('data-transition-count', String(beforeEnter + 1));
    await expect(studio.locator('.home-studio-status')).toHaveText('Ready');

    const beforeError = await studio.getAttribute('data-transition-count');
    await editor.fill(`const detail = bar(rows)
  .datumKey(["year", "country"])
  .x("year")
  .y("sites")
  .key(["year", "country"]);

let chart = detail;`);
    await editor.press('Enter');
    await expect(studio.locator('.home-studio-status')).toHaveText('Fix the current line');
    await expect(studio.getByRole('alert')).toContainText('needs one value per year');
    await expect(studio).toHaveAttribute('data-transition-count', beforeError);
    await expect(studio.getByText('Cannot render current state')).toBeVisible();
    await expect(studio.locator('.home-studio-chart')).toHaveAttribute('aria-hidden', 'true');
    await expect(studio.locator('rect.vd-bar').first()).toBeHidden();

    await studio.getByRole('button', { name: 'Reset' }).click();
    await expect(studio.locator('.home-studio-status')).toHaveText('Ready');
    await expect(studio.getByText('Cannot render current state')).toHaveCount(0);
    await expect(studio.locator('.home-studio-chart')).toHaveAttribute('aria-hidden', 'false');
    await expect(studio.locator('rect.vd-bar').first()).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
