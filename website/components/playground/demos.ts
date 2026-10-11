/**
 * The playground's curated transitions, grouped by the state-change category
 * each one teaches. Each shows one idea on real data; the Δ line still reports
 * every change it emits.
 *
 * `a` must declare `const a`; `b` must declare `const b` and usually derives
 * from `a`, so the code for B reads as the change itself. Both run with the
 * chart factory, `rows` (the parsed CSV) and `d3` in scope.
 */
import type { LabChart } from '@/components/interactive/corpus';
import type { StateChangeCategory } from '@/examples/registry';

export interface PlaygroundDemo {
  id: string;
  title: string;
  /** The category this demo teaches; its primary navigation. */
  category: StateChangeCategory;
  chart: LabChart;
  /** One plain sentence: what to watch. */
  line: string;
  /** Repository CSV, served under <base>/data/. Omit for inline data. */
  data?: string;
  a: string;
  b: string;
  height?: number;
}

const POPULATION = './data/us-population-state-age-tidy.csv';

export const playgroundDemos: PlaygroundDemo[] = [
  {
    id: 'filter',
    title: 'Filter',
    category: 'data',
    chart: 'bar',
    line: 'Only states with a million children under ten stay. The rest leave, and the survivors take their room.',
    data: POPULATION,
    a: `const a = bar(rows)
  .x("state")
  .y("population", { title: "Residents under 10", format: "~s" })
  .key(["state", "age"])
  .where({ age: "<10" })
  .sort("population", "descending");`,
    b: `const b = a.where({ population: { gte: 1000000 } });`,
  },
  {
    id: 'split',
    title: 'Split',
    category: 'grain',
    chart: 'bar',
    line: 'Each total opens into its age groups. The stack keeps every total readable on the way.',
    data: POPULATION,
    a: `const ages = ["<10", "10-19", "20-29", "30-39",
  "40-49", "50-59", "60-69", "70-79", "≥80"];

const detail = bar(rows)
  .x("state")
  .y("population", { format: "~s" })
  .key(["state", "age"])
  .where({ state: ["CA", "TX", "FL", "NY", "PA", "IL"] })
  .breakdown("age")
  .color("age", { domain: ages, scheme: "Blues" });

const a = detail.rollup();`,
    b: `const b = detail.layout("grouped");`,
  },
  {
    id: 'regroup',
    title: 'Regroup',
    category: 'grain',
    chart: 'bar',
    line: 'Totals by year become totals by place. The same four records split, move and merge.',
    a: `const cases = [
  { id: "r1", year: 2020, location: "A", cases: 10 },
  { id: "r2", year: 2020, location: "B", cases: 5 },
  { id: "r3", year: 2021, location: "A", cases: 12 },
  { id: "r4", year: 2021, location: "B", cases: 8 }
];

const base = bar(cases).datumKey("id").y("cases");
const a = base.x("year").rollup("year");`,
    b: `const b = base.x("location").rollup("location");`,
  },
  {
    id: 'zip',
    title: 'Zip',
    category: 'grain',
    chart: 'line',
    line: 'One average line unzips into the two stocks it was made from.',
    data: './data/line-lab.csv',
    a: `const prices = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker");

const a = prices.rollup({ op: "mean" });`,
    b: `const b = prices;`,
  },
  {
    id: 'summarize',
    title: 'Summarize',
    category: 'grain',
    chart: 'point',
    line: 'Six cars gather into two averages, sized by how many cars they stand for.',
    data: './data/mtcars.csv',
    a: `const a = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .where({ name: ["Datsun 710", "Fiat 128", "Honda Civic",
    "Duster 360", "Camaro Z28", "Maserati Bora"] })
  .color("cyl", { type: "nominal", domain: [4, 8] });`,
    b: `const b = a.rollup("cyl", {
  key: "cyl",
  x: { op: "mean" },
  y: { op: "mean" },
  size: { op: "count", range: [10, 24] }
});`,
  },
  {
    id: 'remap',
    title: 'Remap',
    category: 'encoding',
    chart: 'point',
    line: 'Every car slides from its weight to its horsepower. Same cars, new question.',
    data: './data/mtcars.csv',
    a: `const a = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    b: `const b = a.x("hp", { title: "Horsepower" });`,
  },
  {
    id: 'log',
    title: 'Log scale',
    category: 'coordinate',
    chart: 'point',
    line: 'Same field, new ruler. On a log scale the crowded low end spreads out.',
    data: './data/mtcars.csv',
    a: `const a = point(rows)
  .x("hp", { title: "Horsepower" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    b: `const b = a.x("hp", {
  title: "Horsepower (log₂)",
  scale: { type: "log", base: 2 }
});`,
  },
  {
    id: 'sort',
    title: 'Sort',
    category: 'layout',
    chart: 'bar',
    line: 'Fifty-two bars find their rank. Nothing changes but the order.',
    data: POPULATION,
    a: `const a = bar(rows)
  .x("state")
  .y("population", { title: "Residents under 10", format: "~s" })
  .key(["state", "age"])
  .where({ age: "<10" });`,
    b: `const b = a.sort("population", "descending");`,
  },
  {
    id: 'stream',
    title: 'Stream',
    category: 'layout',
    chart: 'area',
    line: 'The same layers lift off a fixed baseline and settle into a stream.',
    data: './data/area-lab.csv',
    a: `const a = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");`,
    b: `const b = a.layout("stream", { offset: "wiggle", order: "insideOut" });`,
  },
  {
    id: 'swarm',
    title: 'Swarm',
    category: 'layout',
    chart: 'unit',
    line: 'One hundred and fifty flowers leave the grid for their petal lengths.',
    data: './data/iris.csv',
    a: `const a = unit(rows)
  .key("flowerId")
  .layout("grid", { columns: 15, radius: 6 })
  .color("species");`,
    b: `const b = a.x("petalLength").layout("beeswarm");`,
  },
  {
    id: 'focus',
    title: 'Focus',
    category: 'attention',
    chart: 'point',
    line: 'The camera moves to the four-cylinder cars. Every car stays in the data.',
    data: './data/mtcars.csv',
    a: `const a = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    b: `const b = a.focus({ cyl: 4 });`,
  },
  {
    id: 'steps',
    title: 'Steps',
    category: 'appearance',
    chart: 'line',
    line: 'The same closing prices, redrawn as steps: each price holds until the next trading day.',
    data: './data/line-lab.csv',
    a: `const a = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker");`,
    b: `const b = a.curve("curveStepAfter");`,
  },
];
