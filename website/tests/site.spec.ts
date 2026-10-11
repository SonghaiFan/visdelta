import { expect, test, type Locator, type Page } from '@playwright/test';

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
async function barGeometry(scope: Locator) {
  return scope.locator('.vd-docs-chart svg rect').evaluateAll((rects) =>
    rects.map((rect) => `${rect.getAttribute('x')},${rect.getAttribute('y')},${rect.getAttribute('width')},${rect.getAttribute('height')}`).join(' '),
  );
}

const progressOf = async (scope: Locator) => Number(await scope.locator('output').first().textContent());

/** Replace the contents of a CodeMirror editor. */
async function typeInto(page: Page, editor: Locator, text: string) {
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

test.describe('live examples', () => {
  test('one control plays to B, back to A, and pauses; seeking is exact', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('docs/quick-start/');
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('.vd-docs-chart svg')).toBeVisible();
    await expect(figure.getByText('encoding.remap(y)')).toBeVisible();

    const slider = figure.getByLabel('Transition progress');
    const atA = await barGeometry(figure);
    await slider.focus();
    await page.keyboard.press('End');
    await expect(figure.locator('output')).toHaveText('1.00');
    const atB = await barGeometry(figure);
    expect(atB).not.toEqual(atA);
    await page.keyboard.press('Home');
    await expect(figure.locator('output')).toHaveText('0.00');
    expect(await barGeometry(figure)).toEqual(atA);

    await figure.getByRole('button', { name: 'Play to B' }).click();
    await expect.poll(() => progressOf(figure), { timeout: 8000 }).toBe(1);
    expect(await barGeometry(figure)).toEqual(atB);
    // At B the same control plays the same frames back to A.
    await figure.getByRole('button', { name: 'Play back to A' }).click();
    await page.waitForTimeout(250);
    await figure.getByRole('button', { name: 'Pause' }).click();
    const paused = await progressOf(figure);
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThan(1);
    await page.waitForTimeout(300);
    expect(await progressOf(figure)).toBe(paused);
    await figure.getByRole('button', { name: 'Play back to A' }).click();
    await expect.poll(() => progressOf(figure), { timeout: 8000 }).toBe(0);
    expect(await barGeometry(figure)).toEqual(atA);
    expect(errors).toEqual([]);
  });

  test('example source is the module that rendered the chart', async ({ page }) => {
    await page.goto('docs/charts/bar/');
    const code = page.locator('figure:has(pre)').filter({ hasText: 'bar-split.ts' }).first();
    await expect(code).toContainText("import { bar } from 'visdelta/bar';");
    await expect(code).toContainText('await transition(from, to');
    await expect(code.getByRole('button', { name: /copy/i })).toBeVisible();
  });

  test('a sequence seeks in state units', async ({ page }) => {
    await page.goto('docs/guides/stories/');
    const figure = page.locator('figure', { has: page.locator('.vd-docs-chart') }).first();
    await expect(figure.locator('.vd-docs-chart svg')).toBeVisible();
    const slider = figure.getByLabel('Transition progress');
    await expect(slider).toHaveAttribute('max', '3');
    await slider.focus();
    await page.keyboard.press('End');
    await expect(figure.locator('output')).toHaveText('3.00');
    await expect(figure.getByText('leg 3')).toBeVisible();
    await expect(figure.getByText('attention.enter(highlight)')).toBeVisible();
  });

  test('charts follow the colour scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('docs/quick-start/');
    const rect = page.locator('.vd-docs-chart svg g rect').first();
    await expect(rect).toBeVisible();
    const fill = () => rect.evaluate((node) => getComputedStyle(node).fill);
    const light = await fill();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(fill).not.toBe(light);
  });

  test('every page renders its charts, and every internal link resolves', async ({ page, baseURL }) => {
    test.setTimeout(300_000);
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
      // Charts draw lazily; scroll like a reader, then require every one.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 480) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      });
      await expect
        .poll(() => page.locator('.vd-docs-chart').evaluateAll((charts) => charts.filter((chart) => !chart.querySelector('svg')).length), {
          message: `${local}: every chart draws`,
          timeout: 30_000,
        })
        .toBe(0);
      await expect(page.locator('[data-example-error]')).toHaveCount(0);
      for (const href of await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href))) {
        const target = new URL(href);
        if (target.origin === new URL(baseURL!).origin) links.add(target.pathname);
      }
    }
    expect(errors).toEqual([]);
    const broken: string[] = [];
    for (const link of links) {
      const response = await page.request.get(link);
      if (!response.ok()) broken.push(`${link} → ${response.status()}`);
    }
    expect(broken).toEqual([]);
  });
});

test.describe('playground', () => {
  test('opens a curated transition and plays it from A to B', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/');
    // Categories are the primary navigation; the default demo is Layout → Sort.
    const kinds = page.getByRole('navigation', { name: 'Kinds of change' });
    await expect(kinds.getByRole('button')).toHaveCount(7);
    await expect(kinds.getByRole('button', { name: 'Layout' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Sort', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Chart', { exact: true }).locator('svg').first()).toBeVisible();
    await expect(page.getByText('layout.reorder')).toBeVisible();
    await expect.poll(() => progressOf(page.locator('main')), { timeout: 10_000 }).toBe(1);
    await kinds.getByRole('button', { name: 'Grain' }).click();
    await expect(page).toHaveURL(/#split$/);
    await expect(page.getByRole('navigation', { name: 'Transitions' }).getByRole('button')).toHaveText(['Split', 'Regroup', 'Zip', 'Summarize']);
    await page.getByRole('button', { name: 'Zip', exact: true }).click();
    await expect(page).toHaveURL(/#zip$/);
    await expect(page.getByLabel('Chart', { exact: true }).locator('svg path.vd-line').first()).toBeVisible();
    await expect(page.getByText('grain.split').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('editing B re-plans the transition; a broken edit keeps the last chart', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#split');
    await expect(page.getByText('layout.rearrange')).toBeVisible();
    const editorB = page.getByLabel('Code for state B');
    await typeInto(page, editorB, 'const b = detail.flip();');
    await expect(page.getByText('coordinate.reorient')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => progressOf(page.locator('main')), { timeout: 10_000 }).toBe(1);

    await typeInto(page, editorB, 'const b = detail.nope();');
    await expect(page.getByRole('alert').filter({ hasText: 'detail.nope is not a function' })).toBeVisible();
    await expect(page.getByText('coordinate.reorient')).toBeVisible();
    await expect(page.getByLabel('Chart', { exact: true }).locator('svg').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('your own rows replace the dataset', async ({ page }) => {
    await page.goto('playground/#sort');
    await expect(page.getByText('layout.reorder')).toBeVisible();
    await page.getByLabel('Use your own CSV or JSON rows').setInputFiles({
      name: 'states.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('state,age,population\nAA,<10,5\nBB,<10,9\nCC,<10,2\n'),
    });
    await expect(page.getByText('states.csv · 3 records')).toBeVisible();
    await expect
      .poll(() => page.getByLabel('Chart', { exact: true }).locator('svg rect.vd-bar, svg g rect').count(), { timeout: 10_000 })
      .toBeLessThan(10);
  });
});

test.describe('site', () => {
  test('the homepage code edits itself and the chart follows', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Chart change,');
    const code = page.getByRole('region', { name: 'Chart code' }).locator('pre');
    await expect(code).toContainText('const chart = bar(rows)');
    await expect(code).toContainText('.color("country")', { timeout: 10_000 });
    await page.getByRole('group', { name: 'Chart type' }).getByRole('button', { name: 'Line' }).click();
    await expect(code).toContainText('const chart = line(rows)');
    await expect(page.getByRole('region', { name: 'Chart driven by the code' }).locator('svg path.vd-line').first()).toBeVisible();
    // A reader's toggle takes over from the automatic editing.
    await page.getByRole('group', { name: 'Toggle declarations' }).getByRole('button', { name: /flip/ }).click();
    await expect(code).toContainText('.flip()');
    await expect(page.getByRole('button', { name: 'resume' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('scrolling drives the story', async ({ page }) => {
    await page.goto('./');
    const chart = page.getByLabel('Chart driven by scroll position');
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator('svg')).toBeVisible();
    await expect(chart).toContainText('Revenue ($M)');
    await page.getByRole('heading', { name: 'Rank it.' }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 200);
    await expect(chart).toContainText('Profit ($M)');
  });

  test('autoplay respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    const code = page.getByRole('region', { name: 'Chart code' }).locator('pre');
    await expect(code).toContainText('const chart = bar(rows)');
    await page.waitForTimeout(4000);
    await expect(code).not.toContainText('.color(');
  });

  test('the gallery opens an idiom and takes it to the playground', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('gallery/');
    const tile = page.locator('[data-idiom-tile]').first();
    await expect(tile.locator('svg').first()).toBeVisible({ timeout: 15_000 });
    await tile.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Live chart').locator('svg').first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Next idiom' }).click();
    await expect(page).toHaveURL(/gallery\/#[a-z0-9-]+$/);
    const id = new URL(page.url()).hash.slice(1);
    await dialog.getByRole('link', { name: 'Edit in Playground →' }).click();
    await expect(page).toHaveURL(new RegExp(`playground/#idiom=${id}$`));
    await expect(page.getByLabel('Chart', { exact: true }).locator('svg').first()).toBeVisible();
    await expect(page.getByText('no state change yet')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('search finds API pages', async ({ page }) => {
    await page.goto('docs/');
    const input = page.getByPlaceholder(/search/i);
    await expect(async () => {
      await page.getByRole('button', { name: /search/i }).first().click();
      await expect(input).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await input.fill('sequence');
    await expect(page.getByRole('dialog').getByText('sequence()').first()).toBeVisible({ timeout: 10_000 });
  });

  test('pages work on a phone without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['./', 'playground/#split', 'gallery/', 'docs/concepts/state-changes/']) {
      await page.goto(path);
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.getByRole('button', { name: /open sidebar|toggle sidebar|menu/i }).first().click();
    await page.getByRole('link', { name: 'Quick start' }).click();
    await expect(page).toHaveURL(/\/docs\/quick-start\/$/);
  });

  test('legacy VitePress URLs redirect to their new pages', async ({ page }) => {
    await page.goto('getting-started.html');
    await expect(page).toHaveURL(/\/docs\/quick-start\/$/);
    await page.goto('playground.html');
    await expect(page).toHaveURL(/\/playground\/$/);
  });

  test('machine-readable outputs are published', async ({ request }) => {
    const llms = await (await request.get('llms.txt')).text();
    expect(llms).toContain('# VisDelta');
    expect(llms).toMatch(/\[Quick start\]\(https?:\/\/[^)]+\/llms\.mdx\/docs\/quick-start\/content\.md\)/);
    const markdown = await (await request.get('llms.mdx/docs/api/transition/content.md')).text();
    expect(markdown).toContain('# transition()');
    expect(markdown).toContain('TransitionOptions');
    expect(await (await request.get('llms-full.txt')).text()).toContain('# Quick start');
    const sitemap = await (await request.get('sitemap.xml')).text();
    expect(sitemap).toContain('/playground/</loc>');
    expect(await (await request.get('robots.txt')).text()).toContain('Sitemap:');
  });

  test('pages declare canonical URLs and descriptions', async ({ page }) => {
    await page.goto('docs/concepts/state-changes/');
    await expect(page).toHaveTitle('State changes · VisDelta');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/docs\/concepts\/state-changes\/$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /seven kinds of change/);
  });
});
