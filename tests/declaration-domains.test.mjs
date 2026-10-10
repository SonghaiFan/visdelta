import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { plugin as barPlugin } from '../dist/charts/bar/plugin.js';
import { plugin as pointPlugin } from '../dist/charts/point/plugin.js';
import { plugin as linePlugin } from '../dist/charts/line/plugin.js';
import { plugin as areaPlugin } from '../dist/charts/area/plugin.js';

const cases = [
  ['Bar', barPlugin, 'bar', { values: [{ x: 'A', y: 2 }, { x: 'B', y: 4 }] }, {
    x: { field: 'x', type: 'nominal' }, y: { field: 'y', type: 'quantitative' }
  }],
  ['Point', pointPlugin, 'point', { values: [{ x: 1, y: 2 }, { x: 2, y: 4 }] }, {
    x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }
  }],
  ['Line', linePlugin, 'line', { values: [{ x: 1, y: 2 }, { x: 2, y: 4 }] }, {
    x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }
  }],
  ['Area', areaPlugin, 'area', { values: [{ x: 1, y: 2 }, { x: 2, y: 4 }] }, {
    x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }
  }]
];

function codec(plugin) {
  return plugin.createChartType(DEFAULT_CHART_RUNTIME).declarationOperations;
}

function validate(plugin, spec) {
  const declarationCodec = codec(plugin);
  const normalized = declarationCodec.normalize(spec);
  return normalized.status === 'ok' ? declarationCodec.validate(normalized.value) : normalized;
}

function declaration(mark, data, encoding) {
  return { mark, data, encoding };
}

test('peer declaration codecs reject malformed explicit continuous position domains', () => {
  for (const [name, plugin, mark, data, encoding] of cases) {
    for (const domain of [[], [1], ['bad', 3]]) {
      const spec = declaration(mark, data, {
        ...encoding,
        [mark === 'bar' ? 'y' : 'x']: {
          ...encoding[mark === 'bar' ? 'y' : 'x'], domain
        }
      });
      const result = validate(plugin, spec);
      assert.equal(result.status, 'unsupported', `${name} accepted domain ${JSON.stringify(domain)}`);
      assert.match(result.reason, /domain/);
    }
  }
});

test('continuous domains accept descending numeric and valid temporal endpoints', () => {
  for (const [name, plugin, mark, data, encoding] of cases) {
    const channel = mark === 'bar' ? 'y' : 'x';
    const descending = declaration(mark, data, {
      ...encoding,
      [channel]: { ...encoding[channel], domain: [4, 1] }
    });
    assert.equal(validate(plugin, descending).status, 'ok', `${name} rejected descending numeric domain`);
  }

  const temporal = declaration('point', {
    values: [
      { date: '2026-03-02', y: 2 },
      { date: '2026-03-01', y: 4 }
    ]
  }, {
    x: { field: 'date', type: 'temporal', domain: ['2026-03-03', '2026-02-28'] },
    y: { field: 'y', type: 'quantitative' }
  });
  assert.equal(validate(pointPlugin, temporal).status, 'ok');
});

test('nominal position domains do not inherit continuous cardinality rules', () => {
  const singleCategory = declaration('point', {
    values: [{ x: 'A', y: 1 }]
  }, {
    x: { field: 'x', type: 'nominal', domain: ['A'] },
    y: { field: 'y', type: 'quantitative' }
  });
  assert.equal(validate(pointPlugin, singleCategory).status, 'ok');

  const categorical = declaration('point', {
    values: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }]
  }, {
    x: { field: 'x', type: 'nominal', domain: ['A'] },
    y: { field: 'y', type: 'quantitative' }
  });
  assert.equal(validate(pointPlugin, categorical).status, 'unsupported');
  assert.match(validate(pointPlugin, categorical).reason, /domain omits/);

  const filtered = declaration('point', {
    values: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }]
  }, {
    x: { field: 'x', type: 'nominal', domain: ['A'] },
    y: { field: 'y', type: 'quantitative' }
  });
  filtered.transform = [{ filter: { field: 'x', equal: 'A' } }];
  assert.equal(validate(pointPlugin, filtered).status, 'ok');
});
