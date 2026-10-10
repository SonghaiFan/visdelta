import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { plugin as areaPlugin } from '../dist/charts/area/plugin.js';
import { plugin as barPlugin } from '../dist/charts/bar/plugin.js';
import { plugin as linePlugin } from '../dist/charts/line/plugin.js';
import { plugin as pointPlugin } from '../dist/charts/point/plugin.js';
import { plugin as unitPlugin } from '../dist/charts/unit/plugin.js';

const peers = [
  ['Area', areaPlugin, 'area', { x: { field: 'x', type: 'quantitative' }, y: { field: 'value', type: 'quantitative' } }],
  ['Bar', barPlugin, 'bar', { x: { field: 'category', type: 'nominal' }, y: { field: 'value', type: 'quantitative' } }],
  ['Line', linePlugin, 'line', { x: { field: 'x', type: 'quantitative' }, y: { field: 'value', type: 'quantitative' } }],
  ['Point', pointPlugin, 'point', { x: { field: 'x', type: 'quantitative' }, y: { field: 'value', type: 'quantitative' } }],
  ['Unit', unitPlugin, 'unit', {}]
];

const rows = [
  { id: 'a', state: 'CA', age: 20, category: 'CA', x: 1, value: 2, mark: 'same' },
  { id: 'b', state: 'CA', age: 30, category: 'NY', x: 2, value: 3, mark: 'same' }
];

function validate(plugin, mark, encoding, overrides = {}) {
  const codec = plugin.createChartType(DEFAULT_CHART_RUNTIME).declarationOperations;
  const declaration = { mark, data: { values: rows }, encoding, ...overrides };
  const normalized = codec.normalize(declaration);
  return normalized.status === 'ok' ? codec.decompose(normalized.value) : normalized;
}

test('all peer codecs validate explicit datum identity against untransformed inline source rows', () => {
  for (const [name, plugin, mark, encoding] of peers) {
    const duplicateId = validate(plugin, mark, encoding, {
      datumKey: 'id',
      data: { values: [{ ...rows[0], id: 'duplicate' }, { ...rows[1], id: 'duplicate' }] }
    });
    assert.equal(duplicateId.status, 'unsupported', `${name} accepted duplicate id keys`);
    assert.match(duplicateId.reason, /duplicate datum key/i, name);

    const duplicateComposite = validate(plugin, mark, encoding, {
      datumKey: ['state', 'age'],
      data: { values: [{ ...rows[0], age: 20 }, { ...rows[1], age: 20 }] }
    });
    assert.equal(duplicateComposite.status, 'unsupported', `${name} accepted duplicate composite keys`);
    assert.match(duplicateComposite.reason, /duplicate datum key/i, name);

    const missingField = validate(plugin, mark, encoding, { datumKey: 'missing' });
    assert.equal(missingField.status, 'unsupported', `${name} accepted an absent datumKey field`);
    assert.match(missingField.reason, /datumKey.*unknown inline-data field/i, name);

    const filterCannotRepair = validate(plugin, mark, encoding, {
      datumKey: 'id',
      data: { values: [{ ...rows[0], id: 'duplicate', keep: true }, { ...rows[1], id: 'duplicate', keep: false }] },
      transform: [{ filter: { field: 'keep', equal: true } }]
    });
    assert.equal(filterCannotRepair.status, 'unsupported', `${name} allowed a filter to repair duplicate source identity`);
    assert.match(filterCannotRepair.reason, /duplicate datum key/i, name);

    const validDistinctSourcesAtSameMarkGrain = validate(plugin, mark, encoding, {
      datumKey: 'id', key: 'mark'
    });
    assert.equal(validDistinctSourcesAtSameMarkGrain.status, 'ok', `${name}: ${validDistinctSourcesAtSameMarkGrain.reason}`);

    const unresolvedExplicitKey = validate(plugin, mark, encoding, {
      datumKey: 'id', data: { url: '/source.csv' }
    });
    assert.equal(unresolvedExplicitKey.status, 'unsupported', `${name} accepted unverifiable URL identity`);
    assert.match(unresolvedExplicitKey.reason, /cannot verify explicit datum identity/i, name);
  }
});
