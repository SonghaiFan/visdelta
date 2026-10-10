import { test, expect } from '@playwright/test';

for (const width of [1100, 390]) {
  test(`style gallery fits at ${width}px in every theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/docs/.vitepress/dist/chart-style.html');
    for (const name of ['Paper', 'Dark', 'Editorial', 'D3']) {
      await page.locator('.style-gallery-picker button').filter({ hasText: name }).click();
      await expect(page.locator('.style-gallery-status')).toContainText(`${name} active`);
      const plots = await page.locator('.style-gallery-chart svg.vd-chart').evaluateAll(nodes => nodes.map(svg => {
        const rect = svg.querySelector('clipPath[id^="vd-mark-clip"] rect');
        return { width: svg.getBoundingClientRect().width, plot: Number(rect.getAttribute('width')), scale: svg.getScreenCTM().a };
      }));
      expect(plots).toHaveLength(5);
      for (const plot of plots) {
        expect(plot.plot / plot.width).toBeGreaterThan(0.55);
        expect(plot.scale).toBeCloseTo(1, 2);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.style-gallery-charts').screenshot({ path: `test-results/gallery-${name}-${width}.png` });
    }
  });
}

for (const theme of ['d3', 'paper', 'dark', 'editorial']) {
  test(`${theme}: compact plots retain space, readable labels and reversible resize`, async ({ page }) => {
    await page.goto('/tests/fixtures/runtime.html');
    await page.waitForSelector('rect.vd-bar');
    const results = await page.evaluate(async theme => {
      const api = await import('/dist/visdelta.esm.js');
      document.body.innerHTML = '';
      document.body.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px';
      const rows = [
        { id: 'A', value: 10, next: 25, region: 'North' },
        { id: 'B', value: 30, next: 15, region: 'South' }
      ];
      const results = [];
      for (const type of ['bar', 'point', 'line', 'area', 'unit']) {
        const target = document.createElement('div');
        target.style.width = '240px'; document.body.append(target);
        const base = type === 'unit'
          ? api.unit(rows).value('value').group('region').layout('bar').color('region')
          : api[type](rows).x('id', { title: 'Category' }).y('value', { title: 'Value' });
        const from = ['bar', 'point'].includes(type) ? base.color('region') : base;
        const to = type === 'unit' ? from : from.y('next', { title: 'Next value' });
        const change = await api.transition(from, to, { target, height: 240, chartStyle: api.chartStylePresets[theme] });
        const inspect = () => {
          const svg = target.querySelector('svg.vd-chart');
          const box = svg.getBoundingClientRect();
          const clip = svg.querySelector('clipPath[id^="vd-mark-clip"] rect');
          const text = [...svg.querySelectorAll('.vd-x-label,.vd-y-label,.vd-legend text')]
            .filter(node => getComputedStyle(node).opacity !== '0' && node.textContent);
          return {
            width: Number(clip.getAttribute('width')), height: Number(clip.getAttribute('height')),
            position: svg.querySelector('.vd-legend').dataset.position,
            labelsInside: text.every(node => {
              const b = node.getBoundingClientRect();
              return b.left >= box.left - 1 && b.right <= box.right + 1 && b.top >= box.top - 1 && b.bottom <= box.bottom + 1;
            }),
            font: getComputedStyle(svg.querySelector('.vd-x-label')).fontSize,
            frame: svg.querySelector('.vd-frame').getAttribute('transform')
          };
        };
        change.progress(1); const compact = inspect();
        change.progress(0.4); const first = inspect();
        change.progress(0.8); change.progress(0.4); const repeated = inspect();
        target.style.width = '800px'; change.resize(); change.progress(1); const wide = inspect();
        target.style.width = '240px'; change.resize(); change.progress(1); const restored = inspect();
        results.push({ type, compact, first, repeated, wide, restored });
      }
      return results;
    }, theme);
    await page.screenshot({ path: `test-results/responsive-${theme}.png` });
    for (const result of results) {
      expect(result.compact.width, result.type).toBeGreaterThan(140);
      expect(result.compact.height, result.type).toBeGreaterThan(130);
      expect(result.compact.labelsInside, JSON.stringify(result)).toBe(true);
      expect(result.restored).toEqual(result.compact);
      expect(result.first).toEqual(result.repeated);
      expect(result.wide.font).toBe(result.compact.font);
      if (['bar', 'point', 'unit'].includes(result.type)) {
        expect(result.compact.position).toBe('top');
        if (theme === 'paper') expect(result.wide.position, JSON.stringify(result)).toBe('right');
      }
    }
  });
}
