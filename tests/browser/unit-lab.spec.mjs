import { test, expect } from '@playwright/test';
import { scenarios } from '../../examples/unit/scenarios.js';

const ready = async page => {
  await page.locator('#chart').scrollIntoViewIfNeeded();
  await expect(page.locator('#status')).toHaveText('Ready');
};

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
    await page.goto(`/docs/.vitepress/dist/unit-lab.html#${sample.id}`);
    await ready(page);
    await expect(page.locator('#scenario option')).toHaveCount(scenarios.length);
    const editor = page.getByRole('textbox', { name: 'Editable VisDelta code' });
    await expect(editor).toHaveValue(sample.code);

    const start = await snapshot(page);
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

    await editor.fill(sample.code.replace('radius: 6', 'radius: 5'));
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    await expect(editor).toHaveValue(/radius: 5/);
    await page.locator('#reset').click();
    await ready(page);
    await expect(editor).toHaveValue(sample.code);
    expect(errors).toEqual([]);
  });
}

test('unit bar uses category position while every unit keeps equal size', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/unit-lab.html#bar');
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
  await page.goto('/docs/.vitepress/dist/unit-lab.html#force');
  await ready(page);
  const readPositions = () => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => [node.dataset.key, node.getAttribute('cx'), node.getAttribute('cy')])
      .sort((a, b) => a[0].localeCompare(b[0])));
  const positionsAt = async value => {
    await page.locator('#progress').fill(String(value));
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
  await page.waitForTimeout(120);
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
      centroidX: marks.reduce((sum, mark) => sum + mark.x, 0) / marks.length,
      centroidY: marks.reduce((sum, mark) => sum + mark.y, 0) / marks.length,
      minimumGap,
      xLabels: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => node.textContent),
      xTickCenters: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => {
        const box = node.getBoundingClientRect();
        return box.left + box.width / 2;
      }),
      yTicks: svg.querySelectorAll('.vd-y-axis .tick').length,
      groupCenters: Object.values(Object.groupBy(marks, mark => mark.species)).map(group =>
        group.reduce((sum, mark) => sum + mark.screenX, 0) / group.length)
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
  expect(first.centroidX).toBeCloseTo(first.plotWidth / 2, 5);
  expect(first.centroidY).toBeCloseTo(first.plotHeight / 2, 5);
  expect(first.minimumGap).toBeGreaterThan(-0.05);
  expect(first.xLabels).toEqual(['setosa', 'versicolor', 'virginica']);
  expect(first.yTicks).toBe(0);
  first.groupCenters.forEach((center, index) => {
    expect(Math.abs(center - first.xTickCenters[index])).toBeLessThan(30);
  });
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
      target: '#chart', d3, aq, height: 320
    });
    change.progress(1);
    return true;
  });
  expect(result).toBe(true);

  const layout = await page.locator('#chart svg').evaluate(svg => {
    const marks = [...svg.querySelectorAll('circle.vd-unit')].map(node => ({
      species: node.__data__.__row.species,
      score: node.__data__.__row.score,
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    }));
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      xLabels: [...svg.querySelectorAll('.vd-x-axis .tick')].map(node => node.textContent),
      yTicks: svg.querySelectorAll('.vd-y-axis .tick').length,
      aX: mean(marks.filter(mark => mark.species === 'A').map(mark => mark.x)),
      bX: mean(marks.filter(mark => mark.species === 'B').map(mark => mark.x)),
      lowY: mean(marks.filter(mark => mark.score === 1).map(mark => mark.y)),
      highY: mean(marks.filter(mark => mark.score === 9).map(mark => mark.y))
    };
  });
  expect(layout.xLabels).toEqual(['A', 'B']);
  expect(layout.yTicks).toBeGreaterThan(0);
  expect(layout.aX).toBeLessThan(layout.bX);
  expect(layout.highY).toBeLessThan(layout.lowY);
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
      target: '#chart', d3, aq, height: 320
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

test('Unit bar sets horizontal positions before units fall', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/unit-lab.html#bar');
  await ready(page);
  const geometry = () => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    Object.fromEntries(nodes.map(node => [node.dataset.key, {
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    }])));

  const start = await geometry();
  await page.locator('#progress').fill('0.52');
  const afterMoveAcross = await geometry();
  const steps = await page.locator('#chart [data-transition-steps]').first()
    .getAttribute('data-transition-steps');
  await page.locator('#end').click();
  const end = await geometry();

  expect(Object.keys(afterMoveAcross)).toEqual(Object.keys(start));
  for (const key of Object.keys(start)) {
    expect(afterMoveAcross[key].x).toBeCloseTo(end[key].x, 5);
    expect(afterMoveAcross[key].y).toBeCloseTo(start[key].y, 5);
  }
  expect(steps).toBe('view move-across fall');
});

test('Unit fall uses the direction inferred from successive progress values', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/unit-lab.html#beeswarm');
  await ready(page);
  const progress = page.locator('#progress');
  const positions = () => page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => Number(node.getAttribute('cy'))));

  await progress.fill('0.7');
  await progress.fill('0.8');
  const arrivingForward = await positions();

  await progress.fill('0.9');
  await progress.fill('0.8');
  const arrivingBackward = await positions();

  expect(arrivingBackward).not.toEqual(arrivingForward);
});

test('Unit uses a light bounded per-mark delay by default', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/unit-lab.html#radius');
  await ready(page);
  await page.locator('#progress').fill('0.5');

  const radii = await page.locator('#chart circle.vd-unit').evaluateAll(nodes =>
    nodes.map(node => Number(node.getAttribute('r')).toFixed(4)));
  expect(new Set(radii).size).toBeGreaterThan(1);
});

test('unit focus keeps every unit and uses the shared 2D camera', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/unit-lab.html#focus');
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
  await page.goto('/docs/.vitepress/dist/unit-lab.html#all');
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
      d3, aq, height: 320
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
    const pair = await transition(from, to, { target: '#chart', d3, aq, height: 240 });
    pair.progress(0.5);
  });

  expect(modules.some(path => path.includes('/charts/unit/'))).toBe(true);
  expect(modules.filter(path => /\/charts\/(area|bar|line|point)\//.test(path))).toEqual([]);
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
    const forward = await transition(narrow, wide, { target: forwardHost, d3, aq, height: 320 });
    const reverse = await transition(wide, narrow, { target: reverseHost, d3, aq, height: 320 });

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
    const forward = await transition(byTeam, byRegion, { target: forwardHost, d3, aq, height: 320 });
    const reverse = await transition(byRegion, byTeam, { target: reverseHost, d3, aq, height: 320 });
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
