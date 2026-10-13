import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
});

for (const chart of ['bar', 'point', 'line', 'area', 'unit']) {
  test(`${chart}: inspecting every phase preserves the visible frame and reverse values`, async ({ page }) => {
    const result = await page.evaluate(async chart => {
      const api = window.VisDelta;
      const rows = [{ id: 'a', x: 1, y: 2 }, { id: 'b', x: 2, y: 5 }];
      const base = chart === 'unit' ? api.unit(rows).key('id').layout('grid') : api[chart](rows).x('x').y('y');
      const end = base.color('#ff3366');
      const host = document.createElement('div'); host.style.width = '600px'; document.body.append(host);
      const controller = await api.transition(base, end, { target: host, width: 600, height: 350 });
      controller.progress(.8); controller.progress(.37);
      const before = host.innerHTML;
      const details = await controller.inspect();
      const unchanged = before === host.innerHTML && controller.value === .37;
      const tracks = details.stages.flatMap(stage => stage.properties);
      const known = tracks.filter(track => track.kind !== 'custom');
      const changed = known.filter(track => track.from !== track.to);
      controller.progress(.8); controller.progress(.37);
      // Reconstruction allocates fresh clip IDs; compare geometry and verify references separately.
      const normalize = html => html.replace(/(vd-[a-z-]+-(?:clip|mask))-\d+/g, '$1');
      const a = normalize(before), b = normalize(host.innerHTML);
      const index = [...a].findIndex((c, i) => c !== b[i]);
      const reversed = a === b;
      const diff = [a.slice(Math.max(0, index - 60), index + 120), b.slice(Math.max(0, index - 60), index + 120)];
      const clipsValid = [...host.querySelectorAll('[clip-path], [mask]')].every(node => {
        const id = (node.getAttribute('clip-path') ?? node.getAttribute('mask')).match(/url\(#(.+)\)/)?.[1];
        return !id || !!host.querySelector(`[id="${id}"]`);
      });
      controller.resize({ width: 500 });
      const resized = await controller.inspect();
      const valid = resized.stages.every(stage => stage.start >= 0 && stage.end <= 1 && stage.end >= stage.start);
      controller.destroy(); host.remove();
      return { diff, clipsValid, unchanged, reversed, valid, phases: details.stages.length, known: known.length, changed: changed.length };
    }, chart);
    expect(result.unchanged).toBe(true);
    expect(result.reversed, JSON.stringify(result.diff)).toBe(true);
    expect(result.clipsValid).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.phases).toBeGreaterThan(0);
    expect(result.known).toBeGreaterThan(0);
    expect(result.changed).toBeGreaterThan(0);
  });
}

test('inspected endpoints agree with independently read SVG attributes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { bar, transition } = window.VisDelta;
    const base = bar([{ x: 'A', y: 2 }, { x: 'B', y: 4 }]).x('x').y('y');
    const host = document.createElement('div'); document.body.append(host);
    const controller = await transition(base, base.color('#ff3366'), { target: host, width: 600, height: 350 });
    const details = await controller.inspect();
    const stage = details.stages[0];
    const fill = stage.properties.find(track => track.kind === 'attribute' && track.name === 'fill' && track.from !== track.to);
    controller.progress(.000001);
    const start = fill.node.getAttribute('fill');
    controller.progress(.999999);
    const end = fill.node.getAttribute('fill');
    controller.destroy(); host.remove();
    return { from: fill.from, to: fill.to, start, end };
  });
  expect(result.from).toBe(result.start);
  expect(result.to).toBe(result.end);
});

test('canonical reverse inspection swaps endpoints and maps property intervals', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { bar, transition } = window.VisDelta;
    const base = bar([{ x: 'A', y: 2 }, { x: 'B', y: 4 }]).x('x').y('y');
    const changed = base.flip().color('#ff3366');
    const hosts = [document.createElement('div'), document.createElement('div')];
    hosts.forEach(host => document.body.append(host));
    const forward = await transition(base, changed, { target: hosts[0], width: 600, height: 350 });
    const reverse = await transition(changed, base, { target: hosts[1], width: 600, height: 350 });
    const [a, b] = await Promise.all([forward.inspect(), reverse.inspect()]);
    const geometry = data => data.stages.flatMap(stage => stage.properties.filter(track => track.node.matches('rect.vd-bar') && ['x', 'y', 'width', 'height'].includes(track.name)).map(track => ({
      name: track.name, key: track.node.getAttribute('data-key'), from: track.from, to: track.to,
    })));
    const left = geometry(a);
    const right = geometry(b);
    const swapped = left.every(track => right.some(other => other.name === track.name && other.key === track.key && other.from === track.to && other.to === track.from));
    forward.destroy(); reverse.destroy(); hosts.forEach(host => host.remove());
    return { count: left.length, swapped, valid: b.stages.every(stage => stage.properties.every(track => track.start >= 0 && track.end <= 1 && track.end >= track.start)) };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.swapped).toBe(true);
  expect(result.valid).toBe(true);
});

test('inspection does not pause playback and rejects after destruction', async ({ page }) => {
  await page.evaluate(async () => {
    const { bar, transition } = window.VisDelta;
    const a = bar([{ x: 'A', y: 2 }]).x('x').y('y');
    const target = document.createElement('div'); document.body.append(target);
    window.inspected = await transition(a, a.color('#ff3366'), { target, width: 500, height: 300 });
    window.inspected.play({ duration: 2000 });
    await window.inspected.inspect();
    window.inspectedAt = window.inspected.value;
  });
  await expect.poll(() => page.evaluate(() => window.inspected.value > window.inspectedAt)).toBe(true);
  const rejected = await page.evaluate(async () => {
    const pending = window.inspected.inspect();
    window.inspected.destroy();
    try { await pending; return false; } catch { return true; }
  });
  expect(rejected).toBe(true);
});

test('stage operations retain authored direction and cannot mutate the planned route', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    const rows = [{id:'a', x:1}, {id:'b', x:3}];
    const a = api.unit(rows).key('id').size(6).layout('grid', {columns:15});
    const b = api.unit(rows).key('id').size(6).x('x').layout('beeswarm');
    const host = document.createElement('div'); document.body.append(host);
    const forward = await api.transition(a, b, {target:host, width:600, height:350});
    const ops = forward.stageOperations();
    ops[0].id = 'mutated';
    const ids = forward.stageOperations().map(op => [op.id, op.action]);
    forward.destroy();
    const reverse = await api.transition(b, a, {target:host, width:600, height:350});
    const reversed = reverse.stageOperations().map(op => [op.id, op.action]);
    reverse.destroy(); host.remove();
    return {ids, reversed};
  });
  expect(result.ids).toEqual([['layout','update']]);
  expect(result.reversed).toEqual([['layout','update']]);
});
