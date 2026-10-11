import { expect, test, type Page } from '@playwright/test';

/** Collect uncaught errors and console errors for the lifetime of a page. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** Signature of every mark rect, so frames can be compared. */
async function barGeometry(page: Page, figure = page.locator('figure').first()) {
  return figure.locator('.vd-docs-chart svg rect').evaluateAll((rects) =>
    rects.map((rect) => `${rect.getAttribute('x')},${rect.getAttribute('y')},${rect.getAttribute('width')},${rect.getAttribute('height')}`).join(' '),
  );
}

async function progressOf(figure: ReturnType<Page['locator']>) {
  return Number(await figure.locator('output').textContent());
}

test.describe('live examples', () => {
  test('quick start example scrubs, plays, reverses and reports its state change', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('docs/quick-start/');
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('.vd-docs-chart svg')).toBeVisible();
    await expect(figure.getByText('encoding')).toBeVisible();
    await expect(figure.getByText('remap')).toBeVisible();

    const slider = figure.getByLabel('Transition progress');
    const atStart = await barGeometry(page, figure);
    await slider.focus();
    await page.keyboard.press('End');
    await expect(figure.locator('output')).toHaveText('1.00');
    const atEnd = await barGeometry(page, figure);
    expect(atEnd).not.toEqual(atStart);

    // Seeking back to 0 reproduces the first frame exactly.
    await page.keyboard.press('Home');
    await expect(figure.locator('output')).toHaveText('0.00');
    expect(await barGeometry(page, figure)).toEqual(atStart);

    // Play forward to the end, then reverse back to the start.
    await figure.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => progressOf(figure), { timeout: 8000 }).toBe(1);
    expect(await barGeometry(page, figure)).toEqual(atEnd);
    await figure.getByRole('button', { name: 'Play in reverse' }).click();
    await expect.poll(() => progressOf(figure), { timeout: 8000 }).toBe(0);
    expect(await barGeometry(page, figure)).toEqual(atStart);

    // Pause mid-flight keeps an intermediate frame.
    await figure.getByRole('button', { name: 'Restart from the first state' }).click();
    await page.waitForTimeout(250);
    await figure.getByRole('button', { name: 'Pause' }).click();
    const paused = await progressOf(figure);
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThan(1);
    await page.waitForTimeout(300);
    expect(await progressOf(figure)).toBe(paused);

    expect(errors).toEqual([]);
  });

  test('example source is the module that rendered the chart, and is copyable', async ({ page }) => {
    await page.goto('docs/charts/bar/');
    const code = page.locator('figure:has(pre)').filter({ hasText: 'bar-split.ts' }).first();
    await expect(code).toContainText("import { bar } from 'visdelta/bar';");
    await expect(code).toContainText("import { transition } from 'visdelta/transition';");
    await expect(code).toContainText('.breakdown(\'channel\')');
    await expect(code).toContainText('await transition(from, to');
    await expect(code.getByRole('button', { name: /copy/i })).toBeVisible();
  });

  test('a sequence seeks in leg units and reports each leg', async ({ page }) => {
    await page.goto('docs/guides/stories/');
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('.vd-docs-chart svg')).toBeVisible();
    const slider = figure.getByLabel('Transition progress');
    await expect(slider).toHaveAttribute('max', '3');
    await expect(figure.getByText('Leg 1')).toBeVisible();
    await slider.focus();
    await page.keyboard.press('End');
    await expect(figure.locator('output')).toHaveText('3.00');
    await expect(figure.getByText('Leg 3')).toBeVisible();
    await expect(figure.getByText('attention')).toBeVisible();
  });

  test('charts re-read colour tokens when the colour scheme changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('docs/quick-start/');
    const rect = page.locator('.vd-docs-chart svg rect.vd-bar, .vd-docs-chart svg g rect').first();
    await expect(rect).toBeVisible();
    const fill = () => rect.evaluate((node) => getComputedStyle(node).fill);
    const light = await fill();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(fill).not.toBe(light);
  });

  test('every docs page renders its live examples without errors', async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    const links = new Set<string>();
    const sitemap = await (await page.request.get('sitemap.xml')).text();
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    expect(urls.length).toBeGreaterThan(30);
    const base = new URL(baseURL!).pathname.replace(/\/$/, '');
    const siteBase = new URL(urls[0], 'http://x').pathname.replace(/\/$/, '');
    for (const path of urls) {
      const local = `${base}${path.slice(siteBase.length) || '/'}`;
      await page.goto(local);
      await expect(page.locator('h1').first()).toBeVisible();
      const charts = page.locator('.vd-docs-chart');
      const count = await charts.count();
      for (let index = 0; index < count; index += 1) {
        const chart = charts.nth(index);
        await chart.scrollIntoViewIfNeeded();
        await expect(chart.locator('svg').first(), `${local} chart ${index}`).toBeVisible({ timeout: 10_000 });
      }
      await expect(page.locator('[data-example-error]')).toHaveCount(0);
      for (const href of await page.locator('a[href]').evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      )) {
        const target = new URL(href);
        if (target.origin === new URL(baseURL!).origin) links.add(target.pathname);
      }
    }
    expect(errors).toEqual([]);

    // Every internal link resolves.
    const broken: string[] = [];
    for (const link of links) {
      const response = await page.request.get(link);
      if (!response.ok()) broken.push(`${link} → ${response.status()}`);
    }
    expect(broken).toEqual([]);
  });
});

test.describe('playground', () => {
  test('categories navigate examples, deep links select one, and parameters keep progress', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('docs/examples/playground/#line-split');
    const tabs = page.getByRole('group', { name: 'State-change category' });
    await expect(tabs.getByRole('button', { name: /Grain/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Split a mean into series/ })).toHaveAttribute('aria-current', 'true');
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('svg path.vd-line').first()).toBeVisible();
    await expect(figure.getByText('split')).toBeVisible();

    await tabs.getByRole('button', { name: /Coordinate/ }).click();
    await expect(page.getByRole('button', { name: /Flip orientation/ })).toHaveAttribute('aria-current', 'true');
    await expect(page).toHaveURL(/#bar-flip$/);
    await expect(figure.getByText('reorient')).toBeVisible();

    const slider = figure.getByLabel('Transition progress');
    await expect(slider).toBeEnabled();
    await slider.focus();
    await page.keyboard.press('End');
    await figure.getByLabel('Chart style').selectOption('editorial');
    await expect(figure.locator('.vd-style-editorial')).toBeVisible();
    await expect(figure.locator('output')).toHaveText('1.00');
    expect(errors).toEqual([]);
  });
});

test.describe('site', () => {
  test('homepage tabs choose the demo and the demo plays itself', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Change the state.');
    const tabs = page.getByRole('group', { name: 'Chart type' });
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('svg').first()).toBeVisible();
    await expect.poll(() => progressOf(figure), { timeout: 6000 }).toBeGreaterThan(0);
    await tabs.getByRole('button', { name: 'line', exact: true }).click();
    await expect(page.getByText('line-split.ts')).toBeVisible();
    await expect(figure.locator('svg path.vd-line').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('autoplay respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('svg').first()).toBeVisible();
    await page.waitForTimeout(2500);
    expect(await progressOf(figure)).toBe(0);
  });

  test('search finds API pages', async ({ page }) => {
    await page.goto('docs/');
    const input = page.getByPlaceholder(/search/i);
    // The trigger works once the page has hydrated; retry the click until then.
    await expect(async () => {
      await page.getByRole('button', { name: /search/i }).first().click();
      await expect(input).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await input.fill('sequence');
    await expect(page.getByRole('dialog').getByText('sequence()').first()).toBeVisible({ timeout: 10_000 });
  });

  test('docs navigation works on a phone without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('docs/concepts/state-changes/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /open sidebar|toggle sidebar|menu/i }).first().click();
    await page.getByRole('link', { name: 'Quick start' }).click();
    await expect(page).toHaveURL(/\/docs\/quick-start\/$/);
  });

  test('legacy VitePress URLs redirect to their new pages', async ({ page }) => {
    await page.goto('getting-started.html');
    await expect(page).toHaveURL(/\/docs\/quick-start\/$/);
    await page.goto('reference.html');
    await expect(page).toHaveURL(/\/docs\/api\/$/);
  });

  test('machine-readable outputs are published', async ({ request }) => {
    const llms = await (await request.get('llms.txt')).text();
    expect(llms).toContain('# VisDelta');
    expect(llms).toMatch(/\[Quick start\]\(https?:\/\/[^)]+\/llms\.mdx\/docs\/quick-start\/content\.md\)/);

    const markdown = await request.get('llms.mdx/docs/api/transition/content.md');
    expect(markdown.ok()).toBe(true);
    const text = await markdown.text();
    expect(text).toContain('# transition()');
    expect(text).toContain('TransitionOptions');

    const full = await (await request.get('llms-full.txt')).text();
    expect(full).toContain('# Quick start');

    const sitemap = await (await request.get('sitemap.xml')).text();
    expect(sitemap).toContain('/docs/api/core/</loc>');
    expect(await (await request.get('robots.txt')).text()).toContain('Sitemap:');
  });

  test('pages declare canonical URLs and descriptions', async ({ page }) => {
    await page.goto('docs/concepts/state-changes/');
    await expect(page).toHaveTitle('State changes · VisDelta');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/docs\/concepts\/state-changes\/$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /seven categories/);
  });
});
