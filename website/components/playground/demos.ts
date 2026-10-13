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
  .y("population", { label: "Residents under 10", format: "~s" })
  .key(["state", "age"])
  .where({ age: "<10" });`;

export const playgroundDemos: PlaygroundDemo[] = [
  {
    id: 'filter',
    title: 'Which states clear the planning threshold?',
    category: 'data',
    chart: 'bar',
    line: 'A one-million cutoff answers a planning question; widening it shows which states were just below that decision line.',
    data: POPULATION,
    code: underTen,
    edits: [
      { add: '.where({ population: { gte: 1000000 } })' },
      { replace: 'gte: 1000000', with: 'gte: 500000' },
    ],
  },
  {
    id: 'split',
    title: 'Which age groups make up each state total?',
    category: 'grain',
    chart: 'bar',
    line: 'Totals conceal age composition. Reveal the age bands, then place them side by side to compare cohorts directly.',
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
    edits: [
      { remove: '.rollup()' },
      { add: '.layout("grouped")' },
    ],
  },
  {
    id: 'regroup',
    title: 'Does the same total change by year or by place?',
    category: 'grain',
    chart: 'bar',
    line: 'The four records stay fixed; changing the grouping asks whether yearly or location totals answer the question.',
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
    id: 'service-line-split',
    title: 'Which services contribute to the changing request total?',
    category: 'grain',
    chart: 'line',
    line: 'A single monthly total hides service-specific movement. Split the same requests into their source services.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = line(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Monthly requests" })
  .key(["month", "service"])
  .rollup({ op: "sum" });`,
    edits: [
      { replace: '.rollup({ op: "sum" })', with: '.breakdown("service")' },
      { add: '.color("service")' },
    ],
  },
  {
    id: 'summarize',
    title: 'Does the average car represent either group?',
    category: 'grain',
    chart: 'point',
    line: 'Six cars gather into two averages, sized by how many cars they stand for.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("wt", { label: "Weight (1000 lb)" })
  .y("mpg", { label: "Miles per gallon" })
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
  })`
      },
    ],
  },
  {
    id: 'remap',
    title: 'Is engine power related to fuel economy?',
    category: 'encoding',
    chart: 'point',
    line: 'Keep each car keyed; change the horizontal measure, then color by cylinder group to inspect association, not causation.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("wt", { label: "Weight (1000 lb)" })
  .y("mpg", { label: "Miles per gallon" })
  .key("name");`,
    edits: [
      { replace: '.x("wt", { label: "Weight (1000 lb)" })', with: '.x("hp", { label: "Horsepower" })' },
      { add: '.color("cyl", { type: "nominal" })' },
    ],
  },
  {
    id: 'log',
    title: 'What is hidden in the crowded low-power range?',
    category: 'coordinate',
    chart: 'point',
    line: 'Horsepower spans a wide positive range. A logarithmic ruler opens the crowded low end while keeping the measure unchanged.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("hp", { label: "Horsepower" })
  .y("mpg", { label: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    edits: [
      {
        replace: '.x("hp", { label: "Horsepower" })',
        with: '.x("hp", { label: "Horsepower (log₂)", scale: { type: "log", base: 2 } })',
      },
    ],
  },
  {
    id: 'sort',
    title: 'Which states have the largest under-ten populations?',
    category: 'layout',
    chart: 'bar',
    line: 'Rank all states by the same under-ten population measure to identify the largest cohorts.',
    data: POPULATION,
    code: underTen,
    edits: [
      { add: '.title("Residents under 10 by state")' },
      { add: '.sort("population", "descending")' },
    ],
  },
  {
    id: 'stream',
    title: 'When do industry unemployment totals peak?',
    category: 'layout',
    chart: 'area',
    line: 'A stream layout emphasizes when the combined shape rises and falls; layer thickness is not a precise total scale.',
    data: './data/area-lab.csv',
    code: `const chart = area(rows)
  .x("date", { label: "Date" })
  .y("unemployed", { label: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");`,
    edits: [{ add: '.layout("stream", { offset: "wiggle", order: "insideOut" })' }],
  },
  {
    id: 'swarm',
    title: 'Do petal lengths separate the Iris flowers?',
    category: 'layout',
    chart: 'unit',
    line: 'Keep all 150 keyed flowers; compare species totals, then arrange individuals by measured petal length to inspect overlap.',
    data: './data/iris.csv',
    code: `const chart = unit(rows)
  .key("flowerId")
  .size(6)
  .layout("grid", { columns: 15 })
  .color("species");`,
    edits: [
      { add: '.group("species").layout("bar", { columns: 10 })' },
      { replace: '.group("species").layout("bar", { columns: 10 })', with: '.x("petalLength").layout("beeswarm")' },
    ],
  },
  {
    id: 'focus',
    title: 'Is the four-cylinder pattern global or local?',
    category: 'attention',
    chart: 'point',
    line: 'The camera moves to the four-cylinder cars, then lets go and lights them up instead. Every car stays.',
    data: './data/mtcars.csv',
    code: `const chart = point(rows)
  .x("wt", { label: "Weight (1000 lb)" })
  .y("mpg", { label: "Miles per gallon" })
  .key("name")
  .color("cyl", { type: "nominal" });`,
    edits: [
      { add: '.focus({ cyl: 4 })' },
      { replace: '.focus({ cyl: 4 })', with: '.highlight({ cyl: 4 })' },
    ],
  },
  {
    id: 'headline',
    title: 'Can this chart explain itself when shared?',
    category: 'appearance',
    chart: 'bar',
    line: 'Name the measure and its source so a reader can interpret the chart outside this analysis session.',
    data: POPULATION,
    code: underTen,
    edits: [
      { add: '.title("Residents under 10")' },
      { add: '.subtitle("US Census, by state")' },
    ],
  },
  {
    id: 'steps',
    title: 'Does a valve setting change between update events?',
    category: 'appearance',
    chart: 'line',
    line: 'The simulated setting persists until its next update, so a step curve matches how the values were recorded.',
    data: './data/valve-updates.csv',
    code: `const chart = line(rows)
  .x("date", { label: "Update date" })
  .y("setting", { label: "Valve setting (units)" })
  .key(["date", "valve"]);`,
    edits: [{ add: '.curve("curveStepAfter")' }],
  },
  {
    id: 'service-composition',
    title: 'Which services account for the demand increase?',
    category: 'grain',
    chart: 'area',
    line: 'Monthly requests rise overall; splitting the total shows which service contributes to that growth.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = area(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Requests", format: "," })
  .key(["month", "service"])
  .rollup();`,
    edits: [
      { replace: '.rollup()', with: '.breakdown("service")' },
      { add: '.color("service")' },
    ],
  },
  {
    id: 'service-share',
    title: 'Did service composition change as demand grew?',
    category: 'grain',
    chart: 'area',
    line: 'Reveal which services contribute to the total, then compare each service share using that month’s total as denominator.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = area(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Requests", format: "," })
  .key(["month", "service"])
  .rollup();`,
    edits: [
      { replace: '.rollup()', with: '.breakdown("service")' },
      { add: '.color("service")' },
      { replace: '.y("requests", { label: "Requests", format: "," })', with: '.y("share", { label: "Share of monthly requests", format: ".0%" })' },
    ],
  },
  {
    id: 'sensor-outlier',
    title: 'Did a sensor fault create the spike?',
    category: 'data',
    chart: 'line',
    line: 'The 94-unit reading is flagged invalid. Exclude it, leave the resulting gap visible, then restore it to audit the effect.',
    data: './data/sensor-readings.csv',
    code: `const chart = line(rows)
  .x("date", { label: "Date" })
  .y("reading", { label: "Reading (units)" })
  .key(["date", "sensor"])
  .where({ valid: true });`,
    edits: [
      { remove: '.where({ valid: true })' },
      { add: '.where({ valid: true })' },
    ],
  },
  {
    id: 'service-periods',
    title: 'Did demand move between services?',
    category: 'data',
    chart: 'line',
    line: 'Compare the same monthly request measure and service identities across two adjacent periods.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = line(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Monthly requests" })
  .key(["month", "service"])
  .breakdown("service")
  .color("service");`,
    edits: [
      { add: '.where({ field: "month", lt: new Date("2025-04-01") })' },
      { replace: 'lt: new Date("2025-04-01")', with: 'gte: new Date("2025-04-01")' },
    ],
  },
  {
    id: 'window',
    title: 'Where did the recent shift happen?',
    category: 'coordinate',
    chart: 'line',
    line: 'Retain every month, zoom to the latest quarter, then focus that interval while keeping the surrounding observations available.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = line(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Monthly requests" })
  .key(["month", "service"])
  .breakdown("service")
  .color("service");`,
    edits: [
      { replace: '.x("month", { label: "Month" })', with: '.x("month", { label: "Month", domain: [new Date("2025-04-01"), new Date("2025-06-01")] })' },
      { add: '.focus({ field: "month", gte: new Date("2025-04-01") })' },
    ],
  },
  {
    id: 'horizontal-rank',
    title: 'How can long car names stay readable?',
    category: 'coordinate',
    chart: 'bar',
    line: 'Rank cars by fuel economy, then turn the bars sideways so names such as Cadillac Fleetwood remain legible.',
    data: './data/mtcars.csv',
    code: `const chart = bar(rows)
  .x("name", { label: "Car model" })
  .y("mpg", { label: "Miles per gallon" })
  .key("name");`,
    edits: [
      { add: '.sort("mpg", "descending")' },
      { add: '.flip()' },
    ],
  },
  {
    id: 'unit-value',
    title: 'How many observations does each circle represent?',
    category: 'grain',
    chart: 'unit',
    line: 'The same grouped counts expand from coarse units to one circle per flower; no individual is added or removed.',
    data: './data/iris.csv',
    code: `const sampleRows = [...rows.slice(0, 8), ...rows.slice(50, 54)];
const counts = Array.from(
  d3.rollup(sampleRows, values => values.length, row => row.species),
  ([species, count]) => ({ species, count })
);

const chart = unit(counts)
  .value("count", { unitValue: 4, maxUnits: 40 })
  .key("species")
  .group("species")
  .layout("bar", { columns: 5, radius: 8 })
  .color("species");`,
    edits: [
      { replace: 'unitValue: 4', with: 'unitValue: 2' },
      { replace: 'unitValue: 2', with: 'unitValue: 1' },
    ],
  },
  {
    id: 'area-labels',
    title: 'Can the service layers be read without a legend?',
    category: 'appearance',
    chart: 'area',
    line: 'Label the service layers directly, then add the measure and simulated-data context for a standalone chart.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = area(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Requests", format: "," })
  .key(["month", "service"])
  .breakdown("service")
  .color("service");`,
    edits: [
      { add: '.labels("inside")' },
      { add: '.title("Monthly service requests").subtitle("Simulated counts by service")' },
    ],
  },
  {
    id: 'recession-window',
    title: 'Which months stand out within the full service trend?',
    category: 'attention',
    chart: 'area',
    line: 'Emphasize the last quarter in the full trend, then inspect that interval with the surrounding rows still present.',
    data: './data/service-demand-monthly.csv',
    code: `const chart = area(rows)
  .x("month", { label: "Month" })
  .y("requests", { label: "Requests", format: "," })
  .key(["month", "service"])
  .breakdown("service")
  .color("service");`,
    edits: [
      { add: '.highlight({ field: "month", gte: new Date("2025-04-01") }, { opacity: 0.15 })' },
      { add: '.focus({ field: "month", gte: new Date("2025-04-01") })' },
    ],
  },
  {
    id: 'weekly-stations',
    title: 'Does weekly averaging hide daily variation in AAPL?',
    category: 'grain',
    chart: 'line',
    line: 'Compare AAPL daily closes with their weekly averages, without pooling prices from different companies.',
    data: './data/line-lab.csv',
    code: `const chart = line(rows)
  .where({ ticker: "AAPL" })
  .x("date", { label: "Trading day" })
  .y("close", { label: "Close (USD)", format: "$.2f" })
  .key("date");`,
    edits: [
      { replace: '.x("date", { label: "Trading day" })\n  .y("close", { label: "Close (USD)", format: "$.2f" })\n  .key("date")', with: '.x("week", { label: "Week" })\n  .y("close", { label: "Weekly mean close (USD)", format: "$.2f" })\n  .key("week")\n  .rollup({ op: "mean" })' },
    ],
  },
  {
    id: 'revenue-profit',
    title: 'Does the highest revenue channel earn the most profit?',
    category: 'encoding',
    chart: 'bar',
    line: 'The same quarter and channels are ranked first by revenue, then by profit computed as revenue minus cost.',
    data: './data/channel-finance.csv',
    code: `const chart = bar(rows)
  .x("channel", { label: "Sales channel" })
  .y("revenue", { label: "Revenue (USD)", format: "$,.0f" })
  .key("channel");`,
    edits: [
      { replace: '.y("revenue", { label: "Revenue (USD)", format: "$,.0f" })', with: '.y("profit", { label: "Profit (USD)", format: "$,.0f" })' },
      { add: '.sort("profit", "descending")' },
    ],
  },
];
