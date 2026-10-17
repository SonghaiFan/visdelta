import test from 'node:test';
import assert from 'node:assert/strict';
import { bandOrLinear, quantitativeScale } from '../dist/toolkit/scales.js';
import { bar, delta } from '../dist/index.js';
import { prioritizedContinuousTicks } from '../dist/runtime/axis-layout.js';

for (const type of ['linear', 'sqrt', 'log']) {
  test(`${type} keeps explicit bounds and only nices inferred domains`, () => {
    const rows = [{ v: 83 }, { v: 2180 }];
    const channel = { field: 'v', type: 'quantitative', domain: [80, 3000], scale: { type, base: 10 } };
    const before = structuredClone(channel);
    const scale = quantitativeScale(rows, channel, [400, 0], { domainPadding: 20 });
    assert.deepEqual(scale.domain(), [80, 3000]);
    assert.equal(scale(80), 400);
    assert.equal(scale(3000), 0);
    assert.deepEqual(channel, before);
    const inferred = quantitativeScale(rows, { ...channel, domain: undefined }, [400, 0]);
    assert.ok(inferred.domain()[0] <= 83 && inferred.domain()[1] >= 2180);
    assert.notDeepEqual(inferred.domain(), [83, 2180]);
  });
}

test('temporal explicit bounds remain exact, including non-round times', () => {
  const domain = ['2026-01-01T12:34:56Z', '2026-01-09T01:23:45Z'];
  const scale = bandOrLinear([{ date: domain[0] }, { date: domain[1] }],
    { field: 'date', type: 'temporal', domain }, [0, 600], { domainPadding: 20 });
  assert.deepEqual(scale.domain().map(Number), domain.map(value => +new Date(value)));
  const inferred = bandOrLinear([{ date: domain[0] }, { date: domain[1] }],
    { field: 'date', type: 'temporal' }, [0, 600]);
  assert.ok(+inferred.domain()[0] < +new Date(domain[0]));
  assert.ok(+inferred.domain()[1] > +new Date(domain[1]));
});

test('log axes use ordinary multiplicative ticks without injecting data endpoints', () => {
  const rows = [{ v: 300 }, { v: 2180 }];
  const log = quantitativeScale(rows, { field: 'v', domain: [80, 3000], scale: { type: 'log', base: 10 } }, [400, 0]);
  const ticks = prioritizedContinuousTicks(log, 8, 20);
  assert.deepEqual(ticks, log.ticks(8));
  assert.ok(!ticks.includes(2180));
  const linear = quantitativeScale(rows, { field: 'v' }, [400, 0]);
  assert.ok(prioritizedContinuousTicks(linear, 8, 20).includes(2180));
});

for (const layout of ['grouped', 'stacked']) {
  test(`${layout} compilation preserves authored domains around aggregation and flip`, () => {
    const data = [{ category: 'A', group: 'one', v: 8 }, { category: 'B', group: 'two', v: 9 }];
    const base = bar(data).x('category', { domain: ['B', 'A'] }).y('v', { domain: [1.3, 19.7] });
    const before = base.toSpec();
    const state = base.breakdown('group', { layout });
    const declared = state.toSpec();
    assert.deepEqual(declared.encoding.x.domain, ['B', 'A']);
    assert.deepEqual(declared.encoding.y.domain, [1.3, 19.7]);
    assert.deepEqual(state.flip().toSpec().encoding.x.domain, [1.3, 19.7]);
    const edited = state.y('v', { domain: [2.3, 18.7] });
    assert.deepEqual(edited.toSpec().encoding.y.domain, [2.3, 18.7]);
    assert.ok(delta(state, edited).hasDelta('encoding.y'));
    assert.deepEqual(base.toSpec(), before);
    assert.deepEqual(state.toSpec(), declared);
  });
}
