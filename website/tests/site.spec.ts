import { expectFit } from './fit';
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
  const chart = (page: Page) => page.getByLabel('Chart', { exact: true });
  const keys = (page: Page) => page.getByRole('region', { name: 'Keyframes' }).locator('.pg-key');
  const changes = (page: Page) => page.getByRole('status', { name: 'State changes' });
  const details = async (page: Page) => { const toggle = page.getByRole('button', { name: 'Details', exact: true }); if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click(); };
  const examples = (page: Page) => page.getByRole('navigation', { name: 'Examples' });
  /** Bars drawn on screen (prepared legs of a sequence stay hidden). */
  const visibleBars = (page: Page) =>
    chart(page)
      .locator('svg rect[data-key]')
      .evaluateAll((rects) => rects.filter((rect) => rect.checkVisibility({ visibilityProperty: true }) && rect.getBoundingClientRect().width > 0).length);

  test('keyframe previews are passive, cached, keyboard accessible and cleaned up', async ({ page }) => {
    await page.goto('playground/#split');
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    await details(page);
    await keys(page).first().click();
    await expect(page.locator('.cm-content')).toContainText('.rollup()');
    const code = await page.locator('.cm-content').textContent();
    const time = await page.getByLabel('Keyframe timeline').inputValue();
    await page.evaluate(() => {
      const counters = window as unknown as { previewRenders: number };
      counters.previewRenders = 0;
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof Element && node.matches('.pg-snapshot-render')) counters.previewRenders++;
        }
      }).observe(document.body, { childList: true });
    });
    await keys(page).nth(1).hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip.getByRole('img')).toBeVisible();
    const image = await tooltip.getByRole('img').getAttribute('src');
    expect(decodeURIComponent(image!)).toContain('<svg');
    await expect(page.locator('.cm-content')).toHaveText(code!);
    await expect(page.getByLabel('Keyframe timeline')).toHaveValue(time);
    await expect(page.locator('.pg-snapshot-render')).toHaveCount(0);
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await page.mouse.move(0, 0);
    await keys(page).nth(1).hover();
    await expect(tooltip.getByRole('img')).toHaveAttribute('src', image!);
    expect(await page.evaluate(() => (window as unknown as { previewRenders: number }).previewRenders)).toBe(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await keys(page).first().focus();
    await expect(tooltip).toContainText('Initial state');
    await expect(page.locator('.pg-snapshot-render')).toHaveCount(0);
  });

  test('the timeline panel has a fixed height per view that the reader can resize', async ({ page }) => {
    await page.goto('playground/#split');
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    const panel = page.getByRole('region', { name: 'Keyframes' });
    const grip = page.getByRole('separator', { name: 'Resize timeline' });
    const height = async () => (await panel.boundingBox())!.height;
    // Compact includes the time ruler; its controls sit on one centre line.
    await expect.poll(height).toBeCloseTo(124, 0);
    const centres = await panel.locator('.pg-transport > button, .pg-row > button').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return rect.top + rect.height / 2; }));
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(1.5);
    // Details opens to its own remembered height, then stays fixed.
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect.poll(height).toBeCloseTo(320, 0);
    await expect(grip).toHaveAttribute('aria-valuenow', '320');
    // Details contains the inspector inside the fixed, internally scrolling panel.
    const inspector = page.getByLabel('Stage inspector');
    await expect(inspector).toBeVisible();
    await expect.poll(height).toBeCloseTo(320, 0);
    expect(await inspector.evaluate(node => Boolean(node.closest('.pg-timeline-body')))).toBe(true);
    expect(await panel.locator('.pg-timeline-body').evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    // Dragging the top edge up makes it taller; each view's size is remembered.
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    await expect.poll(height).toBeCloseTo(360, 0);
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect.poll(height).toBeCloseTo(124, 0);
    await page.reload();
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect.poll(height).toBeCloseTo(360, 0);
    // The keyboard and a double-click work too, within limits.
    await grip.focus();
    await page.keyboard.press('ArrowDown');
    await expect(grip).toHaveAttribute('aria-valuenow', '344');
    await page.keyboard.press('Home');
    await expect(grip).toHaveAttribute('aria-valuenow', '124');
    await grip.dblclick();
    await expect(grip).toHaveAttribute('aria-valuenow', '320');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(height).toBeCloseTo(320, 0);
    await grip.focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(height).toBeCloseTo(336, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('an editor workspace: examples, files, chart, timeline and status', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/');
    // Studio views share the same main navigation as Home and Docs.
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Playground' })).toHaveAttribute('aria-current', 'page');
    // Categories are the folders of the examples tree; the default story is Layout → Sort.
    const tree = examples(page);
    for (const label of ['Data', 'Grain', 'Encoding', 'Coordinate', 'Layout', 'Attention', 'Appearance']) {
      await expect(tree.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(tree.getByRole('button', { name: /Which states have the largest under-ten populations/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('tab', { name: 'chart.js' })).toHaveAttribute('aria-selected', 'true');
    await expect(chart(page).locator('svg').first()).toBeVisible();
    // The editor, the preview and the timeline fill the window; the page does not scroll.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    // Add an interpretive title, then rank states by the stated measure.
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    await expect(page.getByLabel('Chart code')).toContainText('.sort("population", "descending")');
    await expect(changes(page)).toContainText('layout.reorder');
    await expect(page.getByRole('button', { name: 'Keyframe 3: layout.reorder' })).toBeVisible();
    await expect(page.locator('.pg-clip')).toHaveCount(2);
    await expect(page.locator('footer.pg-status')).toContainText('Live');

    // Folders collapse; a story opens from the tree and its hash.
    await tree.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(tree.getByRole('button', { name: 'Filter', exact: true })).toHaveCount(0);
    await tree.getByRole('button', { name: /Which services contribute/ }).click();
    await expect(page).toHaveURL(/#service-line-split$/);
    await expect(page.getByRole('toolbar', { name: 'Playground' })).toContainText('Grain/Which services contribute');
    await expect(chart(page).locator('svg path.vd-line').first()).toBeVisible();
    await expect(changes(page)).toContainText('grain.split', { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('a reader edit animates from the chart on screen; a broken edit keeps it', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#service-line-split');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    await keys(page).last().click();
    await expect(page.locator('footer.pg-status')).toContainText('On the timeline');
    const editor = page.getByLabel('Chart code');
    await typeInto(page, editor, 'const chart = line(rows).x("month").y("requests").key(["month", "service"]).color("service").curve("curveStepAfter");');
    await expect(changes(page)).toContainText('appearance.reshape', { timeout: 10_000 });
    // The edited chart is a draft until the reader saves its frame.
    await expect(keys(page)).toHaveCount(3);
    await expect(page.locator('.pg-snapshot-card[data-draft]')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('.pg-snapshot-card[data-draft]')).toHaveCount(0);
    await expect(keys(page)).toHaveCount(3);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('This is already keyframe 3.')).toBeVisible();

    await typeInto(page, editor, 'const chart = line(rows).nope();');
    await expect(page.getByRole('alert').filter({ hasText: 'is not a function' })).toBeVisible();
    await expect(page.locator('footer.pg-status')).toContainText('Error');
    await expect(chart(page).locator('svg path.vd-line').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('completions offer the chart\'s own methods and the rows\' fields', async ({ page }) => {
    await page.goto('playground/#service-line-split');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    await keys(page).last().click();
    await expect(page.locator('footer.pg-status')).toContainText('On the timeline');
    const editor = page.getByLabel('Chart code');
    await typeInto(page, editor, 'const chart = line(rows).cur');
    const list = page.locator('.cm-tooltip-autocomplete');
    await page.keyboard.press('Control+Space');
    await expect(list.getByRole('option', { name: 'curve' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.type('ve("');
    await page.keyboard.press('Control+Space');
    await expect(list.getByRole('option', { name: /service/ })).toBeVisible();
  });

  test('with auto-run off, edits wait for Run and land as one transition', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#service-line-split');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    await page.getByRole('switch', { name: 'Auto-run' }).uncheck({ force: true });
    const editor = page.getByLabel('Chart code');
    await typeInto(page, editor, 'const chart = line(rows).x("month").y("requests").key(["month", "service"]).color("service").curve("curveStepAfter");');
    await page.waitForTimeout(800);
    await expect(changes(page)).not.toContainText('appearance.reshape');
    await expect(page.locator('footer.pg-status')).toContainText('to run');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(changes(page)).toContainText('appearance.reshape', { timeout: 10_000 });
    // The preference is per viewer and survives a reload.
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Auto-run' })).not.toBeChecked();
    await page.getByRole('switch', { name: 'Auto-run' }).check({ force: true });
    expect(errors).toEqual([]);
  });

  test('saved keyframes replay as one sequence, and the code follows the playhead', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#filter');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    const editor = page.getByLabel('Chart code');
    await expect(editor).toContainText('gte: 500000');
    const timeline = page.getByLabel('Keyframe timeline');
    await timeline.fill('0');
    await expect(editor).not.toContainText('population: { gte');
    await expect(page.locator('footer.pg-status')).toContainText('On the timeline');
    // The track is in real time: keyframe 2 sits where its leg ends.
    await timeline.fill((await keys(page).nth(1).getAttribute('data-time'))!);
    await expect(editor).toContainText('gte: 1000000');
    await expect(changes(page)).toContainText('data.remove');
    await expect(page.locator('.pg-layer[data-state=leaving]')).toHaveCount(0);
    const bars = await visibleBars(page);

    await page.getByRole('button', { name: 'Play keyframes' }).click();
    await expect(editor).toContainText('gte: 500000', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Play keyframes' })).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => visibleBars(page)).toBeGreaterThan(bars);

    // Clicking a timeline keyframe seeks there without playing.
    await page.getByRole('button', { name: /^Keyframe 1$/ }).click();
    await expect(editor).not.toContainText('population: { gte', { timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test('the timeline is in real time and shows each leg\'s planned route stages', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#split');
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    const track = page.getByRole('region', { name: 'Keyframes' });
    // Split is planned in two route stages, the grouped layout in one: 3 × 0.9s.
    await expect(track.locator('.pg-clip')).toHaveCount(2);
    await details(page);
    await keys(page).last().click();
    await expect(track.locator('.pg-stage-block')).toHaveCount(3);
    await expect(track.locator('.pg-clip').first()).toHaveAttribute('title', /2 planned stages/);
    await expect(track.locator('.pg-stage-block').nth(1)).toHaveAttribute('aria-label', /stage 2 of 2:/);
    await expect(keys(page).nth(1)).toHaveAttribute('data-time', '1.8');
    await expect(keys(page).nth(2)).toHaveAttribute('data-time', '2.7');
    await expect(track.getByLabel('Playhead time in seconds')).toHaveValue('2.70');
    await expect(track).toContainText('s / 2.70s');
    // Measure the settled track, not the scale-in entrance transform.
    await track.locator('.pg-clip').evaluateAll(clips => Promise.all(clips.flatMap(clip => clip.getAnimations().map(animation => animation.finished))));
    const clipWidths = await track.locator('.pg-clip').evaluateAll((clips) => clips.map((clip) => clip.getBoundingClientRect().width));
    expect(clipWidths[0] / clipWidths[1]).toBeCloseTo(2, 1);

    // Scrubbing to 1.25s sits in the first leg's second stage.
    await page.getByLabel('Keyframe timeline').fill('1.25');
    await expect(track.getByLabel('Playhead time in seconds')).toHaveValue('1.25');
    await expect(track).toContainText('s / 2.70s');
    await expect(track.locator('.pg-clip').first()).toHaveAttribute('data-active', 'true');
    await expect(track.locator('.pg-stage-block[data-active]')).toHaveCount(1);
    expect(await track.locator('.pg-stage-block').evaluateAll((blocks) => blocks.findIndex((block) => block.hasAttribute('data-active')))).toBe(1);

    // Playing from the start takes the real duration: one 0.9s per stage, not per leg.
    await page.getByLabel('Keyframe timeline').fill('0');
    const started = Date.now();
    await page.getByRole('button', { name: 'Play keyframes' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play keyframes' })).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - started).toBeGreaterThan(2_300);
    await expect(track.getByLabel('Playhead time in seconds')).toHaveValue('2.70');
    await expect(track).toContainText('s / 2.70s');
    expect(errors).toEqual([]);
  });

  test('the chart fits its container, or keeps a fixed size that scrolls', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#sort');
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    const stage = chart(page);
    const canvas = stage.locator('svg').first();
    const box = async (locator: Locator) => locator.evaluate((node) => ({ width: Math.round(node.getBoundingClientRect().width), height: Math.round(node.getBoundingClientRect().height) }));
    const sizeGroup = page.getByRole('group', { name: 'Chart size' });
    await expect(sizeGroup.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');

    // Fit scales the whole fixed figure proportionally into the available room.
    await expectFit(stage);

    // Fixed: exactly the width and height asked for, whatever the container is.
    await sizeGroup.getByRole('button', { name: 'Fixed' }).click();
    await page.getByLabel('Chart width in pixels').fill('640');
    await page.getByLabel('Chart height in pixels').fill('400');
    await expect.poll(async () => (await box(canvas)).height).toBe(400);
    expect(await box(canvas)).toEqual({ width: 640, height: 400 });
    await page.getByLabel('Chart width in pixels').fill('1500');
    await page.getByLabel('Chart height in pixels').fill('520');
    await expect.poll(() => box(canvas)).toEqual({ width: 1500, height: 520 });
    // A canvas larger than its container scrolls instead of being clipped or shrunk.
    const scrolls = () => stage.evaluate((node) => ({ x: node.scrollWidth > node.clientWidth, y: node.scrollHeight > node.clientHeight }));
    expect(await scrolls()).toEqual({ x: true, y: await stage.evaluate(node => node.clientHeight < 520) });
    await page.getByLabel('Chart height in pixels').fill('1100');
    await expect.poll(() => box(canvas)).toEqual({ width: 1500, height: 1100 });
    expect(await scrolls()).toEqual({ x: true, y: true });
    await page.getByLabel('Chart height in pixels').fill('520');
    await expect.poll(() => box(canvas)).toEqual({ width: 1500, height: 520 });
    // Out-of-range input is ignored.
    await page.getByLabel('Chart width in pixels').fill('20');
    await expect.poll(() => box(canvas)).toEqual({ width: 1500, height: 520 });

    // Saved keyframes replay at the same size, and a new edit keeps it too.
    await page.getByLabel('Keyframe timeline').fill('0.9');
    await expect.poll(async () => (await box(stage.locator('svg:visible').first()))).toEqual({ width: 1500, height: 520 });
    await page.reload();
    await expect(sizeGroup.getByRole('button', { name: 'Fixed' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Chart width in pixels')).toHaveValue('1500');

    // Back to fit: it follows its container again, including while replaying keyframes.
    await sizeGroup.getByRole('button', { name: 'Fit' }).click();
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    await page.getByLabel('Keyframe timeline').fill('0.5');
    await expectFit(stage);
    await expect(stage.locator('svg:visible').first()).toHaveAttribute('viewBox', '0 0 1500 520');
    expect(errors).toEqual([]);
  });

  test('the chart floats in a window it can be dragged and resized in, and follows it', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#sort');
    await expect(keys(page)).toHaveCount(3, { timeout: 25_000 });
    const preview = page.getByRole('region', { name: 'Preview' });
    const stage = chart(page);
    const windowBox = async () => (await preview.boundingBox())!;
    const docked = await windowBox();

    await page.getByRole('button', { name: 'Float' }).click();
    await expect(page.getByRole('button', { name: 'Dock' })).toHaveAttribute('aria-pressed', 'true');
    // A floating preview is a window over the editor, no longer a column beside it.
    await expect.poll(async () => (await windowBox()).width).toBeLessThan(docked.width);
    expect(await preview.evaluate((node) => getComputedStyle(node).position)).toBe('absolute');
    const editor = (await page.getByRole('region', { name: 'Editor' }).boundingBox())!;
    expect(editor.width).toBeGreaterThan(docked.width);

    // Drag the title bar: the window moves and stays inside the workspace.
    const before = await windowBox();
    const dragPoint = () => preview.locator('.pg-viewbar').evaluate(bar => {
      const box = bar.getBoundingClientRect();
      for (let x = box.right - 40; x > box.left; x -= 8) {
        const y = box.top + box.height / 2;
        const target = document.elementFromPoint(x, y);
        if (target && bar.contains(target) && !target.closest('button,input,label,select,summary,details')) return { x, y };
      }
      throw new Error('The floating toolbar needs an exposed drag area');
    });
    const point = await dragPoint();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x - 200, point.y + 116, { steps: 6 });
    await page.mouse.up();
    const moved = await windowBox();
    expect(Math.round(before.x - moved.x)).toBe(200);
    expect(Math.round(moved.y - before.y)).toBe(116);

    // Resize from its corner: the window dimensions become the authored canvas size.
    const corner = (await preview.locator('.pg-resize[data-edge=se]').boundingBox())!;
    await page.mouse.move(corner.x + 6, corner.y + 6);
    await page.mouse.down();
    await page.mouse.move(corner.x + 6 + 120, corner.y + 6 + 60, { steps: 6 });
    await page.mouse.up();
    const grown = await windowBox();
    expect(Math.round(grown.width - moved.width)).toBe(120);
    expect(Math.round(grown.height - moved.height)).toBe(60);
    await expect(stage.locator("svg").first()).toHaveAttribute("viewBox", `0 0 ${Math.round(grown.width)} ${Math.round(grown.height)}`);
    await expectFit(stage);
    const workspace = (await page.locator('.pg-app').boundingBox())!;
    expect(grown.x).toBeGreaterThanOrEqual(workspace.x);
    expect(grown.x + grown.width).toBeLessThanOrEqual(workspace.x + workspace.width + 1);

    // Dragging a window past the edge clamps it.
    const nextPoint = await dragPoint();
    await page.mouse.move(nextPoint.x, nextPoint.y);
    await page.mouse.down();
    await page.mouse.move(-400, -400, { steps: 4 });
    await page.mouse.up();
    const clamped = await windowBox();
    expect(clamped.x).toBeGreaterThanOrEqual(workspace.x);
    expect(clamped.y).toBeGreaterThanOrEqual(workspace.y + 40);

    await page.getByRole('button', { name: 'Dock' }).click();
    await expect.poll(async () => Math.round((await windowBox()).width)).toBe(Math.round(docked.width));
    await expect(stage.locator('svg').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('on a phone the chart stays docked and fits its column', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('playground/#sort');
    await expect(chart(page).locator('svg').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Float' })).toHaveCount(0);
    const fits = await chart(page).evaluate((stage) => stage.querySelector('figure')!.getBoundingClientRect().width <= stage.clientWidth + 1);
    expect(fits).toBe(true);
  });

<<<<<<< Updated upstream
=======
  test('headings stay outside the canvas; Fit scales the whole figure and Fixed preserves canvas size', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#headline');
    // Start, then add a title and subtitle: three saved states.
    await expect(keys(page)).toHaveCount(3, { timeout: 30_000 });
    const stage = chart(page);
    const title = stage.locator('.vd-figure-title:visible').first();
    await expect(title).toContainText('Residents under 10');
    await expect(changes(page)).toContainText('appearance.restyle(subtitle)');
    // The heading remains outside the SVG in both sizing modes.
    expect(await stage.locator('svg').first().evaluate((svg) => svg.querySelector('.vd-figure-title') !== null)).toBe(false);
    expect(await stage.locator('figure').first().evaluate((figure) => figure.querySelector('figcaption') !== null && figure.querySelector('svg')!.closest('figcaption') === null)).toBe(true);

    // Fit scales the whole figure, preserving the authored canvas and its aspect ratio.
    const timeline = page.getByLabel('Keyframe timeline');
    const canvas = () => stage.locator('svg:visible').first().evaluate((svg) => {
      const box = svg.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height), top: Math.round(box.top), bottom: Math.round(box.bottom) };
    });
    await timeline.fill('0');
    await expect(page.locator('footer.pg-status')).toContainText('On the timeline');
    await expect(page.locator('.pg-layer[data-state=leaving]')).toHaveCount(0);
    const fitFirst = await canvas();
    const native = await stage.locator("svg:visible").first().getAttribute("viewBox");
    await timeline.fill((await timeline.getAttribute('max'))!);
    await expect.poll(async () => (await canvas()).top).toBeGreaterThan(fitFirst.top);
    const fitLast = await canvas();
    expect(fitLast.width / fitLast.height).toBeCloseTo(fitFirst.width / fitFirst.height, 1);
    await expectFit(stage);
    await expect(stage.locator("svg:visible").first()).toHaveAttribute("viewBox", native!);
    // Compare the edge itself: summing separately rounded top and height can drift by a pixel.
    expect(fitLast.bottom).toBeLessThanOrEqual((await stage.boundingBox())!.y + (await stage.boundingBox())!.height + 1);
    await timeline.fill('0');
    await expect.poll(canvas).toEqual(fitFirst);
    await expect(stage.locator('.vd-figure-header:visible')).toHaveCount(0);

    // Fixed leaves the canvas size alone, so the heading's room opens by progress and the
    // first frame is the chart drawn without one.
    await page.getByRole('group', { name: 'Chart size' }).getByRole('button', { name: 'Fixed' }).click();
    await timeline.fill('0');
    await expect(stage.locator('.vd-figure-header:visible')).toHaveCount(0);
    await expect(page.locator('.pg-layer[data-state=leaving]')).toHaveCount(0);
    const first = await canvas();
    await timeline.fill((await timeline.getAttribute('max'))!);
    await expect(stage.locator('.vd-figure-header:visible')).toHaveCount(1);
    await expect.poll(async () => (await canvas()).top).toBeGreaterThan(first.top + 20);
    const last = await canvas();
    expect({ width: last.width, height: last.height }).toEqual({ width: first.width, height: first.height });
    expect(errors).toEqual([]);
  });

>>>>>>> Stashed changes
  test('rows are a file: upload your own or edit them, and the chart follows', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('playground/#sort');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    await page.getByRole('tab', { name: /us-population-state-age-tidy\.csv/ }).click();
    await expect(page.getByRole('tabpanel')).toContainText('468 records · 3 fields');
    await page.getByLabel('Use your own CSV or JSON rows').setInputFiles({
      name: 'states.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('state,age,population\nAA,<10,5\nBB,<10,9\nCC,<10,2\n'),
    });
    await expect(page.getByRole('tab', { name: /states\.csv\s*3/ })).toBeVisible();
    await expect.poll(() => visibleBars(page), { timeout: 10_000 }).toBe(3);

    // Editing the CSV source reruns the code against the new rows.
    await page.getByRole('group', { name: 'Rows view' }).getByRole('button', { name: 'CSV' }).click();
    const source = page.getByLabel('Rows source');
    await source.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('DD,<10,7\n');
    await expect.poll(() => visibleBars(page), { timeout: 10_000 }).toBe(4);
    await expect(page.getByRole('tab', { name: /states\.csv\s*4/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a share link carries the code and opens it only when the reader runs it', async ({ page, context }) => {
    const errors = trackErrors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('playground/#service-line-split');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    await keys(page).last().click();
    await expect(page.locator('footer.pg-status')).toContainText('On the timeline');
    const editor = page.getByLabel('Chart code');
    await typeInto(page, editor, 'const chart = line(rows).x("month").y("requests").key(["month", "service"]).color("service").curve("curveStepAfter");');
    await expect(changes(page)).toContainText('appearance.reshape', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.locator('footer.pg-status')).toContainText(/Link (copied|is in the address bar)/);
    await expect(page).toHaveURL(/#share=[\w-]+$/);
    const link = page.url();

    const other = await context.newPage();
    const otherErrors = trackErrors(other);
    await other.goto(link);
    await expect(other.getByLabel('Chart code')).toContainText('curveStepAfter');
    await expect(other.getByRole('toolbar', { name: 'Playground' })).toContainText('Link/Shared code');
    // Nothing from the link has run yet.
    await expect(other.getByLabel('Chart', { exact: true }).locator('svg')).toHaveCount(0);
    await expect(other.locator('footer.pg-status')).toContainText('Not run yet');
    await other.getByRole('button', { name: 'Run this code' }).click();
    await expect(other.getByLabel('Chart', { exact: true }).locator('svg path.vd-line').first()).toBeVisible();
    await expect(other.getByRole('region', { name: 'Keyframes' }).locator('.pg-key')).toHaveCount(1);
    expect([...errors, ...otherErrors]).toEqual([]);
  });

  test('the divider resizes the editor and the chart follows its pane', async ({ page }) => {
    await page.goto('playground/#sort');
    await expect(keys(page)).toHaveCount(3, { timeout: 20_000 });
    const before = (await chart(page).boundingBox())!.width;
    const native = await chart(page).locator("svg").first().getAttribute("viewBox");
    const divider = page.getByRole('separator', { name: 'Resize editor and preview' });
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x - 200, box.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await chart(page).boundingBox())!.width).toBeGreaterThan(before + 100);
    await expectFit(chart(page));
    await expect(chart(page).locator("svg").first()).toHaveAttribute("viewBox", native!);
    const value = Number(await divider.getAttribute('aria-valuenow'));
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', String(value + 2));
  });

  test('on a phone the examples are a drawer and the page reads rows, code, then chart', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('playground/#split');
    await expect(examples(page)).toBeHidden();
    const order = await page.evaluate(() =>
      ['[aria-label="Files"]', '[aria-label="Chart code"]', '[aria-label="Chart"]'].map((selector) => document.querySelector(selector)!.getBoundingClientRect().top),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await page.getByRole('button', { name: 'Open Sidebar', exact: true }).click();
    await examples(page).getByRole('button', { name: /Is engine power related to fuel economy/ }).click();
    await expect(page).toHaveURL(/#remap$/);
    await expect(examples(page)).toBeHidden();
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
    await expect(page.getByRole('region', { name: 'Keyframes' }).locator('.pg-key')).toHaveCount(1);
    await expect(page.getByRole('toolbar', { name: 'Playground' })).toContainText('Gallery/');
    await expect(page.getByText('edit the code; the chart follows')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('gallery thumbnails with a legend fit their card: the legend sits above the canvas and nothing is clipped', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('gallery/');
    await page.getByPlaceholder(/stacked/).fill('stacked');
    const tiles = page.locator('[data-idiom-tile]');
    await expect(tiles.first().locator('svg').first()).toBeVisible({ timeout: 20_000 });
    const withLegend = tiles.filter({ has: page.locator('.vd-legend-svg') });
    await expect(withLegend.first()).toBeVisible({ timeout: 20_000 });
    const count = await withLegend.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      const tile = withLegend.nth(index);
      await tile.scrollIntoViewIfNeeded();
      const fit = await tile.evaluate((element) => {
        const frame = element.querySelector('span.relative')!.getBoundingClientRect();
        const canvas = element.querySelector('svg')!.getBoundingClientRect();
        const legend = element.querySelector('.vd-legend-svg')!.getBoundingClientRect();
        return { canvasBelowLegend: canvas.top >= legend.bottom - 1, canvasInside: canvas.bottom <= frame.bottom + 1, legendInside: legend.top >= frame.top - 1 };
      });
      expect(fit).toEqual({ canvasBelowLegend: true, canvasInside: true, legendInside: true });
    }
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
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: path }).toBeLessThanOrEqual(0);
    }
    await page.getByRole('button', { name: /open sidebar|toggle sidebar|menu/i }).first().click();
    await page.getByRole('link', { name: 'Quick start' }).click();
    await expect(page).toHaveURL(/\/docs\/quick-start\/$/);
  });

  test('published compatibility URLs redirect to current Docs and Studio routes', async ({ page }) => {
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
