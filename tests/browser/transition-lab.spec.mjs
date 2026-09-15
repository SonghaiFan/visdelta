import { test, expect } from '@playwright/test';
import { scenarios } from '../../examples/transition/scenarios.js';

const ready = page => expect(page.locator('#status')).toHaveText('Ready');
const snapshot = page => page.locator('#chart svg').evaluateAll(svgs => svgs.map(svg =>
  Array.from(svg.querySelectorAll('rect.vd-bar, .tick')).map(node => ({
    tag: node.tagName, text: node.textContent,
    attrs: Array.from(node.attributes).map(attr => [attr.name, attr.value]).sort()
  }))));

function editedScenario(sample) {
  if (sample.code.includes('"State"')) {
    return { code: sample.code.replaceAll('"State"', '"Region"'), label: 'Region' };
  }
  return { code: sample.code.replace('"Year"', '"Calendar year"'), label: 'Calendar year' };
}

for (const sample of scenarios) {
  test(`lab ${sample.id}: editable pair, reversible seek, working endpoints`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/docs/.vitepress/dist/transition-lab.html#${sample.id}`);
    await ready(page);
    await expect(page.locator('#scenario option')).toHaveCount(14);
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

    const edited = editedScenario(sample);
    await editor.fill(edited.code);
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    await expect(page.locator('#chart')).toContainText(edited.label);
    await page.locator('#reset').click();
    await ready(page);
    await expect(editor).toHaveValue(sample.code);
    await expect(page.locator('#chart')).not.toContainText('Region');
    expect(errors).toEqual([]);
  });
}

test('invalid code and invalid pairs preserve preview; reset recovers', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html');
  await ready(page);
  const editor = page.locator('#editor');
  const original = await snapshot(page);
  for (const code of ['const broken = ;', 'return {};', 'return { from: { mark: "line" }, to: { mark: "line" } };',
    'const from = bar().data("missing-dataset").x("category").y("value"); return { from, to: from };']) {
    await editor.fill(code);
    await expect(page.locator('#status')).toHaveText('Error');
    await expect(page.getByRole('alert')).toContainText('last successful preview');
    expect(await snapshot(page)).toEqual(original);
    await expect(page.locator('#chart > div')).toHaveCount(1);
  }
  await page.locator('#reset').click();
  await ready(page);
  await expect(page.getByRole('alert')).toBeHidden();
});

test('bar lab exposes the planned split, move, and merge stages', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/.vitepress/dist/transition-lab.html#reaggregate');
  await ready(page);
  await expect(page.locator('#scenario')).toHaveValue('reaggregate');
  await expect(page.locator('#editor')).toHaveValue(/\.datumKey\("id"\)/);
  for (const p of [0, 0.43, 0.79, 1, 0.43, 0]) {
    await page.locator('#progress').fill(String(p));
    await expect(page.locator('#chart .vd-legend-item')).toHaveCount(0);
    const fills = await page.locator('#chart rect.vd-bar').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).fill));
    expect([...new Set(fills)]).toEqual(['rgb(0, 0, 0)']);
  }
  const readDivider = async progress => {
    await page.locator('#progress').fill(String(progress));
    return page.locator('#chart').evaluate(chart => {
    const seam = chart.querySelector('path.vd-bar-seam');
    return seam ? {
      opacity: Number(getComputedStyle(seam).opacity),
      length: seam.getTotalLength()
    } : null;
    });
  };
  const sourceDivider = await readDivider(0.05);
  const targetDivider = await readDivider(0.95);
  expect(sourceDivider?.length).toBeGreaterThan(0);
  expect(targetDivider?.length).toBeGreaterThan(0);
  expect(sourceDivider?.opacity).toBeCloseTo(targetDivider?.opacity, 5);
  expect(sourceDivider?.length).toBeCloseTo(targetDivider?.length, 5);
  await page.locator('#progress').fill('0.5');
  await expect(page.locator('#chart rect.vd-bar')).toHaveCount(4);
  await expect(page.locator('#chart rect.vd-bar').first()).toBeVisible();
  await page.locator('#end').click();
  await expect(page.locator('#chart rect.vd-bar')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('bar focus moves one camera over the full category scale without filtering bars', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html#focus');
  await ready(page);
  const start = await page.locator('#chart rect.vd-bar').evaluateAll(nodes =>
    nodes.map(node => ({
      key: node.getAttribute('data-key'),
      category: node.getAttribute('data-category'),
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')),
      height: Number(node.getAttribute('height'))
    })));
  for (const progress of ['0', '0.25', '0.5', '0.75', '1']) {
    await page.locator('#progress').fill(progress);
    const baseline = await page.locator('#chart svg').evaluate(svg => {
      const translateY = node => Number(
        (node?.getAttribute('transform') || '').match(/translate\([^,]+,\s*([\d.-]+)/)?.[1]
      );
      const frameTop = translateY(svg.querySelector('.vd-frame'));
      const axisY = translateY(svg.querySelector('.vd-x-axis')) - frameTop;
      const bottoms = [...svg.querySelectorAll('rect.vd-bar')]
        .map(bar => Number(bar.getAttribute('y')) + Number(bar.getAttribute('height')));
      return { axisY, bottoms };
    });
    baseline.bottoms.forEach(bottom => expect(Math.abs(bottom - baseline.axisY)).toBeLessThan(0.5));
  }
  await page.locator('#end').click();
  await expect(page.locator('#chart rect.vd-bar')).toHaveCount(52);
  const focused = await page.locator('#chart rect.vd-bar').evaluateAll(nodes =>
    nodes.map(node => ({
      key: node.getAttribute('data-key'),
      category: node.getAttribute('data-category'),
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')),
      height: Number(node.getAttribute('height'))
    })));
  expect(focused).not.toEqual(start);
  const visibility = await page.locator('#chart').evaluate(chart => {
    const clip = chart.querySelector('clipPath[id^="vd-mark-clip-"] rect');
    const width = Number(clip?.getAttribute('width'));
    const height = Number(clip?.getAttribute('height'));
    const bars = [...chart.querySelectorAll('rect.vd-bar')].map(node => ({
      key: node.getAttribute('data-key'),
      category: node.getAttribute('data-category'),
      hasX: node.hasAttribute('x'),
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')),
      height: Number(node.getAttribute('height'))
    }));
    return {
      all: bars.map(bar => bar.key),
      invalid: bars.filter(bar => !bar.hasX || !Number.isFinite(bar.x)),
      inside: bars
        .filter(bar => bar.x + bar.width / 2 >= 0 && bar.x + bar.width / 2 <= width)
        .map(bar => bar.category),
      ticks: [...chart.querySelectorAll('.vd-x-axis .tick')]
        .filter(node => {
          const x = Number((node.getAttribute('transform') || '').match(/translate\(([-\d.]+)/)?.[1]);
          return x >= 0 && x <= width;
        })
        .map(node => node.textContent),
      targetBounds: (() => {
        const target = bars.filter(bar => ['NY', 'PA'].includes(bar.category));
        return {
          x0: Math.min(...target.map(bar => bar.x)),
          y0: Math.min(...target.map(bar => Number(bar.y))),
          x1: Math.max(...target.map(bar => bar.x + bar.width)),
          y1: Math.max(...target.map(bar => Number(bar.y) + Number(bar.height)))
        };
      })(),
      width,
      height
    };
  });
  expect(visibility.all).toHaveLength(52);
  expect(visibility.invalid).toEqual([]);
  expect(visibility.inside).toEqual(expect.arrayContaining(['NY', 'PA']));
  expect(visibility.ticks).toEqual(expect.arrayContaining(['NY', 'PA']));
  expect(visibility.ticks.every(tick => visibility.inside.includes(tick))).toBe(true);
  expect((visibility.targetBounds.x0 + visibility.targetBounds.x1) / 2).toBeCloseTo(visibility.width / 2, 1);
  expect((visibility.targetBounds.y0 + visibility.targetBounds.y1) / 2).toBeCloseTo(visibility.height / 2, 1);
  const sourceNy = start.find(bar => bar.category === 'NY');
  const targetNy = focused.find(bar => bar.category === 'NY');
  expect(targetNy.width / sourceNy.width).toBeCloseTo(targetNy.height / sourceNy.height, 5);
});

test('grouped split keeps aggregate bars on the visible baseline while the legend enters', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html#grouped-split');
  await ready(page);

  for (const progress of ['0', '0.01', '0.03', '0.23', '0.43']) {
    await page.locator('#progress').fill(progress);
    const frame = await page.locator('#chart svg').evaluate((svg) => {
      const numberFromTranslate = (node, index) => {
        const values = (node.getAttribute('transform') || '').match(/-?\d+(?:\.\d+)?/g) || [];
        return Number(values[index] || 0);
      };
      const frameTop = numberFromTranslate(svg.querySelector('.vd-frame'), 1);
      const axisY = numberFromTranslate(svg.querySelector('.vd-x-axis'), 1);
      const clipHeight = Number(svg.querySelector('clipPath[id^="vd-mark-clip-"] rect')?.getAttribute('height'));
      const visible = [...svg.querySelectorAll('rect.vd-bar')]
        .filter((bar) => Number(getComputedStyle(bar).opacity) > 0.001);
      const bottoms = new Map();
      for (const bar of visible) {
        const category = bar.getAttribute('data-category');
        const bottom = Number(bar.getAttribute('y')) + Number(bar.getAttribute('height'));
        bottoms.set(category, Math.max(bottoms.get(category) ?? -Infinity, bottom));
      }
      return { baseline: axisY - frameTop, clipHeight, bottoms: [...bottoms.values()] };
    });

    expect(frame.bottoms.length).toBeGreaterThan(0);
    expect(frame.clipHeight).toBeCloseTo(frame.baseline, 5);
    frame.bottoms.forEach((bottom) => expect(bottom).toBeCloseTo(frame.baseline, 5));
  }
});

test('additive grouped split reaches stacked detail before opening into grouped bars', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html#grouped-split');
  await ready(page);
  const visibleLayouts = async progress => {
    await page.locator('#progress').fill(String(progress));
    return page.locator('#chart').evaluate(chart =>
      [...chart.querySelectorAll('rect.vd-bar')]
        .filter(mark => Number(getComputedStyle(mark).opacity) > 0.001)
        .map(mark => mark.classList.contains('vd-bar-stacked') ? 'stacked'
          : mark.classList.contains('vd-bar-grouped') ? 'grouped' : 'simple')
    );
  };
  const first = await visibleLayouts(0.25);
  const second = await visibleLayouts(0.75);
  expect(first.length).toBeGreaterThan(0);
  expect(first).toContain('stacked');
  expect(first).not.toContain('grouped');
  expect(second.length).toBeGreaterThan(0);
  expect(second).toContain('grouped');
  expect(second).not.toContain('stacked');
});

test('manual run, drafts, switching and playback controls', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html');
  await ready(page);
  await page.locator('#auto-run').uncheck();
  const edited = scenarios[0].code.replaceAll('"State"', '"Region"');
  await page.locator('#editor').fill(edited);
  await expect(page.locator('#status')).toHaveText('Edited · press Run');
  await expect(page.locator('#chart')).not.toContainText('Region');
  await page.locator('#run').click();
  await ready(page);
  await expect(page.locator('#chart')).toContainText('Region');
  await page.locator('#scenario').selectOption('grouped-split');
  await ready(page);
  await expect(page.locator('#editor')).toHaveValue(scenarios.find(s => s.id === 'grouped-split').code);
  await page.locator('#end').click();
  await page.locator('#scenario').selectOption('measure');
  await ready(page);
  await expect(page.locator('#editor')).toHaveValue(edited);
  await expect(page.locator('#value')).toHaveText('0.00');
  await page.locator('#play').click();
  await expect(page.locator('#value')).toHaveText('1.00');
  await page.locator('#reverse').click();
  await expect(page.locator('#value')).toHaveText('0.00');
  await page.locator('#play').click();
  await page.locator('#pause').click();
  const paused = await page.locator('#value').textContent();
  await page.waitForTimeout(150);
  await expect(page.locator('#value')).toHaveText(paused);
});

test('late async evaluation cannot overwrite a newer edit', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html');
  await ready(page);
  await page.locator('#auto-run').uncheck();
  await page.locator('#editor').fill(`await new Promise(resolve => { window.releaseLabRun = resolve; });\n${scenarios[0].code.replaceAll('"State"', '"Stale region"')}`);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Compiling');
  await page.locator('#scenario').selectOption('filter');
  await ready(page);
  await page.evaluate(() => window.releaseLabRun());
  await page.locator('#end').click();
  await expect(page.locator('#chart rect.vd-bar')).toHaveCount(4);
  await expect(page.locator('#chart')).not.toContainText('Stale');
  await expect(page.locator('#chart > div')).toHaveCount(1);
});

test('bar lab loads tidy population observations with ordered age detail', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.url().endsWith('/data/us-population-state-age-tidy.csv')) requests.push(request.url());
  });
  await page.goto('/docs/.vitepress/dist/transition-lab.html#split');
  await ready(page);

  await expect(page.locator('#editor')).toHaveValue(/\.breakdown\("age"\)/);
  await expect(page.locator('#editor')).not.toHaveValue(/\.segment\(\{[\s\S]*fields:/);
  await expect(page.locator('#editor')).toHaveValue(/\.color\("age", \{ domain: AGE_BANDS, range: AGE_COLORS \}\)/);
  await expect(page.locator('#chart rect.vd-bar:not(.vd-bar-segment)')).toHaveCount(52);
  await page.locator('#end').click();
  await expect(page.locator('#chart rect.vd-bar-segment')).toHaveCount(52 * 9);
  await expect(page.locator('#chart .vd-legend-item text')).toHaveText([
    '<10', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '≥80'
  ]);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).pathname).toBe('/docs/.vitepress/dist/data/us-population-state-age-tidy.csv');
});

for (const op of ['sum', 'count']) {
  test(`real population ${op}: sorted detail restores detail order before rollup`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/docs/.vitepress/dist/transition-lab.html#split');
    await ready(page);
    const sample = scenarios.find(scenario => scenario.id === 'split');
    const baseCode = sample.code
      .replace('.breakdown("age")', `.breakdown("age", { op: "${op}" })`)
      .replace('const from = detailed.rollup();', 'const from = detailed;')
      .replace('const to = detailed;', `const to = detailed.rollup({ op: "${op}" });`);
    const geometry = () => page.locator('#chart rect.vd-bar').evaluateAll(nodes => nodes.map(node => ({
      key: node.dataset.key,
      attrs: ['x', 'y', 'width', 'height', 'fill'].map(name => node.getAttribute(name))
    })).sort((a, b) => a.key.localeCompare(b.key)));
    await page.locator('#editor').fill(baseCode);
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    const detailFrame = await geometry();
    await page.locator('#end').click();
    const totalFrame = await geometry();
    await page.locator('#editor').fill(baseCode.replace('const from = detailed;',
      'const from = detailed.sort("population");'));
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    // Editing preserves the slider's current value (the preceding endpoint).
    await page.locator('#start').click();
    const sortedFrame = await geometry();
    expect(sortedFrame).not.toEqual(detailFrame);
    await page.locator('#progress').fill('0.5');
    await expect(page.locator('#chart rect.vd-bar-segment')).toHaveCount(52 * 9);
    expect(await geometry()).toEqual(detailFrame);
    await page.locator('#end').click();
    expect(await geometry()).toEqual(totalFrame);
    await page.locator('#progress').fill('0.5');
    expect(await geometry()).toEqual(detailFrame);
    await page.locator('#start').click();
    expect(await geometry()).toEqual(sortedFrame);
    expect(errors).toEqual([]);
  });

  test(`real population ${op}: focused detail merges before the camera returns`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/docs/.vitepress/dist/transition-lab.html#split');
    await ready(page);
    const sample = scenarios.find(scenario => scenario.id === 'split');
    const code = sample.code
      .replace('.breakdown("age")', `.breakdown("age", { op: "${op}" })`)
      .replace('const from = detailed.rollup();', 'const from = detailed.focus({ state: "AL" });')
      .replace('const to = detailed;', `const to = detailed.rollup({ op: "${op}" });`);
    await page.locator('#editor').fill(code);
    await expect(page.locator('#status')).toHaveText('Waiting for input');
    await ready(page);
    await expect(page.locator('#chart rect.vd-bar-segment')).toHaveCount(52 * 9);
    await page.locator('#progress').fill('0.5');
    await expect(page.locator('#chart rect.vd-bar')).toHaveCount(52);
    const middle = await snapshot(page);
    const camera = () => page.locator('#chart').evaluate(chart => {
      const svg = chart.querySelector('svg');
      return Object.fromEntries(['k', 'x', 'y'].map(key => [key, Number(svg.getAttribute(`data-camera-${key}`))]));
    });
    const focused = await camera();
    expect(Math.abs(focused.x) + Math.abs(focused.y) + Math.abs(focused.k - 1)).toBeGreaterThan(1);
    await page.locator('#chart').screenshot({ path: testInfo.outputPath('focused-rollup.png') });
    await page.locator('#end').click();
    await expect(page.locator('#chart rect.vd-bar')).toHaveCount(52);
    expect(await camera()).toMatchObject({ k: 1, x: 0, y: 0 });
    await page.locator('#progress').fill('0.5');
    expect(await snapshot(page)).toEqual(middle);
    await page.locator('#start').click();
    await expect(page.locator('#chart rect.vd-bar-segment')).toHaveCount(52 * 9);
    expect(errors).toEqual([]);
  });
}

for (const [splitId, mergeId] of [['split', 'merge'], ['grouped-split', 'grouped-merge']]) {
  test(`real population ${splitId} and ${mergeId} use the same frames in reverse`, async ({ page }) => {
    const progressValues = [0, 0.17, 0.5, 0.83, 1];
    const frames = async id => {
      await page.goto('/docs/.vitepress/dist/transition-lab.html');
      await ready(page);
      await page.locator('#scenario').selectOption(id);
      await expect(page.locator('#editor')).toHaveValue(scenarios.find(scenario => scenario.id === id).code);
      await ready(page);
      const values = [];
      for (const progress of progressValues) {
        await page.locator('#progress').fill(String(progress));
        values.push(await page.locator('#chart svg').evaluate(svg => {
          const normalized = value => value == null
            ? null
            : String(value).replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, token =>
                String(Math.round(Number(token) * 1e8) / 1e8));
          return [...svg.querySelectorAll('rect.vd-bar, path.vd-bar-seam')]
            .map(node => ({
              tag: node.tagName,
              className: node.getAttribute('class'),
              key: node.getAttribute('data-key'),
              x: normalized(node.getAttribute('x')),
              y: normalized(node.getAttribute('y')),
              width: normalized(node.getAttribute('width')),
              height: normalized(node.getAttribute('height')),
              d: normalized(node.getAttribute('d')),
              opacity: normalized(getComputedStyle(node).opacity),
              fillOpacity: normalized(getComputedStyle(node).fillOpacity),
              fill: getComputedStyle(node).fill
            }))
            .sort((a, b) => `${a.className}:${a.key}`.localeCompare(`${b.className}:${b.key}`));
        }));
      }
      return values;
    };

    const splitFrames = await frames(splitId);
    const mergeFrames = await frames(mergeId);
    progressValues.forEach((_, index) => {
      expect(mergeFrames[progressValues.length - 1 - index]).toEqual(splitFrames[index]);
    });
  });
}

test('narrow layout fits and resize preserves progress', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/transition-lab.html#split');
  await ready(page);
  await page.locator('#progress').fill('0.37');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#value')).toHaveText('0.37');
  await expect(page.locator('#editor')).toBeVisible();
  await page.locator('#progress').scrollIntoViewIfNeeded();
  await expect(page.locator('#progress')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/transition-lab-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.screenshot({ path: 'test-results/transition-lab-desktop.png', fullPage: true });
});
