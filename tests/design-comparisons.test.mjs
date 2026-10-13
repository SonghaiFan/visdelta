import test from 'node:test';
import assert from 'node:assert/strict';
import { designComparisons, comparisonGuides } from '../docs/.vitepress/components/designComparisons.js';
import * as api from '../dist/index.js';
import { pieSlices } from '../dist/charts/pie/geometry.js';

test('every guide comparison has unique identity, a source and runnable immutable states', async () => {
  assert.equal(new Set(designComparisons.map(item => item.id)).size, designComparisons.length);
  assert.equal(designComparisons.length, 53);
  for (const item of designComparisons) {
    // Every pair is framed like a published chart: one story told twice.
    assert.ok(item.story?.headline && item.story?.description, item.id);
    for (const side of [item.before, item.after]) {
      for (const declaration of side.charts ?? []) {
        assert.doesNotMatch(declaration.code, /label: "Units"/, `${item.id}: unit title resolved from the story`);
        assert.doesNotMatch(declaration.code, /\.x\("year", \{ label: "Year" \}\)/, `${item.id}: year axis declares ordinal or integer format`);
      }
    }
  }
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

test('story headlines state what their data shows', () => {
  const rows = id => designComparisons.find(item => item.id === id).rows;
  const value = (data, label, part, field = 'label') => data.find(row => row[field] === label && (part == null || row.part === part)).value;
  assert.equal(rows('bar-negative').filter(row => row.value < 0).length, 2); // "Two regions made a loss"
  const stacked = rows('stack-trends');
  assert.ok(value(stacked, 2023, 'Growth', 'year') > value(stacked, 2023, 'Support', 'year')); // "Growth overtook Support in 2023"
  for (const year of [2020, 2021, 2022]) assert.ok(value(stacked, year, 'Growth', 'year') < value(stacked, year, 'Support', 'year'));
  const share = year => 100 * value(stacked, year, 'Core', 'year') / stacked.filter(row => row.year === year).reduce((sum, row) => sum + row.value, 0);
  assert.equal(Math.round(share(2020)), 60); // "Core's share fell from 60% to 50%"
  assert.equal(Math.round(share(2023)), 50);
  const ranges = rows('dot-range');
  const widths = [...new Set(ranges.map(row => row.label))].map(label => ranges.filter(row => row.label === label).reduce((a, b) => Math.abs(a.value - b.value)));
  assert.equal(Math.min(...widths), 11); // "Island temperatures vary the least" (18 − 7)
  const survey = rows('pie-exclusive');
  assert.ok(survey.reduce((sum, row) => sum + row.value, 0) > 100); // overlapping answers exceed one whole
});
