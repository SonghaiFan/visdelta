import { test, expect } from '@playwright/test';

test('design warnings are automatic and a discouraged bar chart still renders', async ({ page }) => {
  const logs = [];
  page.on('console', message => { if (message.type() === 'warning') logs.push(message.text()); });
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { bar, transition } = await import('/dist/index.js');
    const host = document.querySelector('#chart');
    const events = [];
    host.addEventListener('visdelta:warnings', event => events.push(event.detail));
    const chart = bar([{ category: 'A', value: 12 }, { category: 'B', value: 14 }])
      .x('category').y('value', { domain: [10, 20] });
    const pair = await transition(chart, chart, { target: host });
    pair.progress(1);
    const result = { warnings: JSON.parse(host.querySelector('[data-visdelta-warnings]').getAttribute('data-visdelta-warnings')), events,
      marks: host.querySelectorAll('svg rect').length };
    pair.destroy();
    return result;
  });
  expect(result.warnings.map(item => item.code)).toEqual(['bar.truncated-baseline']);
  expect(result.events.some(items => items.some(item => item.code === 'bar.truncated-baseline'))).toBe(true);
  expect(result.marks).toBeGreaterThan(1);
  expect(logs.some(message => message.includes('[VisDelta bar.truncated-baseline]'))).toBe(true);
});

for (const width of [360, 1100]) {
  test(`default category colors and full legend agree at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/tests/fixtures/isolated.html');
    const result = await page.evaluate(async () => {
      const { bar, transition } = await import('/dist/index.js');
      const host = document.querySelector('#chart');
      const rows = Array.from({ length: 8 }, (_, i) => ({ group: `G${i}`, y: i + 1 }));
      const chart = bar(rows).x('group').y('y').color('group');
      const pair = await transition(chart, chart.where({ field: 'y', gte: 3 }), { target: host });
      const read = () => ({
        labels: [...host.querySelectorAll('.vd-legend-item text')].map(node => node.textContent),
        marks: [...host.querySelectorAll('rect.vd-bar')].map(node => ({ key: node.__data__.group, fill: getComputedStyle(node).fill })),
        swatches: [...host.querySelectorAll('.vd-legend-item rect')].map(node => getComputedStyle(node).fill)
      });
      pair.progress(0); const start = read();
      pair.progress(1); const end = read();
      pair.progress(0); const reverse = read();
      pair.resize(); const resized = read();
      pair.destroy();
      const explicit = chart.color('group', { scheme: 'Tableau10' });
      const other = await transition(explicit, explicit, { target: host });
      other.progress(1); const authored = read();
      other.destroy();
      return { start, end, reverse, resized, authored };
    });
    expect(result.start.labels).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']);
    expect(result.start.marks).toHaveLength(8);
    expect(new Set(result.start.marks.map(mark => mark.fill)).size).toBe(8);
    expect(result.end.labels).toEqual(result.start.labels);
    expect(result.reverse).toEqual(result.start);
    expect(result.resized).toEqual(result.start);
    expect(result.authored.labels).toHaveLength(8);
  });
}

for (const width of [360, 1100]) {
  test(`ranked stacked area keeps geometry and full legend aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/tests/fixtures/isolated.html');
    const result = await page.evaluate(async () => {
      const { area, transition } = await import('/dist/index.js');
      const host = document.querySelector('#chart');
      const rows = [1, 2, 3].flatMap(x => Array.from({ length: 8 }, (_, i) => ({ x, group: `G${i}`, y: (i + 1) * x })));
      const chart = area(rows).x('x').y('y').breakdown('group').color('group');
      const pair = await transition(chart, chart.where({ field: 'x', gte: 2 }), { target: host });
      const snapshot = () => ({
        labels: [...host.querySelectorAll('.vd-legend-item text')].map(node => node.textContent),
        cells: [...host.querySelectorAll('path.vd-area')].map(node => ({
          d: node.getAttribute('d'), fill: getComputedStyle(node).fill,
          series: node.__data__.layer?.value,
          lower: node.__data__.center?.y0,
          upper: node.__data__.center?.y1
        }))
      });
      pair.progress(0); const start = snapshot();
      pair.progress(0.4); const middle = snapshot();
      pair.progress(1); const end = snapshot();
      pair.progress(0.4); const rewind = snapshot();
      pair.progress(0); const reverse = snapshot();
      pair.resize(); const resized = snapshot();
      pair.destroy();
      return { start, middle, end, rewind, reverse, resized };
    });
    expect(result.start.labels).toEqual(['G7', 'G6', 'G5', 'G4', 'G3', 'G2', 'G1', 'G0']);
    expect(result.start.cells.length).toBeGreaterThan(0);
    expect(result.start.cells.filter(cell => cell.series === 'G7').every(cell => cell.lower === 0)).toBe(true);
    expect(result.start.cells.every(cell => !/NaN|undefined/.test(cell.d))).toBe(true);
    expect(result.end.labels).toEqual(result.start.labels);
    expect(result.rewind).toEqual(result.middle);
    expect(result.reverse).toEqual(result.start);
    expect(result.resized).toEqual(result.start);
  });
}
