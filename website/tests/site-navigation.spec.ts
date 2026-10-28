import { expect, test } from '@playwright/test';
for (const width of [320, 360, 390, 768]) test(`all Studio navigation links remain clickable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 860 });
  await page.goto('story/');
  for (const name of ['Liveshow', 'Gallery', 'Story', 'Playground', 'Docs']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name, exact: true }).click({ timeout: 5000 });
    await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}/?$`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
