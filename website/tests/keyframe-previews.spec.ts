import { expect, test } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';

const cases = [
  ['bar', 'bar([{ x: "A", y: 2 }, { x: "B", y: 4 }]).x("x").y("y")'],
  ['line', 'line([{ x: 1, y: 2 }, { x: 2, y: 4 }]).x("x").y("y")'],
  ['area', 'area([{ x: 1, y: 2 }, { x: 2, y: 4 }]).x("x").y("y")'],
  ['point', 'point([{ x: 1, y: 2 }, { x: 2, y: 4 }]).x("x").y("y")'],
  ['unit', 'unit([{ id: "a" }, { id: "b" }]).key("id").layout("grid")'],
  ['bar', 'bar([]).x("x").y("y")'],
];

for (const [index, [chart, expression]] of cases.entries()) {
  test(`preview matches an independent static render: ${chart} ${index}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    const code = `const chart = ${expression}.color("#3366ff");`;
    const hash = deflateRawSync(JSON.stringify({ chart, code })).toString('base64url');
    await page.goto(`playground/#share=${hash}`);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const key = page.locator('.pg-key').first();
    await expect(key).toBeVisible();
    await key.hover();
    const image = page.getByRole('tooltip').getByRole('img');
    await expect(image).toBeVisible();
    const src = (await image.getAttribute('src'))!;
    await page.addScriptTag({ path: resolve('../dist/visdelta.global.js') });
    const same = await page.evaluate(async ({ code, src }) => {
      // An independent static controller evaluates the authored state at the preview dimensions.
      const api = (window as unknown as { VisDelta: Record<string, unknown> }).VisDelta;
      const build = new Function(...Object.keys(api), `${code}\nreturn chart;`);
      const state = build(...Object.values(api));
      const target = document.createElement('div');
      target.className = 'vd-docs-chart';
      target.style.cssText = 'position:fixed;left:-10000px;width:480px;height:300px';
      document.body.append(target);
      const transition = api.transition as (a: unknown, b: unknown, options: unknown) => Promise<{ destroy(): void }>;
      const controller = await transition(state, state, { target, width: 480, height: 300 });
      try {
        const actual = new DOMParser().parseFromString(decodeURIComponent(src.split(',').slice(1).join(',')), 'image/svg+xml').documentElement;
        const expected = target.querySelector('svg')!;
        const geometry = (root: Element, serialized: boolean) => [root, ...root.querySelectorAll('*')].map(node => {
          const attrs = ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'r', 'cx', 'cy', 'd', 'transform', 'viewBox'].map(name => node.getAttribute(name));
          const style = serialized ? (node as SVGElement).style : getComputedStyle(node);
          return [node.tagName, ...attrs, style.fill, style.stroke, node.children.length ? '' : node.textContent];
        });
        return JSON.stringify(geometry(actual, true)) === JSON.stringify(geometry(expected, false));
      } finally { controller.destroy(); target.remove(); }
    }, { code, src });
    expect(same).toBe(true);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(image).not.toHaveAttribute('src', src);
    await expect(page.locator('.pg-snapshot-render')).toHaveCount(0);
  });
}

test('a preview failure does not block selection or playback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#split');
  await expect(page.locator('.pg-key')).toHaveCount(3);
  await page.evaluate(() => {
    const original = Element.prototype.querySelector;
    Element.prototype.querySelector = function (this: Element, selector: string) {
      if (this.classList.contains('pg-snapshot-render') && selector === 'svg') return null;
      return original.call(this, selector);
    } as typeof original;
  });
  await page.locator('.pg-key').first().hover();
  await expect(page.getByRole('tooltip')).toContainText('Preview unavailable');
  await page.locator('.pg-key').first().click();
  await expect(page.getByLabel('Keyframe timeline')).toHaveValue('0');
  await page.getByRole('button', { name: 'Play keyframes' }).click();
  await expect(page.getByLabel('Keyframe timeline')).toHaveValue('2.7');
  await expect(page.locator('.pg-snapshot-render')).toHaveCount(0);
});

test('clearing while a preview starts discards its result and host', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('playground/#split');
  await expect(page.locator('.pg-key')).toHaveCount(3);
  await page.evaluate(() => {
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && node.matches('.pg-snapshot-render')))) {
        const clear = [...document.querySelectorAll('button')].find(button => button.textContent === 'clear');
        clear?.click();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  });
  await page.locator('.pg-key').first().hover();
  await expect(page.locator('.pg-key')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.locator('.pg-snapshot-render')).toHaveCount(0);
});

test('one saved sequence retains all seven category lanes and overlapping changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const base = 'bar([{group:"A",part:"x",v:2,w:6},{group:"A",part:"y",v:4,w:5},{group:"B",part:"x",v:3,w:2},{group:"B",part:"y",v:5,w:3}]).x("group").y("v").key(["group","part"]).breakdown("part").color("part")';
  const code = `const chart = ${base}.rollup();`;
  const hash = deflateRawSync(JSON.stringify({ chart: 'bar', code })).toString('base64url');
  await page.goto(`playground/#share=${hash}`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.pg-key')).toHaveCount(1);
  await page.getByRole('switch', { name: 'Auto-run' }).uncheck({ force: true });
  const variants = [base, base.replace('.y("v")', '.y("w")'), ...['.flip()', '.sort("v", "descending")', '.highlight({group:"A"})', '.color("#ff3366")', '.where({group:["A"]})'].map(suffix => base + suffix)];
  for (const [index, expression] of variants.entries()) {
    await page.getByLabel('Chart code').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(`const chart = ${expression};`);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(page.locator('.pg-key')).toHaveCount(index + 2);
  }
  await expect(page.locator('.pg-category-name')).toHaveText(['Data', 'Grain', 'Encoding', 'Coordinate', 'Layout', 'Attention', 'Appearance']);
  const firstTime = await page.locator('.pg-key').nth(1).getAttribute('data-time');
  await page.getByLabel('Keyframe timeline').fill(String(Number(firstTime) / 2));
  expect(await page.locator('.pg-category-block[data-active]').count()).toBeGreaterThan(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.pg-category-scroll')).toHaveCSS('max-height', '120px');
  await page.locator('[data-category="appearance"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-category="appearance"]')).toBeVisible();
});

test('keyframe previews retain the heading and outside legend above the canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const code = 'const chart = bar([{x:"A",y:2,g:"North"},{x:"B",y:4,g:"South"}]).x("x").y("y").color("g").title("Regional totals").subtitle("Saved heading and legend");';
  const hash = deflateRawSync(JSON.stringify({ chart: 'bar', code })).toString('base64url');
  await page.goto(`playground/#share=${hash}`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.pg-key')).toHaveCount(1);
  await page.locator('.pg-key').first().hover();
  const image = page.getByRole('tooltip').getByRole('img');
  await expect(image).toBeVisible();
  const details = await image.evaluate(node => {
    const image = node as HTMLImageElement;
    const svg = new DOMParser().parseFromString(decodeURIComponent(image.src.split(',').slice(1).join(',')), 'image/svg+xml');
    const canvas = svg.querySelector('svg > svg:not(.vd-legend-svg)')!;
    const legend = svg.querySelector('.vd-legend-svg')!;
    return {
      title: svg.querySelector('.vd-figure-title')?.textContent,
      subtitle: svg.querySelector('.vd-figure-subtitle')?.textContent,
      labels: legend.textContent,
      visibleItems: [...legend.querySelectorAll<SVGElement>('.vd-legend-item')].every(item => Number(item.style.opacity) === 1),
      correctSwatches: [...legend.querySelectorAll<SVGElement>('rect')].every(item => item.style.fill === item.getAttribute('fill')),
      legendAbove: Number(legend.getAttribute('y')) + Number(legend.getAttribute('height')) <= Number(canvas.getAttribute('y')) + 1,
      height: svg.documentElement.getAttribute('height'),
      loaded: image.complete && image.naturalWidth > 0,
    };
  });
  expect(details).toMatchObject({ title: 'Regional totals', subtitle: 'Saved heading and legend', legendAbove: true, visibleItems: true, correctSwatches: true, loaded: true, height: '300' });
  expect(details.labels).toContain('North');
  expect(details.labels).toContain('South');
});
