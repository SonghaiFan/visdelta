import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('agent endpoints index and render the canonical documentation source', async ({ request }) => {
  const index=await request.get('llms.txt');
  expect(index.ok()).toBe(true);
  expect(await index.text()).toContain('Start here for agents');
  const full=await request.get('llms-full.txt');
  const text=await full.text();
  expect(full.ok()).toBe(true);
  const source=await readFile(new URL('../content/docs/guides/agent-workflow.mdx',import.meta.url),'utf8');
  const html=source.match(/```html\n([\s\S]*?)```/)![1];
  expect(text).toContain(html.trim());
  expect(text.match(/# Start here for agents/g)).toHaveLength(1);
  expect(text).toContain('Tick spacing is part of the chart style');
});

test('the exported website uses the canonical source with local runtime assets', async ({ request }) => {
  const response = await request.get('story/examples/network/index.html');
  expect(response.ok()).toBe(true);
  const source=await readFile(new URL('../../examples/story/network/index.html',import.meta.url),'utf8');
  expect(await response.text()).toBe(source.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/visdelta@[^/]+\/dist\/visdelta\.css/g,'./visdelta.css').replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/visdelta@[^/]+\/\+esm/g,'./visdelta.js'));
  expect((await request.get('story/examples/network/visdelta.js')).ok()).toBe(true);
});

for (const width of [1280, 390]) {
  test(`${width}px: agent pages fit and link to the template under the production base path`, async ({ page, request, baseURL }) => {
    const resourceErrors: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseURL!).origin) resourceErrors.push(response.url());
    });
    await page.setViewportSize({ width, height: 840 });
    for (const slug of ['agent-workflow', 'automatic-behaviors', 'story', 'scroll-template']) {
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
    const template = page.locator('a[href$="/story/examples/network/index.html"]').first();
    await expect(template).toBeVisible();
    const base = new URL(page.url()).pathname.split('/docs/')[0];
    await expect(template).toHaveAttribute('href', `${base}/story/examples/network/index.html`);
    await template.click();
    await expect(page).toHaveURL(/\/story\/examples\/network\/index\.html$/);
    await expect(page.getByRole('heading', { name: 'One route becomes a network' })).toBeVisible();
    expect(resourceErrors).toEqual([]);
  });
}
