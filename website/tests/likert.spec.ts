import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`Likert playground preserves neutral and clears axes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('playground/#likert-diverging');
    await expect(page.locator('.pg-key')).toHaveCount(3);
    const chart = page.getByLabel('Chart', { exact: true });
    const figure = chart.locator('.pg-layer[data-state="shown"] figure').first();
    await expect(figure.locator('.vd-bar')).toHaveCount(15);
    const timeline = page.getByLabel('Keyframe timeline');
    for (const time of [0, 0.9, 1.8, 0.9, 0]) {
      await timeline.fill(String(time));
      await expect.poll(() => figure.locator('.vd-axis-ghost').count()).toBe(0);
      await expect(figure.locator('.vd-bar')).toHaveCount(15);
      const state = await figure.evaluate(node => {
        const marks = [...node.querySelectorAll<SVGRectElement>('.vd-bar')];
        return {
          zero: node.querySelectorAll('.vd-bar-zero').length,
          rows: marks.map(mark => {
            const row = (mark as SVGRectElement & { __data__: Record<string, unknown> }).__data__;
            return { question: row.question, response: row.response, total: row.__distributionTotal,
              share: Number(row.__stack1) - Number(row.__stack0),
              mid: (Number(row.__stack1) + Number(row.__stack0)) / 2 };
          }),
        };
      });
      expect(state.zero).toBe(time === 0 ? 0 : 1);
      for (const total of [100, 200, 80]) {
        const rows = state.rows.filter(row => row.total === total);
        expect(rows).toHaveLength(5);
        expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 10);
        if (time > 0) expect(rows.find(row => row.response === 'Neutral')!.mid).toBeCloseTo(0, 10);
      }
    }
    await timeline.fill('0.9');
    await page.screenshot({ path: `/tmp/visdelta-likert-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test('Bar guide includes the runnable paired example and neutral interpretation', async ({ page }) => {
  await page.goto('docs/charts/bar');
  await expect(page.getByRole('heading', { name: 'Likert responses: 100% stacked or centered divergence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Read the center correctly' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read the critique' })).toHaveAttribute('href', 'https://www.datawrapper.de/blog/divergingbars');
});
