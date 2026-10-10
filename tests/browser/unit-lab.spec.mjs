import { test, expect } from '@playwright/test';
import { expectEditorCode, setEditorCode } from './code-editor.mjs';
import { scenarios } from '../../examples/unit/scenarios.js';

const ready = async (page, compileTimeout = 5000) => {
  await expect(page.getByRole('tab', { name: 'Unit', exact: true }))
    .toHaveAttribute('aria-selected', 'true');
  await page.locator('#chart').scrollIntoViewIfNeeded();
  await expect(page.locator('#status')).toHaveText('Ready', { timeout: compileTimeout });
};

const unitFills = page => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
  [...new Set(nodes.map(node => getComputedStyle(node).fill))].sort());

const snapshot = page => page.locator('#chart svg').evaluate(svg =>
  Array.from(svg.querySelectorAll('circle.vd-unit, .tick, .vd-legend-item')).map(node => ({
    tag: node.tagName,
    text: node.textContent,
    attrs: Array.from(node.attributes).map(attr => [attr.name, attr.value]).sort(),
    opacity: node.style.opacity
  })));

for (const sample of scenarios) {
  test(`unit lab ${sample.id}: editable pair and reproducible seek`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/docs/.vitepress/dist/playground.html#unit/${sample.id}`);
    await ready(page);
    await expect(page.locator('.playground-category-tabs [role=tab]')).toHaveCount(7);
    const editor = page.getByRole('textbox', { name: 'Editable VisDelta code' });
    await expectEditorCode(editor, sample.code);

    const start = await snapshot(page);
    const startFills = await unitFills(page);
    await page.locator('#progress').fill('0.37');
    const direct = await snapshot(page);
    expect(direct).not.toEqual(start);
    await page.locator('#end').click();
    expect(await snapshot(page)).not.toEqual(start);
    await page.locator('#progress').fill('0.2');
    await page.locator('#progress').fill('0.37');
    expect(await snapshot(page)).toEqual(direct);
    await page.locator('#start').click();
    expect(await snapshot(page)).toEqual(start);

    const editedCode = sample.code.replace(/;\s*$/, '.color("#ff00ff");');
    await setEditorCode(editor, editedCode);
    await expectEditorCode(editor, editedCode);
    // Waiting for input is transient; assert that the edited constant color
    // reaches the marks instead of treating that label as a contract.
    await expect.poll(() => unitFills(page), { timeout: 15_000 }).toEqual(['rgb(255, 0, 255)']);
    await page.locator('#reset').click();
    await expectEditorCode(editor, sample.code);
    await expect.poll(() => unitFills(page), { timeout: 15_000 }).toEqual(startFills);
    expect(errors).toEqual([]);
  });
}

test('unit bar uses category position while every unit keeps equal size', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#unit/bar');
  await ready(page);
  await page.locator('#end').click();

  await expect(page.locator('#chart circle.vd-unit')).toHaveCount(150);
  await expect(page.locator('#chart .vd-x-axis .tick')).toHaveCount(3);
  const result = await page.locator('#chart').evaluate(chart => {
    const marks = [...chart.querySelectorAll('circle.vd-unit')].map(node => ({
      group: node.dataset.groupKey,
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy')),
      r: Number(node.getAttribute('r')),
      screenX: node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2
    }));
    const groups = Object.groupBy(marks, mark => mark.group);
    return {
      radii: [...new Set(marks.map(mark => mark.r))],
      groupCenters: Object.values(groups).map(group =>
        group.reduce((sum, mark) => sum + mark.screenX, 0) / group.length),
      groupYCounts: Object.values(groups).map(group => new Set(group.map(mark => mark.y)).size),
      labels: [...chart.querySelectorAll('.vd-x-axis .tick')].map(node => node.textContent),
      tickCenters: [...chart.querySelectorAll('.vd-x-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return box.left + box.width / 2;
      })
    };
  });

  expect(result.radii).toHaveLength(1);
  expect(new Set(result.groupCenters).size).toBe(3);
  expect(result.groupYCounts.every(count => count > 1)).toBe(true);
  expect(result.labels).toEqual(['setosa', 'versicolor', 'virginica']);
  result.groupCenters.forEach((center, index) => {
    expect(center).toBeCloseTo(result.tickCenters[index], 0);
  });
});

test('Unit forceX uses the declared species scale and keeps one deterministic path', async ({ page }) => {
  const compilingStarted = Date.now();
  await page.goto('/docs/.vitepress/dist/playground.html#unit/force');
  // Four independent authored slots require several 150-mark force solves.
  await ready(page, 15_000);
  await test.info().attach('force-compilation-budget', { body: JSON.stringify({ elapsedMs: Date.now() - compilingStarted, budgetMs: 15_000 }), contentType: 'application/json' });
  const leg = await unitLayoutLeg(page, 'force', true);
  const readPositions = () => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => [node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')])
      .sort((a, b) => a[0].localeCompare(b[0])));
  const positionsAt = async value => {
    await leg.seek(value);
    return readPositions();
  };
  const sampledFrames = [];
  for (const progress of [0, 0.1, 0.3, 0.6, 0.9, 0.99]) {
    sampledFrames.push(await positionsAt(progress));
  }
  sampledFrames.slice(1).forEach((frame, index) => {
    expect(frame).not.toEqual(sampledFrames[index]);
  });

  const beforeForce = sampledFrames[sampledFrames.length - 1];
  expect(await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => [node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')])
      .sort((a, b) => a[0].localeCompare(b[0])))).toEqual(beforeForce);

  await page.locator('#end').click();

  const readLayout = () => page.locator('#chart svg').evaluate(svg => {
    const plot = svg.querySelector('clipPath[id^="vd-mark-clip-"] rect');
    const marks = [...svg.querySelectorAll('circle.vd-unit')].map(node => ({
      key: node.dataset.key,
      species: node.__data__.__row.species,
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy')),
      r: Number(node.getAttribute('r')),
      screenX: node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2
    })).sort((a, b) => a.key.localeCompare(b.key));
    let minimumGap = Infinity;
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        minimumGap = Math.min(minimumGap,
          Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y)
            - marks[i].r - marks[j].r);
      }
    }
    return {
      marks,
      plotWidth: Number(plot?.getAttribute('width')),
      plotHeight: Number(plot?.getAttribute('height')),
      radius: marks[0]?.r,
      centroidX: marks.reduce((sum, mark) => sum + mark.x, 0) / marks.length,
      centroidY: marks.reduce((sum, mark) => sum + mark.y, 0) / marks.length,
      minimumGap,
      bounds: {
        left: Math.min(...marks.map(mark => mark.x - mark.r)),
        right: Math.max(...marks.map(mark => mark.x + mark.r)),
        top: Math.min(...marks.map(mark => mark.y - mark.r)),
        bottom: Math.max(...marks.map(mark => mark.y + mark.r))
      },
      xLabels: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => node.textContent),
      xTickCenters: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [node.textContent, box.left + box.width / 2];
      }),
      yTicks: svg.querySelectorAll('.vd-y-axis .tick').length,
      groupCenters: Object.entries(Object.groupBy(marks, mark => mark.species)).map(([species, group]) => ({
        species,
        center: group.reduce((sum, mark) => sum + mark.screenX, 0) / group.length
      }))
    };
  });

  const first = await readLayout();
  const frameAt099 = new Map(beforeForce.map(([key, x, y]) => [key, { x: Number(x), y: Number(y) }]));
  const largestLastStep = Math.max(...first.marks.map(mark => {
    const before = frameAt099.get(mark.key);
    return Math.hypot(mark.x - before.x, mark.y - before.y);
  }));
  expect(largestLastStep).toBeLessThan(0.25);
  await page.locator('#start').click();
  await page.locator('#end').click();
  const second = await readLayout();

  expect(first.marks).toHaveLength(150);
  expect(new Set(first.marks.map(({ key }) => key)).size).toBe(150);
  const initialRadius = Math.min(12, Math.sqrt(
    first.plotWidth * first.plotHeight * 0.62 / (first.marks.length * Math.PI)
  ));
  expect(first.radius).toBeLessThan(initialRadius);
  expect(first.centroidY).toBeCloseTo(first.plotHeight / 2, 5);
  expect(first.minimumGap).toBeGreaterThan(-0.05);
  expect(first.bounds.left).toBeGreaterThanOrEqual(0);
  expect(first.bounds.right).toBeLessThanOrEqual(first.plotWidth);
  expect(first.bounds.top).toBeGreaterThanOrEqual(0);
  expect(first.bounds.bottom).toBeLessThanOrEqual(first.plotHeight);
  expect(first.xLabels).toEqual(['setosa', 'versicolor', 'virginica']);
  expect(first.yTicks).toBe(0);
  for (const { species, center } of first.groupCenters) {
    const tickCenter = first.xTickCenters.find(([label]) => label === species)?.[1];
    expect(tickCenter, `resolved x-axis tick for ${species}`).toBeDefined();
    expect(Math.abs(center - tickCenter)).toBeLessThan(30);
  }
  expect(second.marks).toEqual(first.marks);

  await page.locator('#start').click();
  await page.locator('#progress').fill('0.37');
  const forwardFrame = await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => [node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')])
      .sort((a, b) => a[0].localeCompare(b[0])));
  await page.locator('#end').click();
  await page.locator('#progress').fill('0.37');
  const reverseFrame = await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => [node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')])
      .sort((a, b) => a[0].localeCompare(b[0])));
  expect(reverseFrame).toEqual(forwardFrame);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/.vitepress/dist/playground.html#unit/force');
  await ready(page);
  await page.locator('#end').click();
  const narrow = await readLayout();
  expect(narrow.marks).toHaveLength(150);
  const narrowInitialRadius = Math.min(12, Math.sqrt(
    narrow.plotWidth * narrow.plotHeight * 0.62 / (narrow.marks.length * Math.PI)
  ));
  expect(narrow.radius).toBeLessThan(narrowInitialRadius);
  expect(narrow.minimumGap).toBeGreaterThan(-0.05);
  expect(narrow.bounds.left).toBeGreaterThanOrEqual(0);
  expect(narrow.bounds.right).toBeLessThanOrEqual(narrow.plotWidth);
  expect(narrow.bounds.top).toBeGreaterThanOrEqual(0);
  expect(narrow.bounds.bottom).toBeLessThanOrEqual(narrow.plotHeight);
  for (const { species, center } of narrow.groupCenters) {
    const tickCenter = narrow.xTickCenters.find(([label]) => label === species)?.[1];
    expect(tickCenter, `narrow resolved x-axis tick for ${species}`).toBeDefined();
    expect(Math.abs(center - tickCenter)).toBeLessThan(30);
  }
});

test('Unit force accepts simultaneous explicit x and y targets', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = [
      { id: 'A-low', species: 'A', score: 1 },
      { id: 'A-high', species: 'A', score: 9 },
      { id: 'B-low', species: 'B', score: 1 },
      { id: 'B-high', species: 'B', score: 9 }
    ];
    const source = unit(rows).key('id').layout('grid', { radius: 7 });
    const target = source
      .x('species', { type: 'nominal', title: 'Species' })
      .y('score', { type: 'quantitative', title: 'Score' })
      .layout('force', { radius: 7 });
    const change = await transition(source, target, {
      target: '#chart', height: 320
    });
    change.progress(1);
    const snapshot = () => ({
      marks: [...document.querySelectorAll('#chart circle.vd-unit')].map(node => [
        node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')
      ]).sort((a, b) => a[0].localeCompare(b[0])),
      xTicks: [...document.querySelectorAll('#chart .vd-x-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [node.textContent, box.left + box.width / 2];
      }),
      yTicks: [...document.querySelectorAll('#chart .vd-y-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [node.textContent, box.top + box.height / 2];
      })
    });
    const first = snapshot();
    change.progress(1);
    return { first, second: snapshot() };
  });
  expect(result.second).toEqual(result.first);

  const layout = await page.locator('#chart svg').evaluate(svg => {
    const marks = [...svg.querySelectorAll('circle.vd-unit')].map(node => ({
      species: node.__data__.__row.species,
      score: node.__data__.__row.score,
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy')),
      screenX: node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2,
      screenY: node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2
    }));
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      xLabels: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => node.textContent),
      xTickCenters: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [node.textContent, box.left + box.width / 2];
      }),
      yTickCenters: [...svg.querySelectorAll('.vd-y-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [node.textContent, box.top + box.height / 2];
      }),
      yTicks: svg.querySelectorAll('.vd-y-axis .tick').length,
      aX: mean(marks.filter(mark => mark.species === 'A').map(mark => mark.x)),
      bX: mean(marks.filter(mark => mark.species === 'B').map(mark => mark.x)),
      lowY: mean(marks.filter(mark => mark.score === 1).map(mark => mark.y)),
      highY: mean(marks.filter(mark => mark.score === 9).map(mark => mark.y)),
      lowScreenY: mean(marks.filter(mark => mark.score === 1).map(mark => mark.screenY)),
      highScreenY: mean(marks.filter(mark => mark.score === 9).map(mark => mark.screenY)),
      aScreenX: mean(marks.filter(mark => mark.species === 'A').map(mark => mark.screenX)),
      bScreenX: mean(marks.filter(mark => mark.species === 'B').map(mark => mark.screenX))
    };
  });
  expect(layout.xLabels).toEqual(['A', 'B']);
  expect(layout.yTicks).toBeGreaterThan(0);
  expect(layout.aX).toBeLessThan(layout.bX);
  expect(layout.highY).toBeLessThan(layout.lowY);
  for (const [label, center] of [['A', layout.aScreenX], ['B', layout.bScreenX]]) {
    const target = layout.xTickCenters.find(([tick]) => tick === label)?.[1];
    expect(target, `resolved x-axis tick for ${label}`).toBeDefined();
    expect(Math.abs(center - target)).toBeLessThan(30);
  }
  for (const [value, center] of [[1, layout.lowScreenY], [9, layout.highScreenY]]) {
    const target = layout.yTickCenters.find(([tick]) => Number(tick) === value)?.[1];
    expect(target, `resolved y-axis tick for ${value}`).toBeDefined();
    expect(Math.abs(center - target)).toBeLessThan(30);
  }
});

test('Unit force keeps temporal and quantitative anchor axes aligned and bounded', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const layout = await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = [
      { id: 'jan-low', observedAt: '2024-01-01', score: 1 },
      { id: 'jan-high', observedAt: '2024-01-01', score: 9 },
      { id: 'feb-low', observedAt: '2024-02-01', score: 1 },
      { id: 'feb-high', observedAt: '2024-02-01', score: 9 }
    ];
    const source = unit(rows).key('id').layout('grid', { radius: 7 });
    const target = source
      .x('observedAt', { type: 'temporal', title: 'Observed' })
      .y('score', { type: 'quantitative', title: 'Score' })
      .layout('force', { radius: 7 });
    const change = await transition(source, target, { target: '#chart', height: 320 });
    change.progress(1);
    const snapshot = () => [...document.querySelectorAll('#chart circle.vd-unit')].map(node => [
      node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')
    ]).sort((a, b) => a[0].localeCompare(b[0]));
    const first = snapshot();
    change.progress(1);
    const second = snapshot();
    const svg = document.querySelector('#chart svg');
    const plot = svg.querySelector('clipPath[id^="vd-mark-clip-"] rect');
    const marks = [...svg.querySelectorAll('circle.vd-unit')].map(node => ({
      key: node.dataset.key,
      date: node.__data__.__row.observedAt,
      score: node.__data__.__row.score,
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy')),
      r: Number(node.getAttribute('r')),
      screenX: node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2,
      screenY: node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2
    }));
    let minimumGap = Infinity;
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        minimumGap = Math.min(minimumGap,
          Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y)
            - marks[i].r - marks[j].r);
      }
    }
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      first,
      second,
      marks,
      minimumGap,
      plotWidth: Number(plot.getAttribute('width')),
      plotHeight: Number(plot.getAttribute('height')),
      xTicks: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [new Date(node.__data__).getTime(), box.left + box.width / 2];
      }),
      yTicks: [...svg.querySelectorAll('.vd-y-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return [Number(node.textContent), box.top + box.height / 2];
      }),
      dates: [...new Set(marks.map(mark => mark.date))].map(date => {
        const group = marks.filter(mark => mark.date === date);
        return [new Date(date).getTime(), mean(group.map(mark => mark.screenX))];
      }),
      scores: [...new Set(marks.map(mark => mark.score))].map(score => {
        const group = marks.filter(mark => mark.score === score);
        return [score, mean(group.map(mark => mark.screenY))];
      })
    };
  });
  expect(layout.first).toEqual(layout.second);
  expect(layout.marks).toHaveLength(4);
  expect(new Set(layout.marks.map(mark => mark.key)).size).toBe(4);
  expect(layout.minimumGap).toBeGreaterThan(-0.05);
  expect(Math.min(...layout.marks.map(mark => mark.x - mark.r))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...layout.marks.map(mark => mark.x + mark.r))).toBeLessThanOrEqual(layout.plotWidth);
  expect(Math.min(...layout.marks.map(mark => mark.y - mark.r))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...layout.marks.map(mark => mark.y + mark.r))).toBeLessThanOrEqual(layout.plotHeight);
  for (const [value, center] of layout.dates) {
    const target = layout.xTicks.find(([tick]) => tick === value)?.[1];
    expect(target, `resolved temporal x-axis tick for ${new Date(value).toISOString()}`).toBeDefined();
    expect(Math.abs(center - target)).toBeLessThan(30);
  }
  for (const [value, center] of layout.scores) {
    const target = layout.yTicks.find(([tick]) => tick === value)?.[1];
    expect(target, `resolved quantitative y-axis tick for ${value}`).toBeDefined();
    expect(Math.abs(center - target)).toBeLessThan(30);
  }
});

test('Unit force endpoint cache invalidates when dimensions or anchor spec changes', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ expandUnits, unitLayout }] = await Promise.all([
      import('/dist/charts/unit/state.js')
    ]);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.append(group);
    document.querySelector('#chart').append(svg);
    const g = {
      node: () => group,
      selectAll: selector => ({ nodes: () => [...group.querySelectorAll(selector)] })
    };
    const rows = [
      { id: 'A-low', species: 'A', region: 'west', score: 1 },
      { id: 'A-high', species: 'A', region: 'west', score: 9 },
      { id: 'B-low', species: 'B', region: 'east', score: 1 },
      { id: 'B-high', species: 'B', region: 'east', score: 9 }
    ];
    const chart = { g, innerWidth: 259, innerHeight: 306, width: 300, height: 350, margin: {} };
    const spec = { encoding: { x: { field: 'species', type: 'nominal' } }, meta: { unit: { layout: 'force', radius: 6 } } };
    const units = expandUnits(rows, spec);
    const first = unitLayout(units, chart, spec);
    for (const unit of units) {
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      mark.classList.add('vd-unit');
      mark.dataset.key = unit.__unitKey;
      mark.setAttribute('cx', String(first.x(unit)));
      mark.setAttribute('cy', String(first.y(unit)));
      group.append(mark);
    }
    const repeated = unitLayout(units, chart, spec);
    const repeatedRange = repeated.axes.x.scale.range();
    chart.innerWidth = 320;
    chart.width = 361;
    const resized = unitLayout(units, chart, spec);
    const resizedRange = resized.axes.x.scale.range();
    const changedSpec = {
      ...spec,
      encoding: { x: { field: 'region', type: 'nominal' } }
    };
    const changedUnits = expandUnits(rows, changedSpec);
    const changed = unitLayout(changedUnits, chart, changedSpec);
    return {
      firstRange: first.axes.x.scale.range(),
      repeatedRange,
      resizedRange,
      changedDomain: changed.axes.x.scale.domain()
    };
  });
  expect(result.repeatedRange).toEqual(result.firstRange);
  expect(result.resizedRange).not.toEqual(result.firstRange);
  expect(result.changedDomain).toEqual(['west', 'east']);
});

test('Unit force cache distinguishes values with the same string form', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ expandUnits, unitLayout }] = await Promise.all([
      import('/dist/charts/unit/state.js')
    ]);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.append(group);
    document.querySelector('#chart').append(svg);
    const chart = {
      g: { node: () => group, selectAll: selector => ({ nodes: () => [...group.querySelectorAll(selector)] }) },
      innerWidth: 259, innerHeight: 306, width: 300, height: 350, margin: {}
    };
    const rows = [{ id: 'number', category: 1 }, { id: 'string', category: '1' }];
    const spec = { encoding: { x: { field: 'category', type: 'nominal' } }, meta: { unit: { layout: 'force', radius: 6 } } };
    const numericAndString = expandUnits(rows, spec);
    const first = unitLayout(numericAndString, chart, spec);
    const firstPositions = numericAndString.map(unit => [first.x(unit), first.y(unit)]);
    numericAndString.forEach((unit, index) => {
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      mark.classList.add('vd-unit');
      mark.dataset.key = unit.__unitKey;
      mark.setAttribute('cx', String(firstPositions[index][0]));
      mark.setAttribute('cy', String(firstPositions[index][1]));
      group.append(mark);
    });
    rows[1].category = 1;
    const numericOnly = expandUnits(rows, spec);
    const changed = unitLayout(numericOnly, chart, spec);
    return {
      firstDomain: first.axes.x.scale.domain(),
      changedDomain: changed.axes.x.scale.domain(),
      firstPositions,
      changedPositions: numericOnly.map(unit => [changed.x(unit), changed.y(unit)])
    };
  });
  expect(result.firstDomain).toEqual([1, '1']);
  expect(result.changedDomain).toEqual([1]);
  expect(result.changedPositions).not.toEqual(result.firstPositions);
});

test('Unit force endpoints preserve update identity and support enter and exit', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const sourceRows = Array.from({ length: 8 }, (_, index) => ({ id: `U${index + 1}` }));
    const targetRows = [
      ...sourceRows.slice(0, 6),
      { id: 'U9' },
      { id: 'U10' },
      { id: 'U11' }
    ];
    const source = unit(sourceRows).key('id').layout('force', { radius: 7 });
    const target = unit(targetRows).key('id').layout('force', { radius: 7 });
    const change = await transition(source, target, {
      target: '#chart', height: 320
    });
    window.forceChange = change;
    return { source: sourceRows.map(row => row.id), target: targetRows.map(row => row.id) };
  });
  await page.evaluate(() => window.forceChange.progress(0.5));
  const middle = await page.locator('#chart circle.vd-unit').evaluateAll(nodes => nodes.map(node => ({
    key: node.dataset.parentKey,
    r: Number(node.getAttribute('r'))
  })));
  await page.evaluate(() => window.forceChange.progress(1));
  const endKeys = await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => node.dataset.parentKey).sort());
  await page.evaluate(() => window.forceChange.progress(0));
  const startKeys = await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => node.dataset.parentKey).sort());

  expect(startKeys).toEqual(result.source.sort());
  expect(endKeys).toEqual(result.target.sort());
  expect(middle.filter(mark => result.source.includes(mark.key) && result.target.includes(mark.key))
    .every(mark => mark.r > 0)).toBe(true);
});

// These examples are composite declaration routes. Motion contracts apply to
// the layout operation's own leg, independently of preceding parameter edits.
const unitLayoutLeg = async (page, layout, anchors = false) => {
  const leg = await page.locator('#chart').evaluate(async (host, { layout, anchors }) => {
    const view = [host, ...host.querySelectorAll('*')].find(node => node.__visDeltaScene?.seekSequence);
    const phases = view.__visDeltaScene.seekSequence.phases;
    const layoutOf = spec => spec?.meta?.unit?.layout ?? 'grid';
    const phase = phases.find(phase => anchors
      ? layoutOf(phase.transitionSource.effectiveViewSpec) === 'force' && layoutOf(phase.spec) === 'force'
        && JSON.stringify(phase.transitionSource.effectiveViewSpec.encoding?.x) !== JSON.stringify(phase.spec.encoding?.x)
      : layoutOf(phase.transitionSource.effectiveViewSpec) !== layoutOf(phase.spec)
        && [layoutOf(phase.transitionSource.effectiveViewSpec), layoutOf(phase.spec)].includes(layout));
    if (!phase) throw new Error('Missing Unit layout operation leg: ' + layout);
    const from = phase.reverse ? phase.spec : phase.transitionSource.effectiveViewSpec;
    const to = phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec;
    const { createUnitDeclarationOperationCodec } = await import('/dist/charts/unit/declaration-operations.js');
    const codec = createUnitDeclarationOperationCodec();
    const normalizedFrom = codec.normalize(from);
    const normalizedTo = codec.normalize(to);
    if (normalizedFrom.status !== 'ok' || normalizedTo.status !== 'ok') throw new Error('Unit layout leg states are invalid');
    const left = new Map(codec.decompose(normalizedFrom.value).value.map(op => [op.id, JSON.stringify(op)]));
    const right = new Map(codec.decompose(normalizedTo.value).value.map(op => [op.id, JSON.stringify(op)]));
    return { start: phase.start, end: phase.end, reverse: phase.reverse, sourceLayout: layoutOf(from), targetLayout: layoutOf(to),
      changed: [...new Set([...left.keys(), ...right.keys()])].filter(id => left.get(id) !== right.get(id)) };
  }, { layout, anchors });
  expect(leg.sourceLayout).toBe(anchors ? 'force' : 'grid');
  expect(leg.targetLayout).toBe(layout);
  expect(leg.changed).toEqual([anchors ? 'encoding/x' : 'meta/unit/layout']);
  // Use exact operation boundaries instead of the UI's authored 0.01 step.
  await page.locator('#progress').evaluate(input => { input.step = 'any'; });
  return { ...leg, seek: local => page.locator('#progress').fill(String(leg.start + (leg.end - leg.start) * local)) };
};

test('Unit bar sets horizontal positions before units fall', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#unit/bar');
  await ready(page);
  const geometry = () => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    Object.fromEntries(nodes.map(node => [node.dataset.key, {
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    }])));

  const leg = await unitLayoutLeg(page, 'bar');
  await leg.seek(0);
  const start = await geometry();
  await leg.seek(0.52);
  const afterMoveAcross = await geometry();
  const steps = await page.locator('#chart [data-transition-steps]').first()
    .getAttribute('data-transition-steps');
  await leg.seek(1);
  const end = await geometry();
  await page.locator('#end').click();
  const completeEnd = await geometry();
  expect(Object.keys(completeEnd)).toEqual(Object.keys(start));
  expect(Object.values(completeEnd).every(mark => Number.isFinite(mark.x) && Number.isFinite(mark.y))).toBe(true);

  expect(Object.keys(afterMoveAcross)).toEqual(Object.keys(start));
  for (const key of Object.keys(start)) {
    expect(afterMoveAcross[key].x).toBeCloseTo(end[key].x, 5);
    expect(afterMoveAcross[key].y).toBeCloseTo(start[key].y, 5);
  }
  expect(steps).toBe('view move-across fall');
});

test('Unit fall uses the direction inferred from successive progress values', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#unit/beeswarm');
  await ready(page);
  const leg = await unitLayoutLeg(page, 'beeswarm');
  const positions = () => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => Number(node.getAttribute('cy'))));

  await leg.seek(0.7);
  await leg.seek(0.8);
  const arrivingForward = await positions();

  await leg.seek(0.9);
  await leg.seek(0.8);
  const arrivingBackward = await positions();

  expect(arrivingBackward).not.toEqual(arrivingForward);
});

test('Unit uses a light bounded per-mark delay by default', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#unit/radius');
  await ready(page);
  await page.locator('#progress').fill('0.5');

  const radii = await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => Number(node.getAttribute('r')).toFixed(4)));
  expect(new Set(radii).size).toBeGreaterThan(1);
});

test('unit focus keeps every unit and uses the shared 2D camera', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#unit/focus');
  await ready(page);
  await page.locator('#end').click();

  await expect(page.locator('#chart circle.vd-unit')).toHaveCount(150);
  const result = await page.locator('#chart svg').evaluate(svg => {
    const plot = svg.querySelector('clipPath[id^="vd-mark-clip-"] rect');
    const selected = [...svg.querySelectorAll('circle.vd-unit')]
      .find(node => node.__data__?.flowerId === 'iris-001');
    return {
      width: Number(plot?.getAttribute('width')),
      height: Number(plot?.getAttribute('height')),
      cx: Number(selected?.getAttribute('cx')),
      cy: Number(selected?.getAttribute('cy')),
      radius: Number(selected?.getAttribute('r')),
      cameraK: Number(svg.getAttribute('data-camera-k'))
    };
  });
  expect(result.cameraK).toBeGreaterThan(1);
  expect(result.cx).toBeCloseTo(result.width / 2, 5);
  expect(result.cy).toBeCloseTo(result.height / 2, 5);
  expect(result.radius).toBeCloseTo(Math.min(result.width, result.height) / 2, 5);
});

test('unit lab loads the tidy Iris data and keeps one keyed unit per flower', async ({ page }) => {
  const dataRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/data/iris.csv')) dataRequests.push(request.url());
  });
  await page.goto('/docs/.vitepress/dist/playground.html#unit/all');
  await ready(page);
  await page.locator('#end').click();

  await expect(page.locator('#chart circle.vd-unit')).toHaveCount(150);
  expect(dataRequests.length).toBeGreaterThan(0);
  const result = await page.locator('#chart').evaluate(chart => {
    const marks = [...chart.querySelectorAll('circle.vd-unit')];
    return {
      keys: new Set(marks.map(node => node.dataset.key)).size,
      parentKeys: new Set(marks.map(node => node.dataset.parentKey)).size,
      species: [...new Set(marks.map(node => node.__data__?.species))].sort()
    };
  });

  expect(result.keys).toBe(150);
  expect(result.parentKeys).toBe(150);
  expect(result.species).toEqual(['setosa', 'versicolor', 'virginica']);
});

test('zero count renders zero units and group does not silently choose layout or color', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = [
      { id: 'zero', category: 'A', count: 0 },
      { id: 'three', category: 'B', count: 3 }
    ];
    const grouped = unit(rows).value('count').key('id').group('category');
    const change = await transition(grouped, grouped, {
      target: document.body.appendChild(document.createElement('div')),
      height: 320
    });
    change.progress(1);
    const spec = grouped.toSpec();
    return {
      marks: document.querySelectorAll('circle.vd-unit').length,
      zeroMarks: document.querySelectorAll('[data-parent-key="zero"]').length,
      layout: spec.meta.state.sceneState.axis.layout,
      group: spec.meta.state.sceneState.axis.group,
      color: spec.encoding?.color,
      hasRollup: typeof grouped.rollup,
      hasBreakdown: typeof grouped.breakdown
    };
  });

  expect(result.marks).toBe(3);
  expect(result.zeroMarks).toBe(0);
  expect(result.layout).toBe('grid');
  expect(result.group).toBe('category');
  expect(result.color).toBeUndefined();
  expect(result.hasRollup).toBe('undefined');
  expect(result.hasBreakdown).toBe('undefined');
});

test('a Unit transition does not import another chart module', async ({ page }) => {
  const modules = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/dist/charts/')) modules.push(path);
  });
  await page.goto('/tests/fixtures/isolated.html');
  await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = [
      { id: 'A', team: 'Alpha', count: 2 },
      { id: 'B', team: 'Beta', count: 3 }
    ];
    const from = unit(rows).value('count').key('id');
    const to = from.group('team').layout('bar', { columns: 2 });
    const pair = await transition(from, to, { target: '#chart', height: 240 });
    pair.progress(0.5);
  });

  expect(modules.some(path => path.includes('/charts/unit/'))).toBe(true);
  expect(modules.filter(path => /\/charts\/(area|bar|line|point)\//.test(path))).toEqual([]);
});

test('changing unitValue morphs each coarse interval through the Point-style blend path', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  const result = await page.evaluate(async () => {
    const { unit, transition } = window.VisDelta;
    const rows = [
      { id: 'A', sites: 8 },
      { id: 'B', sites: 4 }
    ];
    const summary = unit(rows).value('sites', { unitValue: 4 }).key('id')
      .layout('grid', { columns: 6, radius: 8 })
      .transition({ duration: 1000, ease: 'linear' });
    const detail = summary.value('sites', { unitValue: 1 });
    const forwardHost = document.querySelector('#chart');
    const reverseHost = document.body.appendChild(document.createElement('div'));
    const split = await transition(summary, detail, { target: forwardHost, height: 260 });
    const merge = await transition(detail, summary, { target: reverseHost, height: 260 });
    const geometry = (host) => [...host.querySelectorAll('circle.vd-unit, circle.vd-unit-blend')]
      .map((node) => [
        node.dataset.key || node.parentElement?.dataset.parentUnitKey,
        node.dataset.blendRole || 'crisp',
        Number(node.getAttribute('cx')).toFixed(3),
        Number(node.getAttribute('cy')).toFixed(3),
        Number(node.getAttribute('r')).toFixed(3)
      ].join('|')).sort();

    split.progress(0.35);
    const blendLayer = forwardHost.querySelector('.vd-unit-blend-layer');
    const crispLayer = forwardHost.querySelector('.vd-unit-crisp-layer');
    const childCounts = [...blendLayer.querySelectorAll('.vd-unit-blend-group')]
      .map((group) => group.querySelectorAll('[data-blend-role="child"]').length)
      .sort((a, b) => a - b);
    const blendCircleCount = blendLayer.querySelectorAll('circle').length;
    const intermediateCount = forwardHost.querySelectorAll('circle.vd-unit').length;

    const childDistances = [];
    for (const progress of [0.05, 0.2, 0.4, 0.6, 0.8]) {
      split.progress(progress);
      const child = [...forwardHost.querySelectorAll('[data-blend-role="child"]')]
        .find((node) => node.__data__?.__parentKey === 'A' && node.__data__?.__unitIndex === 7);
      const parent = child?.parentElement?.querySelector('[data-blend-role="parent"]');
      childDistances.push(Math.hypot(
        Number(child?.getAttribute('cx')) - Number(parent?.getAttribute('cx')),
        Number(child?.getAttribute('cy')) - Number(parent?.getAttribute('cy'))
      ));
    }
    const childMovesContinuously = childDistances.every((distance, index) =>
      index === 0 || distance > childDistances[index - 1]);

    split.progress(0.43);
    merge.progress(0.57);
    return {
      blendVisibility: blendLayer.style.visibility,
      crispVisibility: crispLayer.style.visibility,
      childCounts,
      blendCircleCount,
      intermediateCount,
      childMovesContinuously,
      reverseMatches: JSON.stringify(geometry(forwardHost)) === JSON.stringify(geometry(reverseHost)),
      steps: split.view.dataset.transitionSteps
    };
  });

  expect(result.blendVisibility).toBe('visible');
  expect(result.crispVisibility).toBe('hidden');
  expect(result.childCounts).toEqual([4, 4, 4]);
  expect(result.blendCircleCount).toBe(15);
  expect(result.intermediateCount).toBe(12);
  expect(result.childMovesContinuously).toBe(true);
  expect(result.reverseMatches).toBe(true);
  expect(result.steps).toBe('view marks');
});

test('grid reflow stages the view, preserves keyed identity, and uses the same path backward', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: `U${index + 1}` }));
    const narrow = unit(rows).key('id').layout('grid', { columns: 3, radius: 8 })
      .transition({ duration: 1000, ease: 'linear' });
    const wide = narrow.layout('grid', { columns: 4, radius: 8 });
    const forwardHost = document.querySelector('#chart');
    const reverseHost = document.body.appendChild(document.createElement('div'));
    const forward = await transition(narrow, wide, { target: forwardHost, height: 320 });
    const reverse = await transition(wide, narrow, { target: reverseHost, height: 320 });

    const geometry = host => [...host.querySelectorAll('circle.vd-unit')]
      .map(node => [
        Number(node.getAttribute('cx')).toFixed(3),
        Number(node.getAttribute('cy')).toFixed(3),
        Number(node.getAttribute('r')).toFixed(3)
      ].join('|')).sort();
    forward.progress(0);
    const sourceGeometry = geometry(forwardHost);
    forward.progress(1);
    forward.progress(0.15);
    const viewStageGeometry = geometry(forwardHost);
    forward.progress(0.5);
    const assignments = [...forwardHost.querySelectorAll('circle.vd-unit')].map(node => ({
      source: node.dataset.sourceKey,
      target: node.dataset.key
    }));
    forward.progress(0.37);
    reverse.progress(0.63);
    return {
      sourceGeometry,
      viewStageGeometry,
      keyedIdentityPreserved: assignments.every(match => match.source === match.target),
      matchedByKey: [...forwardHost.querySelectorAll('circle.vd-unit')]
        .every(node => node.dataset.matchedBy === 'key'),
      reverseMatches: JSON.stringify(geometry(forwardHost)) === JSON.stringify(geometry(reverseHost)),
      steps: forward.view.dataset.transitionSteps
    };
  });

  expect(result.viewStageGeometry).toEqual(result.sourceGeometry);
  expect(result.keyedIdentityPreserved).toBe(true);
  expect(result.matchedByKey).toBe(true);
  expect(result.reverseMatches).toBe(true);
  expect(result.steps).toBe('view marks');
});

test('Unit regroup preserves keyed identity and endpoints in both authored directions', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const [{ unit }, { transition }] = await Promise.all([
      import('/dist/unit.js'),
      import('/dist/transition-entry.js')
    ]);
    const rows = [
      { id: 'A1', team: 'Alpha', region: 'North', count: 5 },
      { id: 'A2', team: 'Alpha', region: 'South', count: 4 },
      { id: 'B1', team: 'Beta', region: 'North', count: 6 },
      { id: 'B2', team: 'Beta', region: 'South', count: 3 }
    ];
    const base = unit(rows).value('count').key('id')
      .transition({ duration: 1000, ease: 'linear' });
    const byTeam = base.group('team').layout('bar', { columns: 3 }).color('team');
    const byRegion = base.group('region').layout('bar', { columns: 3 }).color('region');
    const forwardHost = document.querySelector('#chart');
    const reverseHost = document.body.appendChild(document.createElement('div'));
    const forward = await transition(byTeam, byRegion, { target: forwardHost, height: 320 });
    const reverse = await transition(byRegion, byTeam, { target: reverseHost, height: 320 });
    const frame = host => [...host.querySelectorAll('circle.vd-unit')].map(node => ({
      key: node.dataset.key,
      sourceKey: node.dataset.sourceKey,
      matchedBy: node.dataset.matchedBy,
      cx: Number(node.getAttribute('cx')).toFixed(3),
      cy: Number(node.getAttribute('cy')).toFixed(3),
      r: Number(node.getAttribute('r')).toFixed(3),
      fill: node.getAttribute('fill'),
      opacity: node.style.opacity
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const identity = host => [...host.querySelectorAll('circle.vd-unit')].map(node => ({
      key: node.dataset.key,
      sourceKey: node.dataset.sourceKey,
      matchedBy: node.dataset.matchedBy
    }));
    forward.progress(0.41);
    reverse.progress(0.59);
    const forwardIdentity = identity(forwardHost);
    const reverseIdentity = identity(reverseHost);
    forward.progress(1);
    reverse.progress(0);
    const regionEndpointMatches = JSON.stringify(frame(forwardHost)) === JSON.stringify(frame(reverseHost));
    forward.progress(0);
    reverse.progress(1);
    const teamEndpointMatches = JSON.stringify(frame(forwardHost)) === JSON.stringify(frame(reverseHost));
    return { regionEndpointMatches, teamEndpointMatches, forwardIdentity, reverseIdentity };
  });

  expect(result.regionEndpointMatches).toBe(true);
  expect(result.teamEndpointMatches).toBe(true);
  for (const identity of [result.forwardIdentity, result.reverseIdentity]) {
    expect(identity.every(item => item.key === item.sourceKey && item.matchedBy === 'key')).toBe(true);
  }
});

test('Unit force endpoint cache recognizes a reversed endpoint and resimulates changed anchors on the same host', async ({ page }) => {
  await page.goto('/tests/fixtures/isolated.html');
  const result = await page.evaluate(async () => {
    const { expandUnits, unitLayout } = await import('/dist/charts/unit/state.js');
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const chart = { g: { node: () => group, selectAll: selector => ({ nodes: () => [...group.querySelectorAll(selector)] }) }, innerWidth: 300, innerHeight: 280, width: 340, height: 320, margin: {} };
    const rows = [{ id: 'a', species: 'A', region: 'east' }, { id: 'b', species: 'A', region: 'west' }, { id: 'c', species: 'B', region: 'east' }, { id: 'd', species: 'B', region: 'west' }];
    const spec = field => ({ encoding: { x: { field, type: 'nominal' } }, meta: { unit: { layout: 'force', radius: 6 } } });
    const a = spec('species');
    const b = spec('region');
    const units = expandUnits(rows, a);
    const coordinates = layout => units.map(unit => [layout.x(unit), layout.y(unit)]);
    const paint = layout => {
      group.replaceChildren();
      for (const unit of units) {
        const mark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mark.classList.add('vd-unit'); mark.dataset.key = unit.__unitKey;
        mark.setAttribute('cx', String(layout.x(unit))); mark.setAttribute('cy', String(layout.y(unit))); mark.setAttribute('r', String(layout.r));
        group.append(mark);
      }
    };
    const firstA = unitLayout(units, chart, a); paint(firstA);
    const firstB = unitLayout(units, chart, b); paint(firstB);
    // The descriptor exists, but visible marks belong to B: A must be solved.
    const againA = unitLayout(units, chart, a);
    const recomputed = againA.trajectoryTimeline.length > 1;
    paint(againA);
    const secondB = unitLayout(units, chart, b); paint(secondB);
    // Reverse playback restores A's already solved marks before clean rendering.
    paint(againA);
    const reverseA = unitLayout(units, chart, a);
    return { recomputed, a: coordinates(againA), b: coordinates(firstB), reverse: coordinates(reverseA), reverseTimeline: reverseA.trajectoryTimeline,
      domains: [firstA.axes.x.scale.domain(), firstB.axes.x.scale.domain()] };
  });
  expect(result.recomputed).toBe(true);
  expect(result.a).not.toEqual(result.b);
  expect(result.reverse).toEqual(result.a);
  expect(result.reverseTimeline).toEqual([0]);
  expect(result.domains).toEqual([['A', 'B'], ['east', 'west']]);
});
