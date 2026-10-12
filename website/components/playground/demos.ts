/**
 * The playground's curated stories, grouped by the state-change category each
 * one teaches. A story starts from working chart code and then edits it, one
 * chained call at a time. Every edit is a valid state, so every edit is a
 * transition, and the playground keeps each one as a keyframe.
 *
 * Code runs with the chart factory, `rows` (the parsed CSV) and `d3` in scope
 * and must assign the state to `const chart`.
 */
import type { LabChart } from '@/components/interactive/corpus';
import type { StateChangeCategory } from '@/examples/registry';

/** One authoring step: add a chained call, remove one, or rewrite text in place. */
export type Edit = { add: string } | { remove: string } | { replace: string; with: string };

export interface PlaygroundDemo {
  id: string;
  title: string;
  /** The category this story teaches; its primary navigation. */
  category: StateChangeCategory;
  chart: LabChart;
  /** One plain sentence: what to watch. */
  line: string;
  /** Repository CSV, served under <base>/data/. Omit for inline data. */
  data?: string;
  code: string;
  edits: Edit[];
}

function applyEdit(code: string, edit: Edit): string {
  if ('add' in edit) {
    if (!/;\s*$/.test(code)) throw new Error('Story code must end with a semicolon.');
    return code.replace(/;\s*$/, `\n  ${edit.add};`);
  }
  const find = 'remove' in edit ? `\n  ${edit.remove}` : edit.replace;
  const index = code.indexOf(find);
  if (index < 0 || code.indexOf(find, index + 1) >= 0) throw new Error(`Story edit must match once: ${find.trim()}`);
  return code.slice(0, index) + ('remove' in edit ? '' : edit.with) + code.slice(index + find.length);
}

/** Every version of a story's code, from the starting code to the last edit. */
export function storyFrames(demo: Pick<PlaygroundDemo, 'code' | 'edits'>): string[] {
  const frames = [demo.code];
  for (const edit of demo.edits) frames.push(applyEdit(frames.at(-1)!, edit));
  return frames;
}

const POPULATION = './data/us-population-state-age-tidy.csv';

const underTen = `const chart = bar(rows)
  .x("state")
  .y("population", { title: "Residents under 10", format: "~s" })
  .key(["state", "age"])
  .where({ age: "<10" });`;

export const playgroundDemos: PlaygroundDemo[] = [
  {
    id: 'filter',
    title: 'Filter',
    category: 'data',
    chart: 'bar',
    line: 'Keep the states with a million children under ten. Lower the bar and states come back.',
    data: POPULATION,
    code: underTen,
    edits: [
      { add: '.where({ population: { gte: 1000000 } })' },
      { replace: 'gte: 1000000', with: 'gte: 500000' },
    ],
  },
  {
    id: 'split',
    title: 'Split',
    category: 'grain',
    chart: 'bar',
    line: 'Delete one line and every total opens into its age groups. Then set them side by side.',
    data: POPULATION,
    code: `const ages = ["<10", "10-19", "20-29", "30-39",
  "40-49", "50-59", "60-69", "70-79", "≥80"];

const chart = bar(rows)
  .x("state")
  .y("population", { format: "~s" })
  .key(["state", "age"])
  .where({ state: ["CA", "TX", "FL", "NY", "PA", "IL"] })
  .breakdown("age")
  .color("age", { domain: ages, scheme: "Blues" })
  .rollup();`,
    edits: [{ remove: '.rollup()' }, { add: '.layout("grouped")' }],
  },
  {
    id: 'regroup',
    title: 'Regroup',
    category: 'grain',
    chart: 'bar',
    line: 'Totals by year become totals by place. The same four records split, move and merge.',
    code: `const cases = [
  { id: "r1", year: 2020, location: "A", cases: 10 },
  { id: "r2", year: 2020, location: "B", cases: 5 },
  { id: "r3", year: 2021, location: "A", cases: 12 },
  { id: "r4", year: 2021, location: "B", cases: 8 }
];

const chart = bar(cases)
  .datumKey("id")
  .y("cases")
  .x("year")
  .rollup("year");`,
    edits: [{ replace: '.x("year")\n  .rollup("year")', with: '.x("location")\n  .rollup("location")' }],
  },
  {
    id: 'zip',
    title: 'Zip',
    category: 'grain',
    chart: 'line',
    line: 'One average line unzips into the two stocks it was made from.',
    data: './data/line-lab.csv',
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker")
  .rollup({ op: "mean" });`,
    edits: [{ remove: '.rollup({ op: "mean" })' }],
  },
  {
    id: 'summarize',
    title: 'Summarize',
    category: 'grain',
    chart: 'point',
    line: 'Six cars gather into two averages, sized by how many cars they stand for.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .where({ name: ["Datsun 710", "Fiat 128", "Honda Civic",
    "Duster 360", "Camaro Z28", "Maserati Bora"] })
  .color("cyl", { type: "nominal", domain: [4, 8] });`,
    edits: [
      {
        add: `.rollup("cyl", {
    key: "cyl",
    x: { op: "mean" },
    y: { op: "mean" },
    size: { op: "count", range: [10, 24] }
  })`,
      },
    ],
  },
  {
    id: 'remap',
    title: 'Remap',
    category: 'encoding',
    chart: 'point',
    line: 'Ask a new question of the same cars: weight becomes horsepower, then colour shows cylinders.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name");`,
    edits: [
      { replace: '.x("wt", { title: "Weight (1000 lb)" })', with: '.x("hp", { title: "Horsepower" })' },
      { add: '.color("cyl", { type: "nominal" })' },
    ],
  },
  {
    id: 'log',
    title: 'Log scale',
    category: 'coordinate',
    chart: 'point',
    line: 'Same field, new ruler: a log scale spreads the crowded low end. Then turn the chart on its side.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("hp", { title: "Horsepower" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    edits: [
      {
        replace: '.x("hp", { title: "Horsepower" })',
        with: '.x("hp", { title: "Horsepower (log₂)", scale: { type: "log", base: 2 } })',
      },
      { add: '.flip()' },
    ],
  },
  {
    id: 'sort',
    title: 'Sort',
    category: 'layout',
    chart: 'bar',
    line: 'Fifty-two bars find their rank. Nothing changes but the order.',
    data: POPULATION,
    code: underTen,
    edits: [{ add: '.sort("population", "descending")' }, { replace: '"descending"', with: '"ascending"' }],
  },
  {
    id: 'stream',
    title: 'Stream',
    category: 'layout',
    chart: 'area',
    line: 'The same layers lift off a fixed baseline and settle into a stream.',
    data: './data/area-lab.csv',
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");`,
    edits: [{ add: '.layout("stream", { offset: "wiggle", order: "insideOut" })' }],
  },
  {
    id: 'swarm',
    title: 'Swarm',
    category: 'layout',
    chart: 'unit',
    line: 'One hundred and fifty flowers leave the grid for their petal lengths.',
    data: './data/iris.csv',
    code: `const chart = unit(rows)
  .key("flowerId")
  .layout("grid", { columns: 15, radius: 6 })
  .color("species");`,
    edits: [{ replace: '.layout("grid", { columns: 15, radius: 6 })', with: '.x("petalLength")\n  .layout("beeswarm")' }],
  },
  {
    id: 'focus',
    title: 'Focus',
    category: 'attention',
    chart: 'point',
    line: 'The camera moves to the four-cylinder cars, then lets go and lights them up instead. Every car stays.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    edits: [{ add: '.focus({ cyl: 4 })' }, { replace: '.focus({ cyl: 4 })', with: '.highlight({ cyl: 4 })' }],
  },
  {
    id: 'headline',
    title: 'Headline',
    category: 'appearance',
    chart: 'bar',
    line: 'Add a title and a subtitle, then change the title. The text sits above the chart, which does not move.',
    data: POPULATION,
    code: underTen,
    edits: [
      { add: '.title("Residents under 10")' },
      { add: '.subtitle("US Census, by state")' },
      { replace: 'title("Residents under 10")', with: 'title("Children under ten")' },
    ],
  },
  {
    id: 'steps',
    title: 'Steps',
    category: 'appearance',
    chart: 'line',
    line: 'The same closing prices, drawn as steps, then with a heavier line.',
    data: './data/line-lab.csv',
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker");`,
    edits: [{ add: '.curve("curveStepAfter")' }, { add: '.strokeWidth(3)' }],
  },
];
