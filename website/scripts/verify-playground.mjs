// Evaluates every curated playground story (components/playground/demos.ts)
// against the built library, exactly as the page does. Every version of the
// code must be a valid state of the story's chart type, every edit must change
// the state, and the story must emit the category it is filed under. Every
// category must have a story.
import { readFile } from 'node:fs/promises';
import { csvParse, autoType } from 'd3';
import * as d3 from 'd3';
import { playgroundDemos, storyFrames } from '../components/playground/demos.ts';
import { categories } from '../examples/registry.ts';
import { legacyCoverage } from './legacy-playground-coverage.mjs';
import { lineState, lineSeriesKey } from '../../dist/charts/line/state.js';
import { areaGrainError } from '../../dist/charts/area/grain.js';

const { delta } = await import('visdelta/core');
const factories = {
  bar: (await import('visdelta/bar')).bar,
  line: (await import('visdelta/line')).line,
  area: (await import('visdelta/area')).area,
  point: (await import('visdelta/point')).point,
  unit: (await import('visdelta/unit')).unit,
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const failures = [];

for (const demo of playgroundDemos) {
  try {
    if (demo.edits.length < 1 || demo.edits.length > 4) throw new Error(`expected 1–4 purposeful edits, got ${demo.edits.length}`);
    const rows = demo.data
      ? csvParse(await readFile(new URL(`../../docs/public/${demo.data.slice(2)}`, import.meta.url), 'utf8'), autoType)
      : [];
    const states = [];
    for (const [index, code] of storyFrames(demo).entries()) {
      const run = new AsyncFunction(demo.chart, 'd3', 'rows', `"use strict";\n${code}\nreturn chart;`);
      const state = await run(factories[demo.chart], d3, structuredClone(rows));
      const mark = state?.toSpec?.().mark;
      if (mark !== demo.chart) throw new Error(`version ${index}: expected a ${demo.chart} state, got ${mark}`);
      const spec = state.toSpec();
      const visibleRows = state.rows();
      if (mark === 'area') {
        const error = areaGrainError(spec, visibleRows);
        if (error) throw new Error(`version ${index}: ${error}`);
      }
      if (mark === 'line') {
        const seriesField = lineSeriesKey(lineState(spec, spec.encoding));
        const xField = spec.encoding?.x?.field;
        const seen = new Set();
        for (const row of visibleRows) {
          const key = JSON.stringify([row[xField], seriesField ? row[seriesField] : null]);
          if (seen.has(key)) throw new Error(`version ${index}: Line needs one observation per ${xField} within each series; use breakdown or rollup`);
          seen.add(key);
        }
      }
      states.push(state);
    }
    const steps = states.slice(1).map((state, index) => {
      const changes = delta(states[index], state).stateChanges;
      if (!changes.length) throw new Error(`edit ${index + 1} does not change the state`);
      return changes.map((change) => `${change.category}.${change.action}`).join(' ');
    });
    if (!steps.join(' ').split(' ').some((change) => change.startsWith(`${demo.category}.`))) {
      throw new Error(`filed under ${demo.category}, but its edits report ${steps.join(' | ')}`);
    }
    console.log(`ok   ${demo.id.padEnd(10)} ${steps.join(' | ')}`);
  } catch (error) {
    failures.push(`${demo.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const knownDemos = new Map(playgroundDemos.map((demo) => [demo.id, demo]));
const legacyModules = ['transition', 'line', 'point', 'area', 'unit'];
const legacyKeys = new Set();
for (const moduleName of legacyModules) {
  const source = await readFile(new URL(`../../examples/${moduleName}/scenarios.js`, import.meta.url), 'utf8');
  for (const [, id] of source.matchAll(/sample\(['"]([^'"]+)['"]/g)) legacyKeys.add(`${moduleName}/${id}`);
  for (const [, id] of source.matchAll(/repeatScenario\(['"]([^'"]+)['"]/g)) legacyKeys.add(`${moduleName}/repeat`);
}
for (const key of legacyKeys) {
  const entry = legacyCoverage[key];
  if (!entry) failures.push(`legacy case ${key} has no coverage mapping`);
  else if ('demo' in entry) {
    const demo = knownDemos.get(entry.demo);
    if (!demo) failures.push(`legacy case ${key} points to unknown story ${entry.demo}`);
    else if (!Number.isInteger(entry.step) || entry.step < 1 || entry.step > demo.edits.length) failures.push(`legacy case ${key} points to invalid edit ${entry.demo}#${entry.step}`);
  } else if (!entry.regression?.trim()) failures.push(`legacy case ${key} has no concrete story or regression reason`);
}
for (const key of Object.keys(legacyCoverage)) if (!legacyKeys.has(key)) failures.push(`coverage mapping ${key} no longer names a legacy case`);
const coverageDocument = await readFile(new URL('./legacy-playground-coverage.md', import.meta.url), 'utf8');
for (const key of legacyKeys) if (!coverageDocument.includes(`| \`${key}\` |`)) failures.push(`coverage document is missing ${key}`);

// Facts used by the simulated stories must come from their checked-in source
// rows, not from temporary values introduced by the authoring code.
const readCsv = async (name) => csvParse(await readFile(new URL(`../../docs/public/data/${name}`, import.meta.url), 'utf8'), autoType);
const monthly = await readCsv('service-demand-monthly.csv');
const expectedMonthlyTotals = [250, 260, 279, 301, 318, 332];
const actualMonthlyTotals = Array.from(
  d3.group(monthly, (row) => row.month.toISOString().slice(0, 10)).values(),
  (monthRows) => monthRows.reduce((sum, row) => sum + row.requests, 0),
);
if (JSON.stringify(actualMonthlyTotals) !== JSON.stringify(expectedMonthlyTotals)) failures.push(`service demand monthly totals are ${actualMonthlyTotals.join(', ')}, expected ${expectedMonthlyTotals.join(', ')}`);
for (const [month, monthRows] of d3.group(monthly, (row) => row.month.toISOString().slice(0, 10))) {
  const total = monthRows.reduce((sum, row) => sum + row.requests, 0);
  const shareSum = monthRows.reduce((sum, row) => sum + row.share, 0);
  if (Math.abs(shareSum - 1) > 0.005) failures.push(`${month} service shares sum to ${shareSum}, expected 1`);
  for (const row of monthRows) {
    if (Math.abs(row.share - row.requests / total) > 0.005) failures.push(`${month} ${row.service} share does not use monthly requests ${total} as its denominator`);
  }
}
const sensors = await readCsv('sensor-readings.csv');
const invalid = sensors.filter((row) => row.valid === false);
if (sensors.length !== 10 || invalid.length !== 1 || invalid[0].reading !== 94) failures.push('sensor story no longer contains nine valid readings and one retained invalid 94-unit record');
const finance = await readCsv('channel-finance.csv');
if (finance.some((row) => row.profit !== row.revenue - row.cost)) failures.push('channel-finance profit is not revenue minus cost');
if (finance.reduce((best, row) => row.revenue > best.revenue ? row : best).channel === finance.reduce((best, row) => row.profit > best.profit ? row : best).channel) failures.push('channel-finance sample no longer distinguishes the revenue and profit leaders');
const unitRows = await readCsv('iris.csv');
const unitSample = [...unitRows.slice(0, 8), ...unitRows.slice(50, 54)];
const unitCounts = Array.from(d3.rollup(unitSample, (values) => values.length, (row) => row.species).values());
if (JSON.stringify(unitCounts) !== JSON.stringify([8, 4])) failures.push(`unit-value story counts are ${unitCounts.join(', ')}, expected 8 and 4`);
const totalsByQuarter = [
  monthly.slice(0, 9).reduce((sum, row) => sum + row.requests, 0),
  monthly.slice(9).reduce((sum, row) => sum + row.requests, 0),
];
if (!(totalsByQuarter[1] > totalsByQuarter[0])) failures.push('service demand data does not support the stated increase from Q1 to Q2');

for (const { id } of categories) {
  if (!playgroundDemos.some((demo) => demo.category === id)) failures.push(`no story teaches ${id}`);
}
const ids = playgroundDemos.map((demo) => demo.id);
if (new Set(ids).size !== ids.length) failures.push('story ids are not unique');
if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Verified ${playgroundDemos.length} playground stories.`);
