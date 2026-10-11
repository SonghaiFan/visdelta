// Evaluates every curated playground demo (components/playground/demos.ts)
// against the built library, exactly as the page does, and checks that A and
// B are valid states of the demo's chart type whose difference includes the
// category the demo is filed under. Every category must have a demo.
import { readFile } from 'node:fs/promises';
import { csvParse, autoType } from 'd3';
import * as d3 from 'd3';
import { playgroundDemos } from '../components/playground/demos.ts';
import { categories } from '../examples/registry.ts';

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
    const rows = demo.data
      ? csvParse(await readFile(new URL(`../../docs/public/${demo.data.slice(2)}`, import.meta.url), 'utf8'), autoType)
      : [];
    const run = new AsyncFunction(demo.chart, 'd3', 'rows', `"use strict";\n${demo.a}\n${demo.b}\nreturn [a, b];`);
    const [a, b] = await run(factories[demo.chart], d3, rows);
    for (const state of [a, b]) {
      const mark = state?.toSpec?.().mark;
      if (mark !== demo.chart) throw new Error(`expected a ${demo.chart} state, got ${mark}`);
    }
    const changes = delta(a, b).stateChanges;
    if (!changes.some((change) => change.category === demo.category)) {
      throw new Error(`filed under ${demo.category}, but delta() reports ${changes.map((c) => c.category).join(', ') || 'no change'}`);
    }
    console.log(`ok   ${demo.id.padEnd(10)} ${changes.map((c) => `${c.category}.${c.action}`).join(' ')}`);
  } catch (error) {
    failures.push(`${demo.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const { id } of categories) {
  if (!playgroundDemos.some((demo) => demo.category === id)) failures.push(`no demo teaches ${id}`);
}
const ids = playgroundDemos.map((demo) => demo.id);
if (new Set(ids).size !== ids.length) failures.push('demo ids are not unique');
if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Verified ${playgroundDemos.length} playground demos.`);
