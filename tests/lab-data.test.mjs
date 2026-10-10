import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csvParse, autoType } from 'd3-dsv';
import { preparedLabData, formatLabData } from '../scripts/prepare-lab-data.mjs';
import { scenarios as lineScenarios } from '../examples/line/scenarios.js';
import { scenarios as areaScenarios } from '../examples/area/scenarios.js';

const root = new URL('../docs/public/data/', import.meta.url);
const read = async name => csvParse(await readFile(new URL(name, root), 'utf8'), autoType);

test('prepared demo CSVs reproduce their sources without drift', async () => {
  const prepared = await preparedLabData();
  assert.deepEqual(Object.keys(prepared).sort(), ['area-lab.csv', 'line-lab.csv']);
  for (const [name, rows] of Object.entries(prepared)) {
    assert.equal(await readFile(new URL(name, root), 'utf8'), formatLabData(rows), name);
    assert.deepEqual(Array.from(await read(name)), rows, name);
  }
  assert.equal(prepared['line-lab.csv'].length, 40);
  assert.equal(prepared['area-lab.csv'].length, 54);
});

test('shared lab data has one tidy observation grain', async () => {
  const line = await read('line-lab.csv');
  const area = await read('area-lab.csv');
  assert.equal(new Set(line.map(row => `${+row.date}|${row.ticker}`)).size, line.length);
  assert.equal(new Set(area.map(row => `${+row.date}|${row.industry}`)).size, area.length);
  assert.deepEqual([...new Set(line.map(row => row.ticker))], ['AAPL', 'GOOG']);
  assert.equal(new Set(area.map(row => row.industry)).size, 3);
  assert.ok(line.every(row => row.week instanceof Date && row.week.getUTCDay() === 1));
});

test('line and area editors contain visualization declarations, not preparation pipelines', async () => {
  for (const scenario of [...lineScenarios, ...areaScenarios]) {
    const visibleCode = `${scenario.code}\n${scenario.toCode}`;
    assert.doesNotMatch(visibleCode, /DATA_URL|return \{ from, to \}|d3\.|\.filter\(|\.slice\(|Array\.from/);
    assert.match(scenario.code, /(?:line|area)\(rows\)/);
    const name = scenario.dataUrl?.match(/\.\/data\/([^" ]+\.csv)$/)?.[1];
    assert.ok(name && (await read(name)).length, `${scenario.id}: ${scenario.dataUrl}`);
  }
  assert.ok(lineScenarios.every(scenario => scenario.dataUrl === './data/line-lab.csv'));
  assert.ok(areaScenarios.every(scenario => scenario.dataUrl === './data/area-lab.csv'));
});
