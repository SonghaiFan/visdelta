import { expect, test } from '@playwright/test';
for (const width of [1280, 390]) test(`Story entry forwards old links and exports recoverable drafts at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 860 });
  const draft = { version: 1, story: '# My saved story', code: 'const chart = bar(rows).x("x").y("y");', rows: '[{"x":"A","y":1}]' };
  await page.addInitScript(value => {
    localStorage.setItem('visdelta-story-draft-v1', JSON.stringify(value));
    localStorage.setItem('visdelta.story.example-drafts.v1', JSON.stringify({ weather: value }));
  }, draft);
  await page.goto('story/?example=weather#weather-extremes');
  await expect(page.getByRole('heading', { name: 'VisDelta Story', exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: 'Open Story Studio' });
  await expect(link).toHaveAttribute('href', /\/story\/\?example=weather#weather-extremes$/);
  await expect(page.locator('.story-editor')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read Story documentation' })).toHaveAttribute('href', 'https://songhaifan.github.io/visdelta-story/docs/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download current draft' }).click()]);
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(draft);
  await expect(page.getByRole('button', { name: 'Download weather draft' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('visdelta-story-draft-v1')!).story)).toBe(draft.story);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('official authoring documentation describes the independent application', async ({ page }) => {
  await page.goto('docs/guides/mdx/');
  await expect(page.getByRole('heading', { name: /^VisDelta Story/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open its entry page' })).toHaveAttribute('href', /\/story\/?$/);
});
