import { test, expect } from '@playwright/test';

test('Unit layout bundle retains staged geometry and preserves static endpoints through replay and resize', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const api = window.VisDelta;
    const rows = Array.from({ length: 24 }, (_, i) => ({ id: String(i), x: i % 8, group: i % 2 }));
    const from = api.unit(rows).key('id').size(6).layout('grid', { columns: 6 }).color('#3366ff').with({ margin: { top: 28, right: 20, bottom: 40, left: 40 } });
    const to = api.unit(rows).key('id').size(6).layout('beeswarm', { x: 'x' }).color('#3366ff').with({ margin: { top: 28, right: 20, bottom: 40, left: 40 } });
    const hosts = Array.from({length: 4}, () => { const h = document.createElement('div'); document.body.append(h); return h; });
    const opts = target => ({target, width:600, height:350});
    const pair = await api.transition(from, to, opts(hosts[0]));
    const reverse = await api.transition(to, from, opts(hosts[1]));
    const a = await api.transition(from, from, opts(hosts[2]));
    const b = await api.transition(to, to, opts(hosts[3]));
    const read = host => [...host.querySelectorAll('circle.vd-unit')].map(node => ({
      key: node.getAttribute('data-key'),
      cx: +Number(node.getAttribute('cx')).toFixed(5), cy: +Number(node.getAttribute('cy')).toFixed(5),
      r: +Number(node.getAttribute('r')).toFixed(5), fill: node.getAttribute('fill')
    })).sort((a,b) => a.key.localeCompare(b.key));
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(message); };
    const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    check(pair.stageCount() === 1 && reverse.stageCount() === 1, 'one layout stage');
    for (const width of [600, 390]) {
      for (const controller of [pair, reverse, a, b]) controller.resize({width, height:350});
      a.progress(1); b.progress(1);
      pair.progress(0); check(equal(read(hosts[0]), read(hosts[2])), `source at ${width}`);
      pair.progress(1); check(equal(read(hosts[0]), read(hosts[3])), `target at ${width}`);
      reverse.progress(0); check(equal(read(hosts[1]), read(hosts[3])), `reverse source at ${width}`);
      reverse.progress(1); check(equal(read(hosts[1]), read(hosts[2])), `reverse target at ${width}`);
      pair.progress(.3); pair.progress(.5); const middle = read(hosts[0]);
      pair.progress(.8); pair.progress(.3); pair.progress(.5); check(equal(middle, read(hosts[0])), `repeatable forward midpoint at ${width}`);
      check(!equal(middle, read(hosts[2])) && !equal(middle, read(hosts[3])), `moving midpoint at ${width}`);
      const details = await pair.inspect();
      let verified = 0;
      for (const phase of details.stages) {
        const nodes = new Set(phase.properties.filter(track => track.node.matches('circle.vd-unit')).map(track => track.node));
        for (const node of nodes) {
          const tracks = ['cx','cy','r'].map(name => phase.properties.find(track => track.node === node && track.name === name));
          if (tracks.every(Boolean)) {
            check(tracks[2].start === tracks[0].start && tracks[2].end === tracks[0].end, 'radius follows horizontal move');
            check(tracks[1].start >= tracks[0].end - 1e-8, 'vertical fall follows horizontal move');
            verified++;
          }
        }
      }
      check(verified === rows.length, 'all circles have staged geometry tracks');
    }
    const play = async (from, to) => {
      pair.play({from,to,duration:120});
      const deadline = performance.now() + 3000;
      while (pair.value !== to && performance.now() < deadline) await new Promise(requestAnimationFrame);
      check(pair.value === to, `play reaches ${to}`);
    };
    await play(0,1); check(equal(read(hosts[0]), read(hosts[3])), 'played target');
    await play(1,0); check(equal(read(hosts[0]), read(hosts[2])), 'played source');
    for (const controller of [pair, reverse, a, b]) controller.destroy();
    hosts.forEach(host => host.remove());
    return errors;
  });
  expect(result).toEqual([]);
});

test('Unit size renders as mark geometry and later position assignments match a direct declaration', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await page.waitForSelector('rect.vd-bar');
  const result = await page.evaluate(async () => {
    const { unit, transition } = window.VisDelta;
    const rows = [{ id: 'a', length: 1, width: 5 }, { id: 'b', length: 3, width: 2 }];
    const base = unit(rows).key('id').size(6).layout('grid', { columns: 2 });
    const hosts = Array.from({ length: 4 }, () => document.body.appendChild(document.createElement('div')));
    const options = target => ({ target, width: 600, height: 350 });
    const size = await transition(base, base.size(9), options(hosts[0]));
    const alias = await transition(base.radius(9), base.radius(9), options(hosts[1]));
    const overwritten = base.layout('beeswarm', { x: { field: 'length', domain: [0, 20], label: 'Old' } }).x('width');
    const direct = base.layout('beeswarm', { x: 'width' });
    const a = await transition(overwritten, overwritten, options(hosts[2]));
    const b = await transition(direct, direct, options(hosts[3]));
    const radii = host => [...host.querySelectorAll('circle.vd-unit')].map(node => +node.getAttribute('r'));
    size.progress(0); const start = radii(hosts[0]);
    size.progress(.5); const middle = radii(hosts[0]);
    size.progress(1); const end = radii(hosts[0]);
    size.progress(0); const restored = radii(hosts[0]);
    const geometry = host => [...host.querySelectorAll('circle.vd-unit')].map(node => ['cx','cy','r'].map(name => node.getAttribute(name)));
    const result = { start, middle, end, restored, alias: radii(hosts[1]), samePosition: JSON.stringify(geometry(hosts[2])) === JSON.stringify(geometry(hosts[3])), operation: size.stageOperations()[0].id };
    [size, alias, a, b].forEach(controller => controller.destroy());
    hosts.forEach(host => host.remove());
    return result;
  });
  expect(result.start).toEqual([6, 6]);
  expect(result.end).toEqual([9, 9]);
  expect(result.alias).toEqual(result.end);
  expect(result.restored).toEqual(result.start);
  expect(result.middle.every(radius => radius > 6 && radius < 9)).toBe(true);
  expect(result.samePosition).toBe(true);
  expect(result.operation).toBe('encoding/size');
});
