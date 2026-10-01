import { transitionScenario } from '../scenario.js';

// Keep these pairs aligned with tests/browser/point-lab.spec.mjs.
const base = `const DATA_URL = "./data/mtcars.csv";

const cars = point({ url: DATA_URL })
  .x("wt")
  .y("mpg")
  .key("name");`;

const replacement = `const DATA_URL = "./data/mtcars.csv";
const rows = await d3.csv(DATA_URL, d3.autoType);

const fourCylinderCars = point(rows.filter(row => row.cyl === 4))
  .x("wt")
  .y("mpg")
  .key("name");`;

const sampleCategories = {
  x: 'encoding', y: 'encoding', xy: 'encoding', filter: 'data', add: 'data',
  data: 'data', highlight: 'attention', color: 'encoding', size: 'encoding',
  flip: 'coordinate', rollup: 'grain', breakdown: 'grain', focus: 'attention'
};

function sample(id, label, description, setup, from, to) {
  return transitionScenario({ id, category: sampleCategories[id], label, description, setup, from, to });
}

const summarySetup = `${base}
const SUMMARY_CARS = ["Datsun 710", "Fiat 128", "Honda Civic", "Duster 360", "Camaro Z28", "Maserati Bora"];

const detailed = cars
  .where({ field: "name", oneOf: SUMMARY_CARS })
  .color("cyl", { type: "nominal", domain: [4, 8] });
const summary = detailed.rollup("cyl", {
  key: "cyl",
  x: { op: "mean" },
  y: { op: "mean" },
  size: { op: "count", range: [10, 24] }
});`;

export const chart = 'point';
export async function loadChart() {
  return (await import('../../dist/point.js')).point;
}

export const pointScenarios = [
  sample('x', '01 · Change x field', 'Move the same 32 cars from weight to engine displacement on the horizontal axis.', base, 'cars', 'cars.x("disp")'),
  sample('y', '02 · Change y field', 'Move the same cars from fuel economy to horsepower on the vertical axis.', base, 'cars', 'cars.y("hp")'),
  sample('xy', '03 · Change both fields', 'Change both position mappings while every car keeps its identity.', base, 'cars', 'cars.x("disp").y("hp")'),
  sample('filter', '04 · Filter points', 'Keep the 11 four-cylinder cars; scrub backward to restore the other cars.', base, 'cars', 'cars.where({ cyl: 4 })'),
  sample('add', '05 · Add a point', 'Add the real Maserati Bora observation at its target position.', base, 'cars.where({ field: "name", notEqual: "Maserati Bora" })', 'cars'),
  sample('data', '06 · Replace observations', 'Replace the four-cylinder rows with the six-cylinder rows from the same CSV.', replacement, 'fourCylinderCars', 'fourCylinderCars.data(rows.filter(row => row.cyl === 6))'),
  sample('highlight', '07 · Highlight points', 'Keep every car visible and dim cars that do not have four cylinders.', base, 'cars', 'cars.highlight({ cyl: 4 }, { opacity: 0.12 })'),
  sample('color', '08 · Map color', 'Map cylinder count with the active style’s default categorical color scheme.', base, 'cars', 'cars.color("cyl", { type: "nominal" })'),
  sample('size', '09 · Map size', 'Explicitly map horsepower to point radius.', base, 'cars.radius(5)', 'cars.size("hp", { range: [5, 18] })'),
  sample('flip', '10 · Swap x and y', 'Swap vehicle weight and fuel economy while preserving car identity.', base, 'cars', 'cars.flip({ order: ["x", "y"] })'),
  sample('rollup', '11 · Combine into summaries', 'Gather the points under one fixed view, then let the view return to the summary scale.', summarySetup, 'detailed', 'summary'),
  sample('breakdown', '12 · Reveal detail', 'Set the detail view first, then spread each cylinder-count summary into its cars.', summarySetup, 'summary', 'detailed'),
  sample('focus', '13 · Focus the view', 'Keep all 32 cars in the scene while fitting both axes around four-cylinder cars.', base, 'cars', 'cars.focus({ cyl: 4 })')
];

export const scenarios = pointScenarios;
