import { test, expect } from '@playwright/test';
import { scenarios } from '../../examples/area/scenarios.js';

const ready = async page => {
  // The playground initializes when it approaches the viewport.
  await page.locator('#chart').scrollIntoViewIfNeeded();
  await expect(page.locator('#status')).toHaveText('Ready');
};
const snapshot = page => page.locator('#chart svg').evaluate(svg =>
  Array.from(svg.querySelectorAll('path.vd-area, .tick, .vd-legend-item')).map(node => ({
    tag: node.tagName,
    text: node.textContent,
    attrs: Array.from(node.attributes).map(attr => [attr.name, attr.value]).sort(),
    opacity: node.style.opacity
  })));

for (const sample of scenarios) {
  test(`area lab ${sample.id}: editable pair and reversible seek`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/docs/.vitepress/dist/area-lab.html#${sample.id}`);
    await ready(page);
    await expect(page.locator('#scenario option')).toHaveCount(scenarios.length);
    const editor = page.getByRole('textbox', { name: 'Editable VisDelta code' });
    await expect(editor).toHaveValue(sample.code);

    const start = await snapshot(page);
    await page.locator('#progress').fill('0.37');
    const direct = await snapshot(page);
    expect(direct).not.toEqual(start);
    const areaPaths = await page.locator('#chart path.vd-area').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('d') || ''));
    expect(areaPaths.length).toBeGreaterThan(0);
    for (const path of areaPaths) {
      expect(path).toMatch(/^M/);
      expect(path).not.toMatch(/NaN|undefined/);
    }
    await page.locator('#end').click();
    expect(await snapshot(page)).not.toEqual(start);
    await page.locator('#progress').fill('0.2');
    await page.locator('#progress').fill('0.37');
    expect(await snapshot(page)).toEqual(direct);
    await page.locator('#start').click();
    expect(await snapshot(page)).toEqual(start);

    await editor.fill(sample.code.replace('2010-02-01', '2010-01-01'));
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    await expect(editor).toHaveValue(/2010-01-01/);
    await page.locator('#reset').click();
    await ready(page);
    await expect(editor).toHaveValue(sample.code);
    expect(errors).toEqual([]);
  });
}

test('area split and merge are the same cached transition in reverse', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const frames = await page.evaluate(async () => {
    const { area, transition } = VisDelta;
    document.body.innerHTML = '<div id="split"></div><div id="merge"></div>';
    const rows = [
      { period: 'Q1', region: 'North', value: 12 },
      { period: 'Q1', region: 'South', value: 8 },
      { period: 'Q2', region: 'North', value: 18 },
      { period: 'Q2', region: 'South', value: 11 },
      { period: 'Q3', region: 'North', value: 14 },
      { period: 'Q3', region: 'South', value: 16 }
    ];
    const detail = area(rows).x('period').y('value').key(['period', 'region'])
      .breakdown('region', { color: ['#1c6ae4', '#fa4d1d'] });
    const total = detail.rollup();
    const options = target => ({ target, height: 360 });
    const split = await transition(total, detail, options('#split'));
    const merge = await transition(detail, total, options('#merge'));
    const geometry = selector => [...document.querySelectorAll(
      `${selector} path.vd-area, ${selector} path.vd-area-divider`
    )]
      .map(node => ({
        className: node.getAttribute('class'),
        key: node.getAttribute('data-key'),
        d: node.getAttribute('d'),
        fill: node.getAttribute('fill'),
        opacity: Number(node.style.opacity),
        dash: node.getAttribute('stroke-dasharray'),
        offset: node.hasAttribute('stroke-dashoffset')
          ? Number(Number(node.getAttribute('stroke-dashoffset')).toFixed(9))
          : null
      }))
      .sort((a, b) => `${a.className}:${a.key}`.localeCompare(`${b.className}:${b.key}`));
    return [0, 0.17, 0.5, 0.83, 1].map(progress => {
      split.progress(progress);
      merge.progress(1 - progress);
      return { split: geometry('#split'), merge: geometry('#merge') };
    });
  });
  for (const frame of frames) expect(frame.merge).toEqual(frame.split);
});

test('area custom stream offset and order move the same boundaries in exact reverse', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { area, transition } = VisDelta;
    document.body.innerHTML = '<div id="forward"></div><div id="reverse"></div>';
    const rows = [
      { period: 'Q1', industry: 'A', value: 10 },
      { period: 'Q1', industry: 'B', value: 3 },
      { period: 'Q1', industry: 'C', value: 7 },
      { period: 'Q2', industry: 'A', value: 4 },
      { period: 'Q2', industry: 'B', value: 12 },
      { period: 'Q2', industry: 'C', value: 5 },
      { period: 'Q3', industry: 'A', value: 8 },
      { period: 'Q3', industry: 'B', value: 6 },
      { period: 'Q3', industry: 'C', value: 15 }
    ];
    const stacked = area(rows).x('period').y('value').key(['period', 'industry'])
      .breakdown('industry', { color: ['#d73027', '#fee08b', '#1a9850'] });
    const sourceStream = stacked.layout('stream', { offset: 'wiggle', order: 'insideOut' });
    const targetStream = stacked.layout('stream', { offset: 'silhouette', order: 'appearance' });
    const options = target => ({ target, height: 360 });
    const forward = await transition(sourceStream, targetStream, options('#forward'));
    const reverse = await transition(targetStream, sourceStream, options('#reverse'));
    const geometry = selector => [...document.querySelectorAll(`${selector} path.vd-area`)]
      .map(node => ({
        key: node.getAttribute('data-key'),
        d: node.getAttribute('d'),
        fill: node.getAttribute('fill'),
        opacity: Number(node.style.opacity)
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const frames = [0, 0.2, 0.5, 0.8, 1].map(progress => {
      forward.progress(progress);
      reverse.progress(1 - progress);
      return { forward: geometry('#forward'), reverse: geometry('#reverse') };
    });
    forward.progress(0);
    const start = geometry('#forward').map(mark => mark.d);
    forward.progress(0.5);
    const middle = geometry('#forward').map(mark => mark.d);
    forward.progress(1);
    const end = geometry('#forward').map(mark => mark.d);
    return { frames, start, middle, end };
  });

  for (const frame of result.frames) expect(frame.reverse).toEqual(frame.forward);
  expect(result.middle).not.toEqual(result.start);
  expect(result.middle).not.toEqual(result.end);
  for (const path of [...result.start, ...result.middle, ...result.end]) {
    expect(path).toMatch(/^M/);
    expect(path).not.toMatch(/NaN|undefined/);
  }
});

test('area focus fits selected cells with one camera without removing area cells', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/area-lab.html#focus');
  await ready(page);
  const count = await page.locator('#chart path.vd-area').count();
  await page.locator('#end').click();
  await expect(page.locator('#chart path.vd-area')).toHaveCount(count);
  const fit = await page.locator('#chart svg').evaluate(svg => {
    const plot = svg.querySelector('clipPath[id^="vd-mark-clip-"] rect');
    const selected = [...svg.querySelectorAll('path.vd-area')]
      .filter(node => Number(node.__data__?.row?.year) === 2009)
      .map(node => node.getBBox());
    const bounds = {
      x0: Math.min(...selected.map(box => box.x)),
      y0: Math.min(...selected.map(box => box.y)),
      x1: Math.max(...selected.map(box => box.x + box.width)),
      y1: Math.max(...selected.map(box => box.y + box.height))
    };
    return {
      bounds,
      width: Number(plot?.getAttribute('width')),
      height: Number(plot?.getAttribute('height'))
    };
  });
  expect((fit.bounds.x0 + fit.bounds.x1) / 2).toBeCloseTo(fit.width / 2, 1);
  expect((fit.bounds.y0 + fit.bounds.y1) / 2).toBeCloseTo(fit.height / 2, 1);
});

test('area axis titles align to the plot frame and stay clear of y-axis ticks', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/area-lab.html#merge');
  await ready(page);

  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    await page.locator('#progress').fill(String(progress));
    const frame = await page.locator('#chart svg').evaluate(svg => {
      const title = svg.querySelector('.vd-y-label')?.getBoundingClientRect();
      const xTitle = svg.querySelector('.vd-x-label')?.getBoundingClientRect();
      const plot = svg.querySelector('.vd-frame')?.getBoundingClientRect();
      if (!title || !xTitle || !plot) return null;
      const overlaps = [...svg.querySelectorAll('.vd-y-axis .tick text')]
        .filter(node => {
          const tick = node.getBoundingClientRect();
          return title.left < tick.right && title.right > tick.left &&
            title.top < tick.bottom && title.bottom > tick.top;
        })
        .map(node => node.textContent);
      return {
        overlaps,
        leftGap: title.left - plot.left,
        rightGap: plot.right - xTitle.right
      };
    });
    expect(frame).not.toBeNull();
    expect(frame.overlaps).toEqual([]);
    expect(frame.leftGap).toBeCloseTo(0, 1);
    expect(frame.rightGap).toBeCloseTo(0, 1);
  }
});

test('area is borderless by default at endpoints and during ordinary transitions', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/area-lab.html#highlight');
  await ready(page);
  for (const progress of [0, 0.5, 1]) {
    await page.locator('#progress').fill(String(progress));
    await expect(page.locator('#chart path.vd-area-edge')).toHaveCount(0);
    const strokes = await page.locator('#chart path.vd-area-cell')
      .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).stroke));
    expect(strokes.every(stroke => stroke === 'none')).toBe(true);
  }
});

test('area split draws a thin contrast divider only between endpoints', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/area-lab.html#split');
  await ready(page);
  const read = async progress => {
    await page.locator('#progress').fill(String(progress));
    return page.locator('#chart').evaluate(chart => {
      const node = chart.querySelector('path.vd-area-divider');
      const borderCount = chart.querySelectorAll('path.vd-area-edge').length;
      if (!node) return { count: 0, length: 0, offset: 0, width: '', blend: '', borderCount };
      const style = getComputedStyle(node);
      return {
        count: chart.querySelectorAll('path.vd-area-divider').length,
        length: node.getTotalLength(),
        offset: Number(node.getAttribute('stroke-dashoffset')),
        width: style.strokeWidth,
        blend: style.mixBlendMode,
        opacity: Number(style.opacity),
        borderCount
      };
    });
  };
  const result = {
    start: await read(0),
    drawing: await read(0.16),
    cut: await read(0.32),
    after: await read(0.5),
    end: await read(1)
  };

  expect(result.start.count).toBe(0);
  expect(result.drawing.count).toBe(4);
  expect(result.drawing.offset).toBeGreaterThan(0);
  expect(result.drawing.offset).toBeLessThan(result.drawing.length);
  expect(result.drawing.opacity).toBeGreaterThan(0);
  expect(result.cut.offset).toBeCloseTo(0, 3);
  expect(result.cut.opacity).toBeCloseTo(1, 3);
  expect(result.after.offset).toBeCloseTo(0, 3);
  expect(result.after.opacity).toBeGreaterThan(0);
  expect(result.after.opacity).toBeLessThan(1);
  expect(result.end.count).toBe(0);
  expect(result.drawing.width).toBe('1px');
  expect(result.drawing.blend).toBe('difference');
  expect([result.start, result.drawing, result.cut, result.after, result.end]
    .every(frame => frame.borderCount === 0)).toBe(true);
});

test('area divider marks only internal same-direction stack boundaries', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const layers = await page.evaluate(async () => {
    const { area, transition } = VisDelta;
    const rows = [
      { period: 'Q1', region: 'positive-a', value: 12 },
      { period: 'Q1', region: 'negative', value: -5 },
      { period: 'Q1', region: 'positive-b', value: 8 },
      { period: 'Q2', region: 'positive-a', value: 18 },
      { period: 'Q2', region: 'negative', value: -7 },
      { period: 'Q2', region: 'positive-b', value: 11 }
    ];
    const detail = area(rows).x('period').y('value').key(['period', 'region'])
      .breakdown('region', { color: ['#1c6ae4', '#888', '#fa4d1d'] });
    const change = await transition(detail.rollup(), detail, {
      target: document.body.appendChild(document.createElement('div')),
      height: 360
    });
    change.progress(0.5);
    return [...document.querySelectorAll('path.vd-area-divider')]
      .map(node => ({
        layer: node.getAttribute('data-layer-key'),
        opacity: Number(getComputedStyle(node).opacity)
      }));
  });

  expect(layers.map(({ layer }) => layer)).toEqual(['positive-a']);
  expect(layers.every(({ opacity }) => opacity > 0 && opacity < 1)).toBe(true);
});

test('area restore, prepend, and append keep both boundaries in observation order', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { area, transition } = VisDelta;
    document.body.innerHTML = '<div id="restore"></div><div id="prepend"></div><div id="append"></div>';
    const rows = [
      { id: 'Q1', period: 'Q1', sales: 28 },
      { id: 'Q2', period: 'Q2', sales: 47 },
      { id: 'Q3', period: 'Q3', sales: 39 },
      { id: 'Q4', period: 'Q4', sales: 66 },
      { id: 'Q5', period: 'Q5', sales: 58 },
      { id: 'Q6', period: 'Q6', sales: 79 }
    ];
    const base = area(rows).x('period').y('sales').key('id');
    const filtered = base.where({ field: 'id', oneOf: ['Q1', 'Q2', 'Q5', 'Q6'] });
    const prepended = base.data([{ id: 'Q0', period: 'Q0', sales: 19 }, ...rows]);
    const appended = base.data([...rows, { id: 'Q7', period: 'Q7', sales: 88 }]);
    const options = target => ({ target, height: 360 });
    const transitions = [
      await transition(filtered, base, options('#restore')),
      await transition(base, prepended, options('#prepend')),
      await transition(base, appended, options('#append'))
    ];
    transitions.forEach(value => value.progress(0.49));

    const pathPoints = selector => [...document.querySelectorAll(`${selector} path.vd-area-cell`)]
      .map(path => [...(path.getAttribute('d') || '').matchAll(
        /(-?\d*\.?\d+(?:e[-+]?\d+)?),(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi
      )].map(match => ({ x: Number(match[1]), y: Number(match[2]) })));
    const orderedCell = points => {
      if (points.length !== 6) return false;
      const upper = points.slice(0, 3);
      const lower = points.slice(3);
      return upper.every((point, index) => index === 0 || point.x >= upper[index - 1].x) &&
        lower.every((point, index) => index === 0 || point.x <= lower[index - 1].x);
    };
    const validCells = (cells, observationCount) =>
      cells.length === observationCount && cells.every(orderedCell);
    return {
      restore: validCells(pathPoints('#restore'), 6),
      prepend: validCells(pathPoints('#prepend'), 7),
      append: validCells(pathPoints('#append'), 7),
      paths: ['#restore', '#prepend', '#append'].map(pathPoints)
    };
  });

  expect(result.restore).toBe(true);
  expect(result.prepend).toBe(true);
  expect(result.append).toBe(true);
  for (const cells of result.paths) {
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  }
});

test('area add/remove and restore/filter reuse the same frames backward', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { area, transition } = VisDelta;
    document.body.innerHTML = '<div id="add"></div><div id="remove"></div><div id="restore"></div><div id="filter"></div>';
    const rows = [
      { id: 'Q1', period: 'Q1', sales: 28 },
      { id: 'Q2', period: 'Q2', sales: 47 },
      { id: 'Q3', period: 'Q3', sales: 39 },
      { id: 'Q4', period: 'Q4', sales: 66 },
      { id: 'Q5', period: 'Q5', sales: 58 },
      { id: 'Q6', period: 'Q6', sales: 79 }
    ];
    const base = area(rows).x('period').y('sales').key('id');
    const withQ7 = base.data([...rows, { id: 'Q7', period: 'Q7', sales: 88 }]);
    const filtered = base.where({ field: 'id', oneOf: ['Q1', 'Q2', 'Q5', 'Q6'] });
    const options = target => ({ target, height: 360 });
    const add = await transition(base, withQ7, options('#add'));
    const remove = await transition(withQ7, base, options('#remove'));
    const restore = await transition(filtered, base, options('#restore'));
    const filter = await transition(base, filtered, options('#filter'));
    const geometry = selector => ({
        paths: [...document.querySelectorAll(`${selector} path.vd-area`)]
          .map(node => ({
            className: node.getAttribute('class'),
            key: node.getAttribute('data-key'),
            d: node.getAttribute('d'),
            opacity: node.style.opacity
          }))
          .sort((a, b) => `${a.className}:${a.key}`.localeCompare(`${b.className}:${b.key}`)),
        xTicks: [...document.querySelectorAll(`${selector} .vd-x-axis .tick`)].map(tick => ({
          text: tick.textContent,
          transform: (tick.getAttribute('transform') || '').replace(
            /-?\d+(?:\.\d+)?/g,
            value => String(Number(Number(value).toFixed(9)))
          ),
          opacity: tick.style.opacity
        }))
      });
    return [0, 0.17, 0.49, 0.83, 1].map(progress => {
      add.progress(progress);
      remove.progress(1 - progress);
      restore.progress(progress);
      filter.progress(1 - progress);
      return {
        add: geometry('#add'),
        remove: geometry('#remove'),
        restore: geometry('#restore'),
        filter: geometry('#filter')
      };
    });
  });

  for (const frame of result) {
    expect(frame.remove).toEqual(frame.add);
    expect(frame.filter).toEqual(frame.restore);
  }
});

test('area filter preserves connected cells, gaps, and the no-isolated-area rule', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { area, transition } = VisDelta;
    document.body.innerHTML = '<div id="adjacent"></div><div id="across"></div><div id="isolated"></div>';
    const rows = [
      { id: 'Q1', period: 'Q1', sales: 28 },
      { id: 'Q2', period: 'Q2', sales: 47 },
      { id: 'Q3', period: 'Q3', sales: 39 },
      { id: 'Q4', period: 'Q4', sales: 66 },
      { id: 'Q5', period: 'Q5', sales: 58 },
      { id: 'Q6', period: 'Q6', sales: 79 }
    ];
    const base = area(rows).x('period').y('sales').key('id');
    const selector = { field: 'id', oneOf: ['Q1', 'Q2', 'Q5', 'Q6'] };
    const options = target => ({ target, height: 360 });
    const adjacent = await transition(base, base.where(selector), options('#adjacent'));
    const across = await transition(base, base.where(selector).connect('across'), options('#across'));
    const isolated = await transition(
      base,
      base.where({ field: 'id', equal: 'Q3' }),
      options('#isolated')
    );
    const coordinates = node => [...(node?.getAttribute('d') || '').matchAll(
      /(-?\d*\.?\d+(?:e[-+]?\d+)?),(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi
    )].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
    const observation = (target, key) => document.querySelector(
      `${target} path.vd-area-cell[data-observation-key="${key}"]`
    );
    adjacent.progress(0);
    const start = {
      Q3: coordinates(observation('#adjacent', 'Q3')),
      Q4: coordinates(observation('#adjacent', 'Q4'))
    };
    adjacent.progress(0.25);
    const middle = {
      Q3: coordinates(observation('#adjacent', 'Q3')),
      Q4: coordinates(observation('#adjacent', 'Q4'))
    };
    adjacent.progress(1);
    across.progress(1);
    isolated.progress(1);
    const cells = target => [...document.querySelectorAll(`${target} path.vd-area-cell`)].map(node => ({
      key: node.getAttribute('data-observation-key'),
      d: node.getAttribute('d'),
      points: coordinates(node),
      box: { x: node.getBBox().x, width: node.getBBox().width }
    }));
    return {
      adjacent: cells('#adjacent'),
      across: cells('#across'),
      isolated: cells('#isolated'),
      start,
      middle
    };
  });

  expect(result.adjacent).toHaveLength(4);
  expect(result.across).toHaveLength(4);
  expect(result.isolated).toHaveLength(0);
  const cell = (cells, key) => cells.find(value => value.key === key);
  const adjacentQ2 = cell(result.adjacent, 'Q2');
  const adjacentQ5 = cell(result.adjacent, 'Q5');
  const acrossQ2 = cell(result.across, 'Q2');
  const acrossQ5 = cell(result.across, 'Q5');
  // The first and last observation of each connected stretch own one half;
  // their outside edge stops at the observation center.
  expect(cell(result.adjacent, 'Q1').points[0].x)
    .toBeCloseTo(cell(result.adjacent, 'Q1').points[1].x, 6);
  expect(adjacentQ2.points[1].x).toBeCloseTo(adjacentQ2.points[2].x, 6);
  expect(adjacentQ5.points[0].x).toBeCloseTo(adjacentQ5.points[1].x, 6);
  expect(cell(result.adjacent, 'Q6').points[1].x)
    .toBeCloseTo(cell(result.adjacent, 'Q6').points[2].x, 6);
  expect(adjacentQ2.box.x + adjacentQ2.box.width).toBeLessThan(adjacentQ5.box.x);
  expect(acrossQ2.box.x + acrossQ2.box.width).toBeCloseTo(acrossQ5.box.x, 5);
  // Q3 and Q4 keep their x positions while their upper boundary moves toward
  // the lower baseline. In SVG coordinates that means y increases downward.
  for (const key of ['Q3', 'Q4']) {
    expect(result.middle[key][1].x).toBeCloseTo(result.start[key][1].x, 6);
    expect(result.middle[key][1].y).toBeGreaterThan(result.start[key][1].y);
    expect(result.middle[key][1].y).toBeLessThan(result.middle[key][4].y);
  }
});

test('every D3 Area curve renders and curve changes interpolate from the real path', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { area, D3_AREA_CURVE_NAMES, transition } = VisDelta;
    const rows = [
      { id: 'Q1', period: 'Q1', sales: 28 },
      { id: 'Q2', period: 'Q2', sales: 47 },
      { id: 'Q3', period: 'Q3', sales: 39 },
      { id: 'Q4', period: 'Q4', sales: 66 },
      { id: 'Q5', period: 'Q5', sales: 58 },
      { id: 'Q6', period: 'Q6', sales: 79 }
    ];
    const base = area(rows).x('period').y('sales').key('id').curve('curveLinear');
    const frames = [];
    for (const name of D3_AREA_CURVE_NAMES) {
      document.body.innerHTML = '<div id="target"></div>';
      const change = await transition(base, base.curve(name), {
        target: '#target', height: 360
      });
      const geometry = () => [...document.querySelectorAll('#target path.vd-area-cell')]
        .map(node => node.getAttribute('d') || '');
      change.progress(0);
      const start = geometry();
      change.progress(0.5);
      const middle = geometry();
      const strategy = document.querySelector('#target path.vd-area-cell')
        ?.getAttribute('data-area-transition');
      change.progress(1);
      const end = geometry();
      frames.push({ name, start, middle, end, strategy });
      change.destroy();
    }
    return frames;
  });

  expect(result).toHaveLength(19);
  for (const frame of result) {
    expect(frame.start).toHaveLength(6);
    expect(frame.end).toHaveLength(6);
    for (const path of [...frame.start, ...frame.middle, ...frame.end]) {
      expect(path).toMatch(/^M/);
      expect(path).not.toMatch(/NaN|undefined/);
    }
    if (frame.name !== 'curveLinear') {
      expect(frame.strategy).toBe('change-curve');
      expect(frame.middle).not.toEqual(frame.start);
      expect(frame.middle).not.toEqual(frame.end);
    }
  }
});

test('stacked area uses cumulative boundaries and explicit color', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/area-lab.html#split');
  await ready(page);
  await page.locator('#end').click();
  await expect(page.locator('#chart path.vd-area-cell')).toHaveCount(190);
  await expect(page.locator('#chart path.vd-area-edge')).toHaveCount(0);
  await expect(page.locator('#chart .vd-legend-item')).toHaveCount(5);
  const paths = await page.locator('#chart path.vd-area-cell').evaluateAll(nodes => nodes.map(node => ({
    key: node.getAttribute('data-key'),
    layer: node.getAttribute('data-layer-key'),
    fill: node.getAttribute('fill'),
    length: node.getTotalLength()
  })));
  expect(new Set(paths.map(path => path.layer)).size).toBe(5);
  expect(new Set(paths.map(path => path.fill)).size).toBe(5);
  expect(paths.every(path => path.length > 0)).toBe(true);
});

test('area lab loads prepared tidy unemployment observations', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.url().endsWith('/data/unemployment.csv')) requests.push(request.url());
  });
  await page.goto('/docs/.vitepress/dist/area-lab.html#split');
  await ready(page);
  await expect(page.locator('#editor')).toHaveValue(/\.\/data\/unemployment\.csv/);
  await page.locator('#end').click();

  const rows = await page.locator('#chart path.vd-area-cell').evaluateAll(nodes => nodes.map(node => ({
    date: node.__data__?.row?.date,
    year: node.__data__?.row?.year,
    industry: node.__data__?.row?.industry,
    unemployed: node.__data__?.row?.unemployed,
    share: node.__data__?.row?.share
  })));
  expect(rows).toHaveLength(190);
  expect(rows.every(row => row.date && row.year && row.industry &&
    Number.isFinite(row.unemployed) && Number.isFinite(row.share))).toBe(true);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).pathname).toBe('/docs/.vitepress/dist/data/unemployment.csv');
});
