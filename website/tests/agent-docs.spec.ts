import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const guide = () => readFile(new URL('../../llms.txt', import.meta.url), 'utf8');

test('both agent endpoints start with the tested repository quick start', async ({ request }) => {
  const source = await guide();
  for (const path of ['llms.txt', 'llms-full.txt']) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text.startsWith(source)).toBe(true);
    expect(text).toContain('Automatic behaviors');
    expect(text).toContain('Copy a scroll story');
    if (path === 'llms-full.txt') expect(text).toContain('Tick spacing is part of the chart style');
  }
});

test('the exported scroll template is the canonical single file, without rewrites', async ({ request }) => {
  const response = await request.get('templates/scroll-story.html');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe(await readFile(new URL('../../examples/templates/scroll-story.html', import.meta.url), 'utf8'));
});

for (const width of [1280, 390]) {
  test(`${width}px: agent pages fit and link to the template under the production base path`, async ({ page, request, baseURL }) => {
    const resourceErrors: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseURL!).origin) resourceErrors.push(response.url());
    });
    await page.setViewportSize({ width, height: 840 });
    for (const slug of ['agent-workflow', 'automatic-behaviors', 'mdx', 'scroll-template']) {
      await page.goto(`docs/guides/${slug}/`);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const origin = new URL(page.url()).origin;
      const links = await page.locator('main a[href]').evaluateAll(nodes => nodes.map(n => (n as HTMLAnchorElement).href));
      for (const href of new Set(links)) {
        const url = new URL(href);
        if (url.origin !== origin) continue;
        expect((await request.get(`${url.pathname}${url.search}`)).ok(), href).toBe(true);
      }
    }
    const template = page.locator('a[href$="/templates/scroll-story.html"]').first();
    await expect(template).toBeVisible();
    const base = new URL(page.url()).pathname.split('/docs/')[0];
    await expect(template).toHaveAttribute('href', `${base}/templates/scroll-story.html`);
    await template.click();
    await expect(page).toHaveURL(/\/templates\/scroll-story\.html$/);
    await expect(page.getByRole('heading', { name: 'One route becomes a network' })).toBeVisible();
    expect(resourceErrors).toEqual([]);
  });
}
