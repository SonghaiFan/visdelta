import test from 'node:test';
import assert from 'node:assert/strict';
import { readableNumber, readableTickFormat } from '../dist/runtime/tick-format.js';
import { bandOrLinear } from '../dist/toolkit/scales.js';

test('default numeric ticks use plain small values and compact large values', () => {
  for (const [value, expected] of [[0, '0'], [150, '150'], [330, '330'], [1500, '1.5k'], [2e6, '2m'], [3.25e9, '3.25b'], [-1200, '−1.2k'], [0.0000125, '0.0000125']]) {
    assert.equal(readableNumber(value), expected);
  }
});

test('monthly ticks and endpoints use UTC month labels in every host timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'Australia/Melbourne', 'America/Los_Angeles']) {
      process.env.TZ = timezone;
      const scale = bandOrLinear([{ date: '2025-01-01' }, { date: '2025-06-01' }], { field: 'date', type: 'temporal' }, [0, 500]);
      const format = readableTickFormat(scale, 6);
      assert.deepEqual(scale.ticks(6).map(format), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('daily and intraday axes keep distinct labels and cross-year dates include the year', () => {
  for (const [domain, count, expected] of [
    [['2025-01-01', '2025-01-05'], 4, '1 Jan'],
    [['2025-01-01T18:00:00Z', '2025-01-02T12:00:00Z'], 6, '1 Jan, 18:00'],
    [['2025-01-01T09:00:00Z', '2025-01-01T12:00:00Z'], 3, '09:00'],
    [['2024-12-01', '2025-03-01'], 3, 'Dec 2024'],
  ]) {
    const scale = bandOrLinear([], { type: 'temporal', domain }, [0, 500]);
    const format = readableTickFormat(scale, count);
    assert.equal(format(new Date(domain[0])), expected);
    const labels = scale.ticks(count).map(format);
    assert.equal(new Set(labels).size, labels.length);
  }
});
