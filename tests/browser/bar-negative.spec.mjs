import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
});

// Bars start at zero, or below it: a negative value must extend under the
// baseline inside the plot rather than being clipped by a zero floor.
for (const layout of ['simple', 'grouped', 'horizontal']) {
  test(`${layout} bars keep negative values visible below the zero baseline`, async ({ page }) => {
    const result = await page.evaluate(async layout => {
      const vd = await import('/dist/visdelta.esm.js');
      const rows = [
        { region: 'North', year: '2022', profit: 12 },
        { region: 'South', year: '2022', profit: -4 },
        { region: 'North', year: '2023', profit: 7 },
        { region: 'South', year: '2023', profit: -9 }
      ];
      let chart = vd.bar(rows).x('region').y('profit').key(['region', 'year']);
      if (layout === 'grouped') chart = chart.breakdown('year').color('year').layout('grouped');
      else chart = chart.where({ year: '2023' });
      if (layout === 'horizontal') chart = chart.flip();
      const host = document.createElement('div');
      host.style.width = '640px';
      document.body.append(host);
      const change = await vd.transition(chart, chart, { target: host, height: 360 });
      change.progress(1);
      const frame = host.querySelector('.vd-frame').getBoundingClientRect();
      const bars = [...host.querySelectorAll('rect.vd-bar')].map(node => {
        const box = node.getBoundingClientRect();
        return { value: node.__data__.profit, box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height } };
      });
      const ticks = [...host.querySelectorAll('g.vd-axis .tick text')].map(node => node.textContent.replace('−', '-'));
      change.destroy();
      host.remove();
      return { frame: { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right }, bars, ticks };
    }, layout);

    const negatives = result.bars.filter(bar => bar.value < 0);
    const positives = result.bars.filter(bar => bar.value > 0);
    expect(negatives.length).toBeGreaterThan(0);
    expect(result.ticks.some(tick => Number(tick) < 0)).toBe(true);
    for (const bar of result.bars) {
      expect(bar.box.width).toBeGreaterThan(0);
      expect(bar.box.height).toBeGreaterThan(0);
      expect(bar.box.top).toBeGreaterThanOrEqual(result.frame.top - 1);
      expect(bar.box.bottom).toBeLessThanOrEqual(result.frame.bottom + 1);
      expect(bar.box.left).toBeGreaterThanOrEqual(result.frame.left - 1);
      expect(bar.box.right).toBeLessThanOrEqual(result.frame.right + 1);
    }
    // Negative bars sit on the other side of the shared zero baseline.
    if (layout === 'horizontal') {
      const zero = Math.min(...positives.map(bar => bar.box.left));
      for (const bar of negatives) expect(bar.box.right).toBeLessThanOrEqual(zero + 1);
    } else {
      const zero = Math.max(...positives.map(bar => bar.box.bottom));
      for (const bar of negatives) expect(bar.box.top).toBeGreaterThanOrEqual(zero - 1);
    }
  });
}

test('category labels stay clear of negative bars and inside the chart through a transition', async ({ page }) => {
  const frames = await page.evaluate(async () => {
    const vd = await import('/dist/visdelta.esm.js');
    const rows = [
      { region: 'North', profit: 12, revenue: 30 },
      { region: 'South', profit: -4, revenue: 22 },
      { region: 'East', profit: 7, revenue: 26 },
      { region: 'West', profit: -9, revenue: 18 }
    ];
    const revenue = vd.bar(rows).x('region').y('revenue').key('region');
    const profit = revenue.y('profit');
    const truncated = revenue.y('revenue', { domain: [15, 35] });
    const host = document.createElement('div');
    host.style.width = '640px';
    document.body.append(host);
    const read = () => {
      const svg = host.querySelector('svg').getBoundingClientRect();
      const bars = [...host.querySelectorAll('rect.vd-bar')].map(node => node.getBoundingClientRect());
      const labels = [...host.querySelectorAll('g.vd-axis .tick text')]
        .filter(node => /^[A-Z][a-z]+$/.test(node.textContent))
        .map(node => node.getBoundingClientRect());
      return {
        labels: labels.length,
        inside: labels.every(box => box.top >= svg.top - 1 && box.bottom <= svg.bottom + 1),
        clear: labels.every(box => bars.every(bar => box.top >= bar.bottom - 1 || box.bottom <= bar.top + 1 || box.right <= bar.left + 1 || box.left >= bar.right - 1))
      };
    };
    const results = {};
    const change = await vd.transition(revenue, profit, { target: host, height: 360 });
    for (const value of [0, 0.5, 1, 0]) {
      change.progress(value);
      results[`profit@${value}`] = read();
    }
    change.destroy();
    const cut = await vd.transition(truncated, truncated, { target: host, height: 360 });
    cut.progress(1);
    results.truncated = read();
    cut.destroy();
    host.remove();
    return results;
  });
  for (const [name, frame] of Object.entries(frames)) {
    expect(frame.labels, name).toBe(4);
    expect(frame.inside, name).toBe(true);
  }
  // Endpoints must be clean; a mid-frame may pass labels while bars move.
  expect(frames['profit@1'].clear).toBe(true);
  expect(frames['profit@0'].clear).toBe(true);
});
