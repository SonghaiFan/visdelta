import { test, expect } from '@playwright/test';
import { expectEditorCode, fromEditor, setCells, setEditorCode, toEditor } from './code-editor.mjs';

test('entering a bar tab does not advance its authored-pair progress', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#bar/measure');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.locator('#end').click();
  await page.getByRole('tab', { name: /^Grain/i }).click();
  await expect(page.locator('#status')).toHaveText('Switching tabs');
  const values = await page.evaluate(async () => {
    const values = [];
    while (document.querySelector('#status').textContent === 'Switching tabs') {
      values.push([document.querySelector('#progress').value, document.querySelector('#value').textContent]);
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  expect(values.length).toBeGreaterThan(1);
  expect(values.every(([progress, label]) => progress === '0' && label === '0.00')).toBe(true);
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.locator('#play').click();
  await expect(page.locator('#value')).toHaveText('1.00');
});
import { scenarios } from '../../examples/transition/scenarios.js';

const seekProgress = (page, progress) => page.locator('#progress').evaluate((input, value) => {
  // Planned boundaries need not align with the product slider's 0.01 step.
  input.step = 'any';
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, progress);
const ready = page => expect(page.locator('#status')).toHaveText('Ready');
const chooseScenario = async (page, id) => {
  const sample = scenarios.find(candidate => candidate.id === id);
  await page.getByRole('tab', { name: new RegExp(`^${sample.category}`, 'i') }).click();
  await page.locator(`[data-scenario="${id}"]`).click();
};
const snapshot = page => page.locator('#chart svg').evaluateAll(svgs => svgs.map(svg =>
  Array.from(svg.querySelectorAll('rect.vd-bar, .tick')).map(node => ({
    tag: node.tagName, text: node.textContent,
    attrs: Array.from(node.attributes).map(attr => [attr.name, attr.value]).sort()
  }))));

function editedScenario(sample) {
  const xCall = sample.code.match(/\.x\("([^"]+)"(?:,\s*(\{[^)]*\}))?\)/);
  if (!xCall) throw new Error(`Scenario ${sample.id} has no editable x encoding.`);
  const [, field, authoredOptions] = xCall;
  const label = field === 'year' ? 'Calendar year' : 'Region';
  let options = authoredOptions;
  if (options && /\btitle\s*:/.test(options)) {
    options = options.replace(/(\btitle\s*:\s*)["'][^"']*["']/, `$1"${label}"`);
  } else if (options) {
    options = options.replace(/}\s*$/, `, title: "${label}" }`);
  } else {
    options = `{ title: "${label}" }`;
  }
  return {
    code: sample.code.replace(xCall[0], `.x("${field}", ${options})`),
    label
  };
}

for (const sample of scenarios) {
  test(`lab ${sample.id}: editable pair, reversible seek, working endpoints`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/docs/.vitepress/dist/playground.html#bar/${sample.id}`);
    await ready(page);
    await expect(page.locator('.playground-category-tabs [role=tab]')).toHaveCount(7);
    const editor = page.getByRole('textbox', { name: 'Editable VisDelta code' });
    await expectEditorCode(editor, sample.code);
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
    await setEditorCode(editor, edited.code);
    await expectEditorCode(editor, edited.code);
    await ready(page);
    await expect(page.locator('#chart')).toContainText(edited.label);
    await page.locator('#reset').click();
    await ready(page);
    await expectEditorCode(editor, sample.code);
    await expect(page.locator('#chart')).not.toContainText('Region');
    expect(errors).toEqual([]);
  });
}

test('invalid code and invalid pairs preserve preview; reset recovers', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#bar/');
  await ready(page);
  const editor = page.locator('#editor');
  const original = await snapshot(page);
  for (const code of ['const broken = ;', 'return {};', 'return { from: { mark: "line" }, to: { mark: "line" } };',
    'const from = bar().data("missing-dataset").x("category").y("value"); return { from, to: from };']) {
    await setEditorCode(editor, code);
    await expect(page.locator('#status')).toHaveText('Error');
    await expect(page.getByRole('alert')).toContainText('last successful preview');
    await expect(page.locator('.playground-chart-stage')).toHaveClass(/is-error/);
    await expect(page.locator('#chart')).toHaveCSS('filter', /blur\(6px\)/);
    expect(await snapshot(page)).toEqual(original);
    await expect(page.locator('#chart > div')).toHaveCount(1);
  }
  await page.locator('#reset').click();
  await ready(page);
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('.playground-chart-stage')).not.toHaveClass(/is-error/);
});

test('bar lab exposes the planned split, move, and merge stages', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/.vitepress/dist/playground.html#bar/reaggregate');
  await ready(page);
  await expect(page.locator('[data-scenario="reaggregate"]')).toHaveAttribute('aria-pressed', 'true');
  await expectEditorCode(page.locator('#editor'), /\.datumKey\("id"\)/);
  for (const p of [0, 0.43, 0.79, 1, 0.43, 0]) {
    await page.locator('#progress').fill(String(p));
    await expect(page.locator('#chart .vd-legend-item')).toHaveCount(0);
    const fills = await page.locator('#chart rect.vd-bar').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).fill));
    expect([...new Set(fills)]).toEqual(['rgb(0, 0, 0)']);
  }
  const phases = await page.locator('#chart').evaluate(chart => {
    const sceneNode = [...chart.querySelectorAll('*')]
      .find(node => node.__visDeltaScene?.seekSequence);
    const scenePhases = sceneNode?.__visDeltaScene.seekSequence.phases ?? [];
    return scenePhases.map(phase => {
      const endpoint = phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec;
      const encoding = endpoint.encoding ?? {};
      const sourceEncoding = phase.transitionSource.effectiveViewSpec?.encoding ?? {};
      return {
        start: phase.start,
        end: phase.end,
        reverse: phase.reverse ?? false,
        sourceCategory: sourceEncoding.x?.field ?? sourceEncoding.y?.field ?? null,
        grainChange: Boolean(sourceEncoding.detail) !== Boolean(phase.spec.encoding?.detail),
        detail: endpoint.encoding?.detail?.field ?? null,
        layout: encoding.xOffset?.field || encoding.yOffset?.field
          ? 'grouped'
          : encoding.detail?.field ? 'stacked' : 'simple',
        groupby: endpoint.transform?.find(transform => transform.aggregate)?.aggregate?.groupby ?? []
      };
    });
  });
  const detailedPhases = phases.filter(phase => phase.grainChange);
  expect(detailedPhases.length).toBeGreaterThan(1);
  const sourcePhase = detailedPhases[0];
  const targetPhase = detailedPhases.at(-1);
  const phaseProgress = (phase, local, wholePairReverse) => {
    const phaseLocal = phase.reverse ? 1 - local : local;
    const canonicalProgress = phase.start + (phase.end - phase.start) * phaseLocal;
    return wholePairReverse ? 1 - canonicalProgress : canonicalProgress;
  };
  const readDivider = async progress => {
    await seekProgress(page, progress);
    return page.locator('#chart').evaluate(chart => {
      const seam = chart.querySelector('path.vd-bar-seam');
      return seam ? {
        opacity: Number(getComputedStyle(seam).opacity),
        length: seam.getTotalLength()
      } : null;
    });
  };
  // The authored source is year; the canonical route begins at location.
  const wholePairReverse = phases[0]?.sourceCategory !== 'year';
  expect(wholePairReverse).toBe(true);
  const sourceDivider = await readDivider(phaseProgress(sourcePhase, 0.3, wholePairReverse));
  const targetDivider = await readDivider(phaseProgress(targetPhase, 0.3, wholePairReverse));
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

test('bar marks are fill-only in simple, grouped, and stacked endpoints', async ({ page }) => {
  for (const id of ['sort', 'layout', 'split']) {
    await page.goto(`/docs/.vitepress/dist/playground.html#bar/${id}`);
    await page.reload();
    await ready(page);
    await page.locator('#end').click();
    const strokes = await page.locator('#chart rect.vd-bar').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).stroke));
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every(stroke => stroke === 'none')).toBe(true);
  }
});

test('bar focus moves one camera over the full category scale without filtering bars', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#bar/focus');
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
  // Tick collision handling may omit an anchor label. The target bars must
  // remain in the viewport; any tick that is drawn must describe a visible bar.
  expect(visibility.ticks.length).toBeGreaterThan(0);
  expect(visibility.ticks.every(tick => visibility.inside.includes(tick))).toBe(true);
  expect((visibility.targetBounds.x0 + visibility.targetBounds.x1) / 2).toBeCloseTo(visibility.width / 2, 1);
  expect((visibility.targetBounds.y0 + visibility.targetBounds.y1) / 2).toBeCloseTo(visibility.height / 2, 1);
  const sourceNy = start.find(bar => bar.category === 'NY');
  const targetNy = focused.find(bar => bar.category === 'NY');
  expect(targetNy.width / sourceNy.width).toBeCloseTo(targetNy.height / sourceNy.height, 5);
});

test('grouped split keeps aggregate bars on the visible baseline while the legend enters', async ({ page }) => {
  await page.goto('/docs/.vitepress/dist/playground.html#bar/grouped-split');
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
  await page.goto('/docs/.vitepress/dist/playground.html#bar/grouped-split');
  await ready(page);
  const visibleLayouts = async progress => {
    await seekProgress(page, progress);
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
  await page.goto('/docs/.vitepress/dist/playground.html#bar/');
  await ready(page);
  await page.locator('#auto-run').uncheck();
  const edited = scenarios[0].code
    .replace('.x("state")', '.x("state", { title: "Region" })')
    .replaceAll('"State"', '"Region"');
  await setEditorCode(page.locator('#editor'), edited);
  await expect(page.locator('#status')).toHaveText('Edited · press Run');
  await expect(page.locator('#chart')).not.toContainText('Region');
  await page.locator('#run').click();
  await ready(page);
  await expect(page.locator('#chart')).toContainText('Region');
  await chooseScenario(page, 'grouped-split');
  await ready(page);
  await expectEditorCode(page.locator('#editor'), scenarios.find(s => s.id === 'grouped-split').code);
  await page.locator('#end').click();
  await chooseScenario(page, 'measure');
  await ready(page);
  await expectEditorCode(page.locator('#editor'), edited);
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
  await page.goto('/docs/.vitepress/dist/playground.html#bar/');
  await ready(page);
  await page.locator('#auto-run').uncheck();
  await setEditorCode(page.locator('#editor'), `await new Promise(resolve => { window.releaseLabRun = resolve; });\n${scenarios[0].code
    .replace('.x("state")', '.x("state", { title: "Stale region" })')
    .replaceAll('"State"', '"Stale region"')}`);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Compiling');
  await chooseScenario(page, 'filter');
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
  await page.goto('/docs/.vitepress/dist/playground.html#bar/split');
  await ready(page);

  await expectEditorCode(page.locator('#editor'), /\.breakdown\("age"\)/);
  await expectEditorCode(page.locator('#editor'), /\.segment\(\{[\s\S]*fields:/, { not: true });
  await expectEditorCode(page.locator('#editor'), /\.color\("age", \{ domain: \["<10", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "≥80"\], scheme: "Blues" \}\)/);
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
    await page.goto('/docs/.vitepress/dist/playground.html#bar/split');
    await ready(page);
    const sample = scenarios.find(scenario => scenario.id === 'split');
    const detailCode = sample.toCode
      .replace(/^const to = /, 'const from = ')
      .replace('.breakdown("age")', `.breakdown("age", { op: "${op}" })`);
    const totalCode = sample.code
      .replace(/^const from = /, 'const to = ')
      .replace('.breakdown("age")', `.breakdown("age", { op: "${op}" })`)
      .replace('.rollup()', op === 'count' ? '.rollup({ op: "count" })' : '.rollup()');
    const geometry = () => page.locator('#chart rect.vd-bar').evaluateAll(nodes => nodes.map(node => ({
      key: node.dataset.key,
      attrs: ['x', 'y', 'width', 'height', 'fill'].map(name => node.getAttribute(name))
    })).sort((a, b) => a.key.localeCompare(b.key)));
    const axes = () => page.locator('#chart .tick, #chart .domain, #chart .vd-x-label, #chart .vd-y-label')
      .evaluateAll(nodes => nodes.map(node => ({
        text: node.textContent,
        attrs: [...node.attributes].map(({ name, value }) => [name, value
          .replace(/,\s*/g, ',').replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
            token => String(Number(Number(token).toFixed(4))))]).sort()
      })));
    await setCells(page, detailCode, totalCode);
    await expectEditorCode(fromEditor(page), /\.breakdown\("age", \{ op: "(?:sum|count)" \}\)/);
    await expectEditorCode(toEditor(page), op === 'count' ? /\.rollup\(\{ op: "count" \}\)/ : /\.rollup\(\)/);
    await ready(page);
    const detailFrame = await geometry();
    const detailAxes = await axes();
    await page.locator('#end').click();
    const totalFrame = await geometry();
    const totalAxes = await axes();
    const sortedDetailCode = detailCode.replace(/;\s*$/, '\n  .sort("population");');
    await setEditorCode(fromEditor(page), sortedDetailCode);
    await expectEditorCode(fromEditor(page), /\.sort\("population"\)/);
    await ready(page);
    // Editing preserves the slider's current value (the preceding endpoint).
    await page.locator('#start').click();
    const sortedFrame = await geometry();
    const sortedAxes = await axes();
    expect(sortedFrame).not.toEqual(detailFrame);
    const unsortEnd = await page.locator('#chart').evaluate(chart => {
      const node = [...chart.querySelectorAll('*')].find(node => node.__visDeltaScene?.seekSequence);
      const phases = node.__visDeltaScene.seekSequence.phases;
      const sortPhase = phases.find(phase => phase.spec.transform?.some(transform => transform.sort));
      if (!sortPhase) throw new Error('The sorted detail route has no sort phase.');
      // Detail -> total reverses the canonical total -> detail route.
      return 1 - sortPhase.start;
    });
    await seekProgress(page, unsortEnd);
    await expect(page.locator('#chart rect.vd-bar-segment')).toHaveCount(52 * 9);
    expect(await geometry()).toEqual(detailFrame);
    expect(await axes()).toEqual(detailAxes);
    await page.locator('#end').click();
    expect(await geometry()).toEqual(totalFrame);
    expect(await axes()).toEqual(totalAxes);
    await seekProgress(page, unsortEnd);
    expect(await geometry()).toEqual(detailFrame);
    expect(await axes()).toEqual(detailAxes);
    await page.locator('#start').click();
    expect(await geometry()).toEqual(sortedFrame);
    expect(await axes()).toEqual(sortedAxes);
    expect(errors).toEqual([]);
  });

  test(`real population ${op}: focused detail merges before the camera returns`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/docs/.vitepress/dist/playground.html#bar/split');
    await ready(page);
    const sample = scenarios.find(scenario => scenario.id === 'split');
    const detailCode = sample.toCode
      .replace(/^const to = /, 'const from = ')
      .replace('.breakdown("age")', `.breakdown("age", { op: "${op}" })`)
      .replace(/;\s*$/, '\n  .focus({ state: "AL" });');
    const totalCode = sample.code
      .replace(/^const from = /, 'const to = ')
      .replace('.breakdown("age")', `.breakdown("age", { op: "${op}" })`)
      .replace('.rollup()', op === 'count' ? '.rollup({ op: "count" })' : '.rollup()');
    // Establish this reducer first: changing sum -> count also adds Grain
    // legs to the editor's bridge, separate from the focus/merge contract.
    const unfocusedDetailCode = detailCode.replace(/\n\s*\.focus\(\{ state: "AL" \}\);\s*$/, ';');
    await setCells(page, unfocusedDetailCode, totalCode);
    await ready(page);
    await setEditorCode(fromEditor(page), detailCode);
    await expectEditorCode(fromEditor(page), /\.focus\(\{ state: "AL" \}\)/);
    await expectEditorCode(toEditor(page), op === 'count' ? /\.rollup\(\{ op: "count" \}\)/ : /\.rollup\(\)/);
    await ready(page);
    await expect(page.locator('#chart rect.vd-bar-segment')).toHaveCount(52 * 9);
    const mergeEnd = await page.locator('#chart').evaluate(chart => {
      const node = [...chart.querySelectorAll('*')].find(node => node.__visDeltaScene?.seekSequence);
      const phases = node.__visDeltaScene.seekSequence.phases;
      const grainPhase = phases.find(phase => {
        const logicalStart = phase.reverse ? phase.spec : phase.transitionSource.effectiveViewSpec;
        const logicalEnd = phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec;
        return !logicalStart.encoding?.detail && Boolean(logicalEnd.encoding?.detail);
      });
      if (!grainPhase) throw new Error('The focused detail route has no refinement phase.');
      // The authored merge evaluates the canonical total -> detail path backward.
      return 1 - grainPhase.start;
    });
    await seekProgress(page, mergeEnd);
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
    await seekProgress(page, mergeEnd);
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
      await page.goto('/docs/.vitepress/dist/playground.html#bar/');
      await ready(page);
      await chooseScenario(page, id);
      await expectEditorCode(page.locator('#editor'), scenarios.find(scenario => scenario.id === id).code);
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
  await page.goto('/docs/.vitepress/dist/playground.html#bar/split');
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
