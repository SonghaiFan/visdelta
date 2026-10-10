import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csvParse, autoType } from 'd3-dsv';
import { bar } from '../dist/bar.js';
import { scenarios } from '../examples/transition/scenarios.js';
import { transitionScenario } from '../examples/scenario.js';

const evaluate = (code, name, rows) => new Function('bar', 'rows', `${code}\nreturn ${name};`)(bar, rows);

test('Add real rows cells independently produce the six- and eight-state extracts', async () => {
  const rows = csvParse(await readFile(new URL('../docs/public/data/us-population-state-age-tidy.csv', import.meta.url), 'utf8'), autoType);
  const sample = scenarios.find(sample => sample.id === 'data');
  const from = evaluate(sample.code, 'from', rows).rows();
  const to = evaluate(sample.toCode, 'to', rows).rows();
  assert.equal(from.length, 6);
  assert.equal(to.length, 8);
  assert.deepEqual(new Set(from.map(row => row.state)), new Set(['CA', 'TX', 'FL', 'NY', 'PA', 'IL']));
  assert.deepEqual(new Set(to.map(row => row.state)), new Set(['CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA']));
  assert.ok(to.every(row => row.age === '<10'));
  for (const row of from) assert.deepEqual(to.find(candidate => candidate.state === row.state), row);
});

test('cell expansion resolves spread dependencies while preserving property names and strings', () => {
  const sample = transitionScenario({
    setup: 'const VALUES = [1, 2];\nconst EXTRA = [...VALUES, 3];',
    from: '({ VALUES: [...VALUES], label: "VALUES" }).VALUES',
    to: '[...EXTRA, ... VALUES]'
  });
  assert.deepEqual(evaluate(sample.code, 'from', []), [1, 2]);
  assert.deepEqual(evaluate(sample.toCode, 'to', []), [1, 2, 3, 1, 2]);
  assert.match(sample.code, /label: "VALUES"/);
});
