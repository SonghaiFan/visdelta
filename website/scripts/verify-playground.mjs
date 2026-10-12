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
    const states = [];
    for (const [index, code] of storyFrames(demo).entries()) {
      const run = new AsyncFunction(demo.chart, 'd3', 'rows', `"use strict";\n${code}\nreturn chart;`);
      const state = await run(factories[demo.chart], d3, structuredClone(rows));
      const mark = state?.toSpec?.().mark;
      if (mark !== demo.chart) throw new Error(`version ${index}: expected a ${demo.chart} state, got ${mark}`);
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
