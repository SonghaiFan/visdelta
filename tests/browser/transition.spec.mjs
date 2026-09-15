import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  await page.evaluate(async () => {
    window.sl = window.VisDelta;
    document.body.innerHTML = '<div id="a" style="width:800px"></div><div id="b" style="width:800px"></div>';
    window.rows = [
      { category: 'A', value: 10, other: 35, type: 'one' },
      { category: 'B', value: 30, other: 5, type: 'two' },
      { category: 'C', value: 20, other: 15, type: 'one' }
    ];
    window.base = sl.bar().data(rows).x('category').y('value').key('category');
    window.opts = target => ({ target, height: 400 });
    // Clip IDs are unique per SVG by design; compare geometry and visible content.
    window.snapshot = selector => Array.from(document.querySelector(selector).querySelectorAll('svg *'))
      .filter(node => !node.closest('defs'))
      .map(node => ({
        tag: node.tagName,
        attrs: Array.from(node.attributes).filter(attr => !['id', 'clip-path'].includes(attr.name))
          .sort((a, b) => a.name.localeCompare(b.name)).map(attr => [attr.name, attr.value]),
        text: node.children.length ? '' : node.textContent
      }));
    window.reversibleSnapshot = selector => snapshot(selector).map(node => ({
      ...node,
      attrs: node.attrs.map(([name, value]) => [
        name,
        value.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, token => {
          const number = Number(token);
          return Number.isFinite(number) ? String(Math.round(number * 1e6) / 1e6) : token;
        })
      ])
    }));
  });
});

test('an application holds a chart at an endpoint and hands it to the next transition', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    // The application owns the current state; the runtime keeps no registry.
    let state = base;
    let held = await sl.transition(state, state, opts('#a'));
    held.progress(1);
    const go = async (next) => {
      const change = await sl.transition(state, next, opts('#a'));
      held.destroy();
      held = change; state = next;
      change.progress(1);
    };
    await go(state.focus({ type: 'one' }));
    const focused = state.toSpec().meta.state.scopes.focus;
    const journey = await sl.sequence([state, state.focus({ type: 'two' }), state.focus({ type: 'two' }).focus({ type: 'one' })], opts('#a'));
    held.destroy();
    journey.progress(2);
    return {
      focused,
      final: journey.states[2].toSpec().meta.state.scopes.focus,
      value: journey.value,
      roots: document.querySelectorAll('#a > .vd-transition-root').length
    };
  });
  expect(result.focused).toMatchObject({ mode: 'focus', filter: { field: 'type', equal: 'one' } });
  expect(result.final).toMatchObject({
    mode: 'focus',
    filters: [
      { field: 'type', equal: 'one' },
      { field: 'type', equal: 'two' }
    ]
  });
  expect(result.value).toBe(2);
  expect(result.roots).toBe(1);
  expect(errors).toEqual([]);
});

for (const scenario of ['measure', 'filter', 'highlight', 'color', 'sort', 'flip', 'data', 'split', 'merge', 'layout', 'grouped-split', 'grouped-merge']) {
  test(`${scenario}: direct seek equals history, endpoints restore, frame stays still`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const result = await page.evaluate(async scenario => {
      const segmented = sl.bar().data([
        { category: 'A', type: 'one', value: 10 }, { category: 'A', type: 'two', value: 20 },
        { category: 'B', type: 'one', value: 30 }, { category: 'B', type: 'two', value: 15 }
      ]).x('category').y('value').key('category').breakdown('type');
      const pairs = {
        measure: [base, base.y('other')],
        filter: [base, base.where({ type: 'one' })],
        highlight: [base, base.highlight({ category: 'B' })],
        color: [base.color('#336699'), base.color('#cc6633')],
        sort: [base, base.sort('value', 'descending')],
        flip: [base, base.flip()],
        data: [base, base.data(rows.map(row => ({ ...row, value: row.other })))],
        split: [segmented.rollup(), segmented],
        merge: [segmented, segmented.rollup()],
        layout: [segmented, segmented.layout('grouped')],
        'grouped-split': [segmented.rollup(), segmented.layout('grouped')],
        'grouped-merge': [segmented.layout('grouped'), segmented.rollup()]
      };
      const [from, to] = pairs[scenario];
      window.first = await sl.transition(from, to, opts('#a'));
      window.second = await sl.transition(from, to, opts('#b'));
      const start = snapshot('#a');
      first.progress(0.37);
      const direct = snapshot('#a');
      for (const value of [0.8, 0.2, 1, 0, 0.95, 0.37]) second.progress(value);
      const sought = snapshot('#b');
      first.progress(0);
      const restored = snapshot('#a');
      first.progress(1);
      second.progress(1);
      const endpointsEqual = JSON.stringify(snapshot('#a')) === JSON.stringify(snapshot('#b'));
      second.progress(0.37);
      window.still = JSON.stringify(snapshot('#b'));
      return { direct, sought, start, restored, endpointsEqual, changed: JSON.stringify(start) !== JSON.stringify(direct) };
    }, scenario);
    expect(result.sought).toEqual(result.direct);
    expect(result.restored).toEqual(result.start);
    expect(result.endpointsEqual).toBe(true);
    expect(result.changed).toBe(true);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => JSON.stringify(snapshot('#b')) === still)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const layout of ['stacked', 'grouped']) {
  test(`${layout} split and merge are the same transition in reverse`, async ({ page }) => {
    const result = await page.evaluate(async layout => {
      const detailed = sl.bar().data([
        { category: 'A', type: 'one', value: 10 }, { category: 'A', type: 'two', value: 20 },
        { category: 'B', type: 'one', value: 30 }, { category: 'B', type: 'two', value: 15 }
      ]).x('category').y('value').key('category').breakdown('type').color('type').layout(layout);
      const aggregate = detailed.rollup();
      const split = await sl.transition(aggregate, detailed, opts('#a'));
      const merge = await sl.transition(detailed, aggregate, opts('#b'));
      const splitPhases = split.view.__visDeltaScene.seekSequence?.phases ?? [];
      const frames = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1].map(progress => {
        split.progress(progress);
        merge.progress(1 - progress);
        return { progress, split: reversibleSnapshot('#a'), merge: reversibleSnapshot('#b') };
      });
      return {
        frames,
        phaseLayouts: splitPhases.map(phase =>
          phase.spec.meta?.state?.sceneState?.detail?.layout ?? null
        ),
        authoredEndpointsPreserved:
          JSON.stringify(merge.from) === JSON.stringify(detailed.toSpec()) &&
          JSON.stringify(merge.to) === JSON.stringify(aggregate.toSpec())
      };
    }, layout);
    expect(result.authoredEndpointsPreserved).toBe(true);
    expect(result.phaseLayouts).toEqual(layout === 'grouped'
      ? ['stacked', null]
      : []);
    for (const frame of result.frames) expect(frame.merge).toEqual(frame.split);
  });
}

test('stacked filter continuously moves surviving segments onto their new stack bases', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const data = [
      { id: 'a-low', category: 'A', segment: 'low', value: 4 },
      { id: 'a-high', category: 'A', segment: 'high', value: 6 },
      { id: 'b-low', category: 'B', segment: 'low', value: 3 },
      { id: 'b-high', category: 'B', segment: 'high', value: 5 }
    ];
    const stacked = sl.bar().data(data)
      .datumKey('id')
      .x('category')
      .y('value')
      .breakdown('segment');
    const filtered = stacked.where({ segment: 'high' });
    const change = await sl.transition(stacked, filtered, opts('#a'));
    const frame = progress => {
      change.progress(progress);
      const node = change.view.querySelector('rect[data-key="B|high"]');
      return {
        y: Number(node?.getAttribute('y')),
        height: Number(node?.getAttribute('height'))
      };
    };
    const source = frame(0);
    const afterExit = frame(0.55);
    const middle = frame(0.75);
    const target = frame(1);
    const reverseMiddle = frame(0.75);
    return { source, afterExit, middle, target, reverseMiddle };
  });

  expect(result.source).not.toEqual(result.target);
  expect(result.afterExit).not.toEqual(result.target);
  expect(result.middle.y).toBeGreaterThan(Math.min(result.source.y, result.target.y));
  expect(result.middle.y).toBeLessThan(Math.max(result.source.y, result.target.y));
  expect(result.middle.height).toBe(result.target.height);
  expect(result.reverseMiddle).toEqual(result.middle);
});

test('play uses seek frames; pause, replay, resize and destruction', async ({ page }) => {
  await page.evaluate(async () => {
    window.change = await sl.transition(base, base.y('other'), opts('#a'));
    change.play({ duration: 160 });
  });
  await expect.poll(() => page.evaluate(() => change.value)).toBe(1);
  await page.evaluate(() => change.play({ duration: 1000 }).pause());
  const paused = await page.evaluate(() => change.value);
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => change.value)).toBe(paused);
  const result = await page.evaluate(() => {
    change.progress(0.37);
    document.querySelector('#a').style.width = '500px';
    change.resize();
    const width = change.view.querySelector('svg').viewBox.baseVal.width;
    const fits = width === change.view.clientWidth && width < 600;
    change.play({ duration: 0, from: 1, to: 0 });
    const reversed = change.value;
    change.destroy();
    change.destroy();
    let rejects = false;
    try { change.progress(0.2); } catch { rejects = true; }
    return { fits, reversed, rejects, empty: !document.querySelector('#a').children.length };
  });
  expect(result).toEqual({ fits: true, reversed: 0, rejects: true, empty: true });
});

test('inline data without transforms needs no table-library runtime', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const change = await sl.transition(base, base.y('other'), {
      target: '#a',
      height: 400
    });
    change.progress(0.5);
    return {
      value: change.value,
      marks: change.view.querySelectorAll('rect.vd-bar').length
    };
  });
  expect(result).toEqual({ value: 0.5, marks: 3 });
});

test('reaggregation composes split, update, and merge between unrelated grouping keys', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const cases = [
      { id: 'r1', year: 2020, location: 'A', cases: 10 },
      { id: 'r2', year: 2020, location: 'B', cases: 5 },
      { id: 'r3', year: 2021, location: 'A', cases: 12 },
      { id: 'r4', year: 2021, location: 'B', cases: 8 }
    ];
    const root = sl.bar(cases).datumKey('id').y('cases');
    const byYear = root.x('year').rollup('year');
    const byLocation = root.x('location').rollup('location');
    const change = await sl.transition(byYear, byLocation, opts('#a'));
    const frame = progress => {
      change.progress(progress);
      return {
        bars: change.view.querySelectorAll('rect.vd-bar').length,
        marks: [...change.view.querySelectorAll('rect.vd-bar')].map(node => ({
          key: node.dataset.key,
          opacity: Number(getComputedStyle(node).opacity),
          x: Number(node.getAttribute('x')),
          y: Number(node.getAttribute('y')),
          width: Number(node.getAttribute('width')),
          height: Number(node.getAttribute('height'))
        }))
      };
    };
    const start = frame(0);
    const middle = frame(0.5);
    const end = frame(1);
    return {
      mode: change.delta.lineage.mode,
      edges: change.delta.lineage.edges.length,
      start, middle, end
    };
  });
  expect(result.mode).toBe('reaggregate');
  expect(result.edges).toBe(4);
  expect(result.start.bars).toBe(2);
  expect(result.middle.bars).toBe(4);
  expect(new Set(result.middle.marks.map(mark => mark.key)).size).toBe(4);
  expect(result.middle.marks.every(mark => mark.opacity > 0)).toBe(true);
  expect(result.end.bars).toBe(2);
  expect(errors).toEqual([]);
});

test('additive reaggregation bridges the grouped common grain through stacked totals', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const cases = [
      { id: 'r1', year: 2020, location: 'A', cases: 10 },
      { id: 'r2', year: 2020, location: 'B', cases: 5 },
      { id: 'r3', year: 2021, location: 'A', cases: 12 },
      { id: 'r4', year: 2021, location: 'B', cases: 8 }
    ];
    const root = sl.bar(cases).datumKey('id').y('cases');
    const change = await sl.transition(
      root.x('location').rollup('location'),
      root.x('year').rollup('year'),
      { ...opts('#a'), reconstruct: true }
    );
    change.progress(0.5);
    const phases = change.view.__visDeltaScene.seekSequence.phases;
    const layouts = phases.map(phase =>
      phase.spec.meta?.state?.sceneState?.detail?.layout ?? null
    );
    const reverses = phases.map(phase => phase.reverse ?? false);
    const rendered = phases.map((phase) => {
      change.progress((phase.start + phase.end) / 2);
      const bars = [...change.view.querySelectorAll('rect.vd-bar')]
        .filter(node => Number(getComputedStyle(node).opacity) > 0.001);
      return {
        stacked: bars.some(node => node.classList.contains('vd-bar-stacked')),
        grouped: bars.some(node => node.classList.contains('vd-bar-grouped'))
      };
    });
    const dividerFrame = (phase, localProgress) => {
      change.progress(phase.start + (phase.end - phase.start) * localProgress);
      const seam = [...change.view.querySelectorAll('path.vd-bar-seam')]
        .find(node => Number(getComputedStyle(node).opacity) > 0.001);
      const widths = [...change.view.querySelectorAll('rect.vd-bar')]
        .filter(node => Number(getComputedStyle(node).opacity) > 0.001)
        .map(node => Number(node.getAttribute('width')) || 0);
      return seam ? {
        opacity: Number(getComputedStyle(seam).opacity),
        relativeLength: seam.getTotalLength() / Math.max(...widths, 1)
      } : null;
    };
    const dividerFrames = [
      dividerFrame(phases[0], 0.1),
      dividerFrame(phases.at(-1), 0.9)
    ];
    return { layouts, reverses, rendered, dividerFrames };
  });

  expect(result.layouts).toEqual(['stacked', 'grouped', 'grouped', 'stacked', 'stacked']);
  expect(result.reverses).toEqual([false, false, false, false, true]);
  expect(result.rendered.slice(0, 4)).toEqual([
    { stacked: true, grouped: false },
    { stacked: false, grouped: true },
    { stacked: false, grouped: true },
    { stacked: true, grouped: false }
  ]);
  expect(result.dividerFrames.every(Boolean)).toBe(true);
  expect(result.dividerFrames[0].opacity).toBeCloseTo(result.dividerFrames[1].opacity, 5);
  expect(result.dividerFrames[0].relativeLength)
    .toBeCloseTo(result.dividerFrames[1].relativeLength, 5);
});

test('reaggregation uses the same lineage motion in reverse', async ({ page }) => {
  const frames = await page.evaluate(async () => {
    const cases = [
      { id: 'r1', year: 2020, location: 'A', cases: 10 },
      { id: 'r2', year: 2020, location: 'B', cases: 5 },
      { id: 'r3', year: 2021, location: 'A', cases: 12 },
      { id: 'r4', year: 2021, location: 'B', cases: 8 }
    ];
    const root = sl.bar(cases).datumKey('id').y('cases').color('#195fb5');
    const byYear = root.x('year').rollup('year');
    const byLocation = root.x('location').rollup('location');
    const forward = await sl.transition(byYear, byLocation, opts('#a'));
    const backward = await sl.transition(byLocation, byYear, opts('#b'));
    const motionSnapshot = selector => [...document.querySelectorAll(`${selector} rect.vd-bar`)]
      .map(node => ({
        className: node.getAttribute('class'),
        opacity: Math.round(Number(getComputedStyle(node).opacity) * 1e6) / 1e6,
        rect: ['x', 'y', 'width', 'height'].map(name => Math.round(Number(node.getAttribute(name)) * 1e6) / 1e6)
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return [0, 0.25, 0.5, 0.75, 1].map(progress => {
      forward.progress(progress);
      backward.progress(1 - progress);
      return { forward: motionSnapshot('#a'), backward: motionSnapshot('#b') };
    });
  });
  for (const frame of frames) expect(frame.backward).toEqual(frame.forward);
});

test('a reaggregation sequence hands B to B without an empty boundary frame', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const cases = [
      { id: 'r1', year: 2020, location: 'A', cases: 10 },
      { id: 'r2', year: 2020, location: 'B', cases: 5 },
      { id: 'r3', year: 2021, location: 'A', cases: 12 },
      { id: 'r4', year: 2021, location: 'B', cases: 8 }
    ];
    const root = sl.bar(cases).datumKey('id').y('cases');
    const byYear = root.x('year').rollup('year');
    const byLocation = root.x('location').rollup('location');
    const story = await sl.sequence([byYear, byLocation, byYear], opts('#a'));
    const inspect = progress => {
      story.progress(progress);
      return {
        bars: document.querySelectorAll('#a rect.vd-bar').length,
        roots: document.querySelectorAll('#a > .vd-transition-root').length
      };
    };
    return [inspect(0.999), inspect(1), inspect(1.001)];
  });
  expect(result.every(frame => frame.bars > 0 && frame.roots === 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('reject incompatible pairs and missing data without changing target', async ({ page }) => {
  const result = await page.evaluate(async () => {
    document.querySelector('#a').textContent = 'keep';
    const messages = [];
    for (const pair of [[base, sl.line().data(rows)], [sl.bar({ name: 'missing' }), sl.bar({ name: 'missing' })]]) {
      try { await sl.transition(...pair, opts('#a')); } catch (error) { messages.push(error.message); }
    }
    return { messages, text: document.querySelector('#a').textContent };
  });
  expect(result.messages[0]).toContain('same chart type');
  expect(result.messages[1]).toContain('missing dataset');
  expect(result.text).toBe('keep');
});

test('a numeric midpoint interpolates geometry and endpoints contain only live marks', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = base.y('value', { domain: [0, 40] }).transition({ duration: 1000, ease: 'linear', stagger: 0 });
    const b = a.y('other', { domain: [0, 40] });
    const pair = await sl.transition(a, b, opts('#a'));
    const heights = () => [...pair.view.querySelectorAll('rect.vd-bar')].map(node => Number(node.getAttribute('height')));
    const start = heights();
    pair.progress(1);
    const end = heights();
    pair.progress(0.5);
    const middle = heights();
    pair.destroy();
    const filtered = await sl.transition(base, base.where({ type: 'one' }), opts('#a'));
    filtered.progress(1);
    const remaining = filtered.view.querySelectorAll('rect.vd-bar').length;
    filtered.progress(0);
    const restored = filtered.view.querySelectorAll('rect.vd-bar').length;
    return { start, end, middle, remaining, restored };
  });
  expect(result.middle).toHaveLength(3);
  result.middle.forEach((height, index) => expect(height).toBeCloseTo((result.start[index] + result.end[index]) / 2, 5));
  expect(result.remaining).toBe(2);
  expect(result.restored).toBe(3);
});

test('incompatible axes crossfade in place instead of exiting and entering', async ({ page }) => {
  const frames = await page.evaluate(async () => {
    const change = await sl.transition(base, base.flip(), opts('#a'));
    const frame = progress => {
      change.progress(progress);
      const opacity = node => Number(getComputedStyle(node).opacity);
      const translate = node => {
        const values = (node.getAttribute('transform') || '').match(/-?[\d.]+/g) || [];
        return values.slice(0, 2).map(Number);
      };
      return {
        progress,
        x: opacity(change.view.querySelector('.vd-x-axis')),
        y: opacity(change.view.querySelector('.vd-y-axis')),
        xPosition: translate(change.view.querySelector('.vd-x-axis')),
        yPosition: translate(change.view.querySelector('.vd-y-axis')),
        ghostAxes: [...change.view.querySelectorAll('.vd-axis-ghost')].map(node => ({
          opacity: opacity(node),
          position: translate(node),
          labels: [...node.querySelectorAll('.tick text')].map(label => label.textContent)
        })),
        labels: [...change.view.querySelectorAll('.vd-x-label, .vd-y-label')].map(node => node.textContent),
        ghostLabelCount: change.view.querySelectorAll('.vd-axis-label-ghost').length
      };
    };
    return [frame(0), frame(0.001), frame(0.5), frame(1)];
  });
  expect(frames[0].ghostAxes).toHaveLength(0);
  expect(frames[1].ghostAxes).toHaveLength(2);
  expect(frames[1].ghostAxes.every(axis => axis.opacity > 0.99)).toBe(true);
  const oldX = frames[1].ghostAxes.find(axis => axis.labels.includes('A'));
  const oldY = frames[1].ghostAxes.find(axis => !axis.labels.includes('A'));
  expect(oldX).toBeTruthy();
  expect(oldY).toBeTruthy();
  expect(frames.every(frame => frame.labels.length === 2)).toBe(true);
  expect(frames.every(frame => frame.ghostLabelCount === 0)).toBe(true);
  expect(frames[1].xPosition[0]).toBeCloseTo(oldX.position[0], 2);
  expect(frames[1].xPosition[1]).toBeCloseTo(oldX.position[1], 2);
  expect(frames[1].yPosition[0]).toBeCloseTo(oldY.position[0], 2);
  expect(frames[1].yPosition[1]).toBeCloseTo(oldY.position[1], 2);
  expect(frames[2].ghostAxes.some(axis => axis.opacity < 0.99)).toBe(true);
  expect(frames[3].ghostAxes).toHaveLength(0);
  expect(frames[3].x).toBe(1);
  expect(frames[3].y).toBe(1);
});

test('URL data loads once, .data replacement is resolved, and later seeks do not reload', async ({ page }) => {
  let requests = 0;
  await page.route('**/pair-rows.json', route => {
    requests++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ category: 'A', value: 20, other: 40 }]) });
  });
  const result = await page.evaluate(async () => {
    const from = sl.bar().data({ url: '/pair-rows.json' }).x('category').y('value');
    const pair = await sl.transition(from, from.y('other'), opts('#a'));
    pair.progress(0.8).progress(0.2).progress(1).progress(0.37);
    const deltaTypes = pair.delta.deltas.map(item => item.type);
    pair.destroy();
    const named = sl.bar({ name: 'rows' }).x('category').y('value');
    const next = await sl.transition(named, named.y('other'), { ...opts('#a'), data: { rows } });
    return { deltaTypes, marks: next.view.querySelectorAll('rect.vd-bar').length };
  });
  expect(requests).toBe(1);
  expect(result.deltaTypes).toContain('encoding.y');
  expect(result.marks).toBe(3);
});

for (const chartType of ['line', 'point', 'unit']) {
  test(`${chartType}: same-type pair has reproducible frames`, async ({ page }) => {
    const result = await page.evaluate(async chartType => {
      const input = [
        { id: 'a', x: 1, y: 20, other: 35, group: 'one', count: 2 },
        { id: 'b', x: 2, y: 30, other: 10, group: 'two', count: 3 }
      ];
      let from = sl[chartType]().data(input).x('x').y('y').key('id');
      let to = from.y('other');
      if (chartType === 'unit') {
        from = from.value('count').columns(6);
        to = from.group('group').layout('bar', { columns: 2 });
      }
      const a = await sl.transition(from, to, opts('#a'));
      const b = await sl.transition(from, to, opts('#b'));
      a.progress(0.37);
      b.progress(1).progress(0.2).progress(0).progress(0.37);
      return { a: snapshot('#a'), b: snapshot('#b'), marks: a.view.querySelectorAll('circle, path.vd-line, rect.vd-unit').length };
    }, chartType);
    expect(result.a).toEqual(result.b);
    expect(result.marks).toBeGreaterThan(0);
  });
}

test('empty endpoint can be sought without background motion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const to = base.where({ category: 'missing' });
    const a = await sl.transition(base, to, opts('#a'));
    const b = await sl.transition(base, to, opts('#b'));
    a.progress(0.37);
    b.progress(1).progress(0).progress(0.37);
    const same = JSON.stringify(snapshot('#a')) === JSON.stringify(snapshot('#b'));
    window.still = JSON.stringify(snapshot('#b'));
    return same;
  });
  expect(result).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => JSON.stringify(snapshot('#b')) === still)).toBe(true);
});
