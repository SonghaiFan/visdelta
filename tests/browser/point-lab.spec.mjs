import { test, expect } from '@playwright/test';
import { pointScenarios } from '../../examples/point/scenarios.js';

const ready = page => expect(page.locator('#status')).toHaveText('Ready');
const snapshot = page => page.locator('#chart svg').evaluate(svg =>
  Array.from(svg.querySelectorAll('circle.vd-point, .tick, .vd-legend-item')).map(node => ({
    tag: node.tagName,
    text: node.textContent,
    attrs: Array.from(node.attributes).map(attr => [attr.name, attr.value]).sort()
  })));

for (const sample of pointScenarios) {
  test(`point lab ${sample.id}: editable pair and reversible seek`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/docs/.vitepress/dist/point-lab.html#${sample.id}`);
    await ready(page);
    await expect(page.locator('#scenario option')).toHaveCount(13);
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

    await editor.fill(sample.code.replace('Weight (1,000 lb)', 'Vehicle weight'));
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    await expect(editor).toHaveValue(/Vehicle weight/);
    await page.locator('#reset').click();
    await ready(page);
    await expect(editor).toHaveValue(sample.code);
    expect(errors).toEqual([]);
  });
}

test('point radius, highlight, and cached node identity are real renderer behavior', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#highlight');
  await ready(page);
  const result = await page.evaluate(() => {
    const chart = document.querySelector('#chart');
    const before = [...chart.querySelectorAll('circle.vd-point')];
    document.querySelector('#progress').value = '1';
    document.querySelector('#progress').dispatchEvent(new Event('input', { bubbles: true }));
    const after = [...chart.querySelectorAll('circle.vd-point')];
    return {
      reused: before.every(node => after.includes(node)),
      opacity: after.map(node => Number(node.style.opacity)).sort()
    };
  });
  expect(result.reused).toBe(true);
  expect(result.opacity.filter(value => value === 1)).toHaveLength(11);
  expect(result.opacity.filter(value => value === 0.12)).toHaveLength(21);

  await page.locator('#scenario').selectOption('size');
  await ready(page);
  await page.locator('#start').click();
  await expect(page.locator('#chart circle.vd-point').first()).toHaveAttribute('r', '5');
  await page.locator('#end').click();
  const radii = await page.locator('#chart circle.vd-point').evaluateAll(nodes =>
    nodes.map(node => Number(node.getAttribute('r'))));
  expect(new Set(radii.map(value => value.toFixed(3))).size).toBeGreaterThan(1);
});

test('point defaults use compact, open correlation axes', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#x');
  await ready(page);
  const style = await page.locator('#chart svg').evaluate(svg => ({
    verticalGridLines: svg.querySelectorAll('.vd-point-x-grid line').length,
    horizontalGridLines: svg.querySelectorAll('.vd-grid > .tick line').length,
    xDomainOpacity: getComputedStyle(svg.querySelector('.vd-x-axis .domain')).opacity,
    yDomainOpacity: getComputedStyle(svg.querySelector('.vd-y-axis .domain')).opacity,
    xTitle: svg.querySelector('.vd-x-label')?.textContent,
    yTitle: svg.querySelector('.vd-y-label')?.textContent,
    xTitleAnchor: svg.querySelector('.vd-x-label')?.getAttribute('text-anchor'),
    yTitleAnchor: svg.querySelector('.vd-y-label')?.getAttribute('text-anchor'),
    xAxisTransform: svg.querySelector('.vd-x-axis')?.getAttribute('transform'),
    yAxisTransform: svg.querySelector('.vd-y-axis')?.getAttribute('transform')
  }));

  expect(style.verticalGridLines).toBeGreaterThan(1);
  expect(style.horizontalGridLines).toBeGreaterThan(1);
  expect(style.xDomainOpacity).toBe('0');
  expect(style.yDomainOpacity).toBe('0');
  expect(style.xTitle).toBe('Weight (1,000 lb) →');
  expect(style.yTitle).toBe('↑ Fuel economy (mpg)');
  expect(style.xTitleAnchor).toBe('end');
  expect(style.yTitleAnchor).toBe('start');
  expect(style.xAxisTransform).toMatch(/^translate\(44,/);
  expect(style.yAxisTransform).toMatch(/^translate\(44,\s*56\)$/);

  await page.locator('#scenario').selectOption('color');
  await ready(page);
  await page.locator('#end').click();
  const header = await page.locator('#chart svg').evaluate(svg => {
    const box = selector => {
      const rect = svg.querySelector(selector)?.getBoundingClientRect();
      return rect && { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    return { legend: box('.vd-legend'), yTitle: box('.vd-y-label') };
  });
  expect(
    header.legend.bottom <= header.yTitle.top ||
    header.yTitle.bottom <= header.legend.top ||
    header.legend.right <= header.yTitle.left ||
    header.yTitle.right <= header.legend.left
  ).toBe(true);
  expect(header.legend.bottom).toBeLessThan(header.yTitle.top);
});

test('point lab loads the tidy mtcars dataset without inventing observations', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.url().endsWith('/data/mtcars.csv')) requests.push(request.url());
  });
  await page.goto('/docs/.vitepress/dist/point-lab.html#x');
  await ready(page);
  await expect(page.locator('#editor')).toHaveValue(/\.\/data\/mtcars\.csv/);
  await expect(page.locator('#chart circle.vd-point')).toHaveCount(32);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).pathname).toBe('/docs/.vitepress/dist/data/mtcars.csv');
});

test('axis title changes use one label node without a ghost copy', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#rollup');
  await ready(page);
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    await page.locator('#progress').fill(String(progress));
    await expect(page.locator('#chart .vd-x-label')).toHaveCount(1);
    await expect(page.locator('#chart .vd-y-label')).toHaveCount(1);
    await expect(page.locator('#chart .vd-axis-label-ghost')).toHaveCount(0);
  }
});

test('an added point grows at its target instead of flying from an unrelated anchor', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#add');
  await ready(page);
  const pointAt = async (progress) => {
    await page.locator('#progress').fill(String(progress));
    return page.locator('#chart circle.vd-point[data-key="Maserati Bora"]').evaluate(node => ({
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy')),
      radius: Number(node.getAttribute('r'))
    }));
  };
  const firstVisible = await pointAt(0.05);
  const middle = await pointAt(0.75);
  const end = await pointAt(1);
  expect([firstVisible.x, firstVisible.y]).toEqual([end.x, end.y]);
  expect([middle.x, middle.y]).toEqual([end.x, end.y]);
  expect(firstVisible.radius).toBe(0);
  expect(middle.radius).toBeGreaterThan(0);
  expect(firstVisible.radius).toBeLessThan(middle.radius);
  expect(middle.radius).toBeLessThan(end.radius);
});

test('point focus moves the view without filtering points', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#focus');
  await ready(page);
  const start = await page.locator('#chart circle.vd-point').evaluateAll(nodes =>
    nodes.map(node => [node.getAttribute('data-key'), node.getAttribute('cx'), node.getAttribute('cy')]));
  await page.locator('#end').click();
  await expect(page.locator('#chart circle.vd-point')).toHaveCount(32);
  const focused = await page.locator('#chart circle.vd-point').evaluateAll(nodes =>
    nodes.map(node => [node.getAttribute('data-key'), node.getAttribute('cx'), node.getAttribute('cy')]));
  expect(focused).not.toEqual(start);
  const fit = await page.locator('#chart svg').evaluate(svg => {
    const plot = svg.querySelector('clipPath[id^="vd-mark-clip-"] rect');
    const circles = [...svg.querySelectorAll('circle.vd-point')];
    const selected = circles.filter(node => Number(node.__data__?.cyl) === 4);
    const bounds = {
      x0: Math.min(...selected.map(node => Number(node.getAttribute('cx')) - Number(node.getAttribute('r')))),
      y0: Math.min(...selected.map(node => Number(node.getAttribute('cy')) - Number(node.getAttribute('r')))),
      x1: Math.max(...selected.map(node => Number(node.getAttribute('cx')) + Number(node.getAttribute('r')))),
      y1: Math.max(...selected.map(node => Number(node.getAttribute('cy')) + Number(node.getAttribute('r'))))
    };
    return {
      bounds,
      width: Number(plot?.getAttribute('width')),
      height: Number(plot?.getAttribute('height')),
      finite: circles.every(node => ['cx', 'cy', 'r'].every(name => Number.isFinite(Number(node.getAttribute(name)))))
    };
  });
  expect(fit.finite).toBe(true);
  expect((fit.bounds.x0 + fit.bounds.x1) / 2).toBeCloseTo(fit.width / 2, 1);
  expect((fit.bounds.y0 + fit.bounds.y1) / 2).toBeCloseTo(fit.height / 2, 1);
  expect(Math.min(fit.bounds.x0, fit.bounds.y0, fit.width - fit.bounds.x1, fit.height - fit.bounds.y1))
    .toBeCloseTo(0, 1);
});

test('point flip changes the authored first axis before the second axis', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#flip');
  await ready(page);
  const positions = async () => page.locator('#chart circle.vd-point').evaluateAll(nodes =>
    nodes.map(node => ({
      key: node.getAttribute('data-key'),
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    })).sort((a, b) => a.key.localeCompare(b.key)));
  const start = await positions();
  await page.locator('#progress').fill('0.24');
  const firstAxis = await positions();
  expect(firstAxis.map(point => point.y)).toEqual(start.map(point => point.y));
  expect(firstAxis.map(point => point.x)).not.toEqual(start.map(point => point.x));
});

test('opposite point flip endpoints use the same transition in reverse', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const frames = await page.evaluate(async () => {
    const [{ point }, { transition }] = await Promise.all([
      import('/dist/point.js'),
      import('/dist/transition-entry.js')
    ]);
    document.body.innerHTML = '<div id="forward"></div><div id="reverse"></div>';
    const rows = [
      { id: 'A', income: 12, health: 61 },
      { id: 'B', income: 36, health: 48 },
      { id: 'C', income: 57, health: 77 }
    ];
    const base = point(rows).x('income').y('health').key('id');
    const flipped = base.flip({ order: ['y', 'x'] });
    const options = target => ({ target, height: 360 });
    const forward = await transition(base, flipped, options('#forward'));
    const reverse = await transition(flipped, base, options('#reverse'));
    const geometry = selector => [...document.querySelectorAll(`${selector} circle.vd-point`)]
      .map(node => ({
        key: node.getAttribute('data-key'),
        x: Number(Number(node.getAttribute('cx')).toFixed(9)),
        y: Number(Number(node.getAttribute('cy')).toFixed(9))
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return [0, 0.17, 0.49, 0.76, 1].map(progress => {
      forward.progress(progress);
      reverse.progress(1 - progress);
      return { forward: geometry('#forward'), reverse: geometry('#reverse') };
    });
  });
  for (const frame of frames) expect(frame.reverse).toEqual(frame.forward);
});

test('point rollup and breakdown are the same transition in reverse', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const frames = await page.evaluate(async () => {
    const [{ point }, { transition }] = await Promise.all([
      import('/dist/point.js'),
      import('/dist/transition-entry.js')
    ]);
    document.body.innerHTML = '<div id="split"></div><div id="merge"></div>';
    const rows = [
      { id: 'A', region: 'North', x: 12, y: 20 },
      { id: 'B', region: 'North', x: 24, y: 32 },
      { id: 'C', region: 'South', x: 55, y: 48 },
      { id: 'D', region: 'South', x: 68, y: 61 }
    ];
    const detailed = point(rows).x('x').y('y').key('id').color('region');
    const summary = detailed.rollup('region', {
      key: 'region',
      size: { op: 'count', range: [10, 22] }
    });
    const options = target => ({ target, height: 360 });
    const split = await transition(summary, detailed, options('#split'));
    const merge = await transition(detailed, summary, options('#merge'));
    const geometry = selector => [...document.querySelectorAll(`${selector} circle.vd-point`)]
      .map(node => ({
        key: node.getAttribute('data-key'),
        x: Number(node.getAttribute('cx')),
        y: Number(node.getAttribute('cy')),
        r: Number(node.getAttribute('r')),
        opacity: Number(node.style.opacity)
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return [0, 0.13, 0.5, 0.82, 1].map(progress => {
      split.progress(progress);
      merge.progress(1 - progress);
      return { split: geometry('#split'), merge: geometry('#merge') };
    });
  });
  for (const frame of frames) expect(frame.merge).toEqual(frame.split);
});

test('point combine starts slowly and accelerates into the summary', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#rollup');
  await ready(page);
  const positionAt = async (progress) => {
    await page.locator('#progress').fill(String(progress));
    return page.locator('#chart circle.vd-point[data-key="detail:Datsun 710"]').evaluate(node => ({
      x: Number(node.getAttribute('cx')),
      y: Number(node.getAttribute('cy'))
    }));
  };
  const start = await positionAt(0);
  const early = await positionAt(0.12);
  const later = await positionAt(0.38);
  const gathered = await positionAt(0.49);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wholeMove = distance(start, gathered);
  const earlyShare = distance(start, early) / wholeMove;
  const laterShare = distance(start, later) / wholeMove;
  expect(earlyShare).toBeLessThan(0.08);
  expect(laterShare).toBeGreaterThan(0.75);
});

test('point detail sets the view before summary points spread', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const frames = await page.evaluate(async () => {
    const [{ point }, { transition }] = await Promise.all([
      import('/dist/point.js'),
      import('/dist/transition-entry.js')
    ]);
    document.body.innerHTML = '<div id="chart"></div>';
    const rows = [
      { id: 'A', region: 'North', x: 10, y: 20 },
      { id: 'B', region: 'North', x: 20, y: 30 },
      { id: 'C', region: 'South', x: 70, y: 80 },
      { id: 'D', region: 'South', x: 90, y: 60 }
    ];
    const detail = point(rows).x('x', { title: 'X' }).y('y', { title: 'Y' })
      .key('id').color('region');
    const summary = detail.rollup('region', { key: 'region' });
    const change = await transition(summary, detail, {
      target: '#chart', height: 360
    });
    const snapshot = () => ({
      points: [...document.querySelectorAll('#chart circle.vd-point')]
        .filter(node => Number(node.style.opacity || 1) > 0)
        .map(node => node.getAttribute('data-key'))
        .sort(),
      axes: [...document.querySelectorAll('#chart .vd-x-axis .tick, #chart .vd-y-axis .tick')]
        .map(node => [node.textContent, node.getAttribute('transform')])
    });
    change.progress(0);
    const start = snapshot();
    change.progress(0.49);
    const viewSet = snapshot();
    change.progress(1);
    const end = snapshot();
    return { start, viewSet, end };
  });

  expect(frames.start.points).toHaveLength(2);
  expect(frames.viewSet.points).toHaveLength(2);
  expect(frames.end.points).toHaveLength(4);
  expect(frames.viewSet.axes).not.toEqual(frames.start.axes);
  expect(frames.start.axes).not.toEqual(frames.end.axes);
});

test('point lab Blend is deterministic decoration and Clean removes it', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#breakdown');
  await ready(page);
  const effect = page.locator('#point-effect');
  await expect(effect).toHaveValue('blend');

  await page.locator('#progress').fill('0.75');
  const layer = page.locator('#chart .vd-point-blend-layer');
  await expect(layer).toHaveCount(1);
  const first = await layer.evaluate(node => ({
    visibility: node.style.visibility,
    opacity: getComputedStyle(node).opacity,
    circles: [...node.querySelectorAll('circle')].map(circle => [
      circle.getAttribute('cx'), circle.getAttribute('cy'), circle.getAttribute('r')
    ])
  }));
  expect(first.visibility).toBe('visible');
  expect(first.opacity).toBe('1');
  await expect(page.locator('#chart .vd-point-crisp-layer')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('#chart .vd-point-crisp-layer')).toHaveCSS('opacity', '1');
  // Six entering detail circles plus two exiting summary circles share the
  // temporary layer while the same cached frame remains reversible.
  expect(first.circles).toHaveLength(8);

  await page.locator('#progress').fill('0.2');
  await page.locator('#progress').fill('0.75');
  expect(await layer.evaluate(node => ({
    visibility: node.style.visibility,
    opacity: getComputedStyle(node).opacity,
    circles: [...node.querySelectorAll('circle')].map(circle => [
      circle.getAttribute('cx'), circle.getAttribute('cy'), circle.getAttribute('r')
    ])
  }))).toEqual(first);

  await effect.selectOption('clean');
  await ready(page);
  await page.locator('#progress').fill('0.75');
  await expect(page.locator('#chart .vd-point-blend-layer')).toHaveCount(0);
  await expect(page.locator('#chart .vd-point-crisp-layer')).toHaveCSS('visibility', 'visible');
});

test('point Blend parent exists only while a child is close enough to connect', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#breakdown');
  await ready(page);

  await page.locator('#progress').fill('0');
  const fullRadii = await page.locator('#chart .vd-point-blend-group').evaluateAll(groups =>
    Object.fromEntries(groups.map(group => [
      String(group.__data__.parent),
      Number(group.querySelector('[data-blend-role="parent"], [data-blend-role="summary"]')?.getAttribute('r'))
    ]))
  );

  const connectionFrames = async (progressValues) => {
    const frames = [];
    for (const progress of progressValues) {
      await page.locator('#progress').fill(String(progress));
      frames.push(await page.locator('#chart .vd-point-blend-group').evaluateAll(groups =>
        groups.map(group => {
          const parent = group.querySelector('[data-blend-role="parent"]');
          const children = [...group.querySelectorAll('[data-blend-role="child"]')];
          if (!parent) return null;
          const px = Number(parent.getAttribute('cx'));
          const py = Number(parent.getAttribute('cy'));
          const strengths = children.map(child => {
            const distance = Math.hypot(
              Number(child.getAttribute('cx')) - px,
              Number(child.getAttribute('cy')) - py
            );
            const disconnectAt = Number(child.getAttribute('r')) + 10;
            const shrinkFrom = disconnectAt * 0.7;
            const t = Math.max(0, Math.min(1,
              (distance - shrinkFrom) / (disconnectAt - shrinkFrom)
            ));
            return 1 - t * t * (3 - 2 * t);
          });
          return {
            parent: String(group.__data__.parent),
            radius: Number(parent.getAttribute('r')),
            connectedShare: strengths.reduce((sum, strength) => sum + strength, 0) / children.length,
            childIsClose: strengths.some(strength => strength > 0)
          };
        }).filter(Boolean)
      ));
    }
    return frames;
  };

  const splitFrames = await connectionFrames([0.66, 0.72, 0.78, 0.84, 0.9, 0.96]);
  for (const frame of splitFrames) {
    for (const parent of frame) {
      expect(parent.radius <= 0.01 || parent.childIsClose).toBe(true);
    }
  }
  expect(splitFrames.some(frame => frame.some(parent => parent.radius > 1))).toBe(true);
  expect(splitFrames.some(frame => frame.some(parent => parent.radius <= 0.01))).toBe(true);
  // Before the endpoint guard is needed, each child contributes an equal share
  // of its own summary circle's authored radius.
  for (const frame of splitFrames.slice(0, 3)) {
    for (const parent of frame) {
      expect(parent.radius / fullRadii[parent.parent]).toBeCloseTo(parent.connectedShare, 4);
    }
  }

  await page.locator('#scenario').selectOption('rollup');
  await ready(page);
  const mergeFrames = await connectionFrames([0.04, 0.1, 0.16, 0.22, 0.28, 0.34]);
  for (const frame of mergeFrames) {
    for (const parent of frame) {
      expect(parent.radius <= 0.01 || parent.childIsClose).toBe(true);
    }
  }
});

test('point lab fits a narrow viewport and keeps progress after resize', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/point-lab.html#rollup');
  await ready(page);
  await page.locator('#progress').fill('0.37');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#value')).toHaveText('0.37');
  await expect(page.locator('#editor')).toBeVisible();
  await page.locator('#progress').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/point-lab-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.screenshot({ path: 'test-results/point-lab-desktop.png', fullPage: true });
});

test('point connector renders lollipop stems and ordered dumbbell links behind dots', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const result = await page.evaluate(async () => {
    const { mount, point } = window.VisDelta;
    document.body.innerHTML = '<div id="lollipop"></div><div id="dumbbell"></div>';

    const lollipop = point([
      { region: 'North', sales: 85 },
      { region: 'South', sales: 60 },
      { region: 'East', sales: 92 }
    ])
      .x('region')
      .y('sales')
      .key('region')
      .connector({ from: 0 });

    const dumbbell = point([
      { country: 'Australia', year: 2005, value: 0.14 },
      { country: 'Australia', year: 2015, value: 0.12 },
      { country: 'Chile', year: 2005, value: 0.39 },
      { country: 'Chile', year: 2015, value: 0.32 }
    ])
      .x('value')
      .y('country')
      .color('year')
      .key(['country', 'year'])
      .connector({ by: 'country', orderBy: 'year' });

    await mount(lollipop, { target: '#lollipop', height: 320 });
    await mount(dumbbell, { target: '#dumbbell', height: 320 });

    const geometry = (selector) => {
      const root = document.querySelector(selector);
      const circles = [...root.querySelectorAll('circle.vd-point')].map(node => ({
        x: Number(node.getAttribute('cx')),
        y: Number(node.getAttribute('cy'))
      }));
      const lines = [...root.querySelectorAll('line.vd-point-connector')].map(node => ({
        key: node.getAttribute('data-key'),
        x1: Number(node.getAttribute('x1')),
        y1: Number(node.getAttribute('y1')),
        x2: Number(node.getAttribute('x2')),
        y2: Number(node.getAttribute('y2'))
      }));
      const layer = root.querySelector('.vd-point-connector-layer');
      const marks = root.querySelector('.vd-point-crisp-layer');
      return {
        circles,
        lines,
        behindDots: Boolean(
          layer && marks &&
          (layer.compareDocumentPosition(marks) & Node.DOCUMENT_POSITION_FOLLOWING)
        )
      };
    };
    return { lollipop: geometry('#lollipop'), dumbbell: geometry('#dumbbell') };
  });

  expect(result.lollipop.lines).toHaveLength(3);
  expect(new Set(result.lollipop.lines.map(line => line.y1.toFixed(6))).size).toBe(1);
  for (const line of result.lollipop.lines) {
    expect(line.x1).toBeCloseTo(line.x2, 6);
    expect(result.lollipop.circles.some(point =>
      Math.abs(point.x - line.x2) < 1e-6 && Math.abs(point.y - line.y2) < 1e-6
    )).toBe(true);
  }
  expect(result.lollipop.behindDots).toBe(true);

  expect(result.dumbbell.lines).toHaveLength(2);
  for (const line of result.dumbbell.lines) {
    expect(line.y1).toBeCloseTo(line.y2, 6);
    const endpoints = result.dumbbell.circles.filter(point =>
      (Math.abs(point.x - line.x1) < 1e-6 && Math.abs(point.y - line.y1) < 1e-6) ||
      (Math.abs(point.x - line.x2) < 1e-6 && Math.abs(point.y - line.y2) < 1e-6)
    );
    expect(endpoints).toHaveLength(2);
  }
  expect(result.dumbbell.behindDots).toBe(true);
});

test('adding and removing a point connector are the same motion in reverse', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const frames = await page.evaluate(async () => {
    const { point, transition } = window.VisDelta;
    document.body.innerHTML = '<div id="forward"></div><div id="reverse"></div>';
    const rows = [
      { region: 'North', sales: 85 },
      { region: 'South', sales: 60 },
      { region: 'East', sales: 92 }
    ];
    const dots = point(rows).x('region').y('sales').key('region');
    const lollipop = dots.connector({ from: 0 });
    const options = target => ({ target, height: 320 });
    const forward = await transition(dots, lollipop, options('#forward'));
    const reverse = await transition(lollipop, dots, options('#reverse'));
    const geometry = selector => [...document.querySelectorAll(`${selector} .vd-point-connector`)]
      .map(node => ({
        key: node.getAttribute('data-key'),
        x1: Number(Number(node.getAttribute('x1')).toFixed(6)),
        y1: Number(Number(node.getAttribute('y1')).toFixed(6)),
        x2: Number(Number(node.getAttribute('x2')).toFixed(6)),
        y2: Number(Number(node.getAttribute('y2')).toFixed(6)),
        opacity: Number(Number(getComputedStyle(node).opacity).toFixed(6))
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return [0.1, 0.28, 0.5, 0.73, 0.9].map(progress => {
      forward.progress(progress);
      reverse.progress(1 - progress);
      return { forward: geometry('#forward'), reverse: geometry('#reverse') };
    });
  });

  for (const frame of frames) expect(frame.reverse).toEqual(frame.forward);
});

test('a constant connector needs an explicit channel when both axes are quantitative', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  const message = await page.evaluate(async () => {
    const { mount, point } = window.VisDelta;
    document.body.innerHTML = '<div id="ambiguous"></div>';
    const state = point([{ id: 'A', x: 10, y: 20 }])
      .x('x')
      .y('y')
      .key('id')
      .connector({ from: 0 });
    try {
      await mount(state, { target: '#ambiguous', height: 320 });
      return '';
    } catch (error) {
      return error.message;
    }
  });

  expect(message).toContain('needs channel "x" or "y"');
});
