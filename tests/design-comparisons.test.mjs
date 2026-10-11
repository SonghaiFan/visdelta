import test from 'node:test';
import assert from 'node:assert/strict';
import { designComparisons, comparisonGuides } from '../docs/.vitepress/components/designComparisons.js';
import * as api from '../dist/index.js';
import { pieSlices } from '../dist/charts/pie/geometry.js';

test('every guide comparison has unique identity, a source and runnable immutable states', async () => {
  assert.equal(new Set(designComparisons.map(item => item.id)).size, designComparisons.length);
  assert.equal(designComparisons.length, 48);
  for (const guide of comparisonGuides) assert.ok(designComparisons.some(item => item.guide === guide.id));
  for (const item of designComparisons) {
    const original = structuredClone(item.rows);
    for (const side of [item.before, item.after]) {
      assert.ok(side.text || side.charts?.length, item.id);
      for (const declaration of side.charts ?? []) {
        const chart = new Function(declaration.mark, 'rows', `${declaration.code}\nreturn chart;`)(api[declaration.mark], structuredClone(item.rows));
        await api.visualizationWarnings(chart);
        assert.equal(chart.toSpec().mark, declaration.code.includes(".repeat(") && declaration.mark !== "bar" ? `faceted-${declaration.mark}` : declaration.mark, item.id);
        if (declaration.mark === 'pie') pieSlices(chart.rows(), chart.toSpec());
      }
    }
    assert.deepEqual(item.rows, original);
  }
});
test('explicit Others aggregation conserves the total in pie, area and stacked bars', () => {
  for (const id of ['stack-tiny', 'area-tiny', 'pie-tiny']) {
    const item = designComparisons.find(item => item.id === id);
    const declaration = item.after.charts[0];
    const chart = new Function(declaration.mark, 'rows', `${declaration.code}\nreturn chart;`)(api[declaration.mark], structuredClone(item.rows));
    const rows = chart.rows();
    const expected = item.rows.reduce((sum, row) => sum + row.value, 0);
    assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.value, 0) - expected) < 1e-8, id);
    assert.ok(rows.some(row => row.part === 'Others'), id);
    assert.equal(new Set(rows.map(row => row.part)).size, 4, id);
  }
});
