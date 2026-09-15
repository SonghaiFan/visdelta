// Keep these pairs aligned with tests/browser/point-lab.spec.mjs.
const base = `const DATA_URL = "./data/mtcars.csv";

const cars = point({ url: DATA_URL })
  .x("wt", { title: "Weight (1,000 lb)" })
  .y("mpg", { title: "Fuel economy (mpg)" })
  .key("name")
  .tooltip(["name", "cyl", "mpg", "wt", "hp"]);`;

const replacement = `const DATA_URL = "./data/mtcars.csv";
const rows = await d3.csv(DATA_URL, d3.autoType);

const fourCylinderCars = point(rows.filter(row => row.cyl === 4))
  .x("wt", { title: "Weight (1,000 lb)" })
  .y("mpg", { title: "Fuel economy (mpg)" })
  .key("name")
  .tooltip(["name", "cyl", "mpg", "wt", "hp"]);`;

function sample(id, label, description, setup, from, to) {
  return { id, label, description, code: `${setup}\n\nconst from = ${from};\nconst to = ${to};\n\nreturn { from, to };` };
}

const summarySetup = `${base}
const SUMMARY_CARS = ["Datsun 710", "Fiat 128", "Honda Civic", "Duster 360", "Camaro Z28", "Maserati Bora"];

const detailed = cars
  .where({ field: "name", oneOf: SUMMARY_CARS })
  .color("cyl", { type: "nominal", title: "Cylinders", domain: [4, 8], range: ["#4c78a8", "#f58518"] });
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
  sample('x', '01 · Change x field', 'Move the same 32 cars from weight to engine displacement on the horizontal axis.', base, 'cars', 'cars.x("disp", { title: "Displacement (cu in)" })'),
  sample('y', '02 · Change y field', 'Move the same cars from fuel economy to horsepower on the vertical axis.', base, 'cars', 'cars.y("hp", { title: "Horsepower" })'),
  sample('xy', '03 · Change both fields', 'Change both position mappings while every car keeps its identity.', base, 'cars', 'cars.x("disp", { title: "Displacement (cu in)" }).y("hp", { title: "Horsepower" })'),
  sample('filter', '04 · Filter points', 'Keep the 11 four-cylinder cars; scrub backward to restore the other cars.', base, 'cars', 'cars.where({ cyl: 4 })'),
  sample('add', '05 · Add a point', 'Add the real Maserati Bora observation at its target position.', base, 'cars.where({ field: "name", notEqual: "Maserati Bora" })', 'cars'),
  sample('data', '06 · Replace observations', 'Replace the four-cylinder rows with the six-cylinder rows from the same CSV.', replacement, 'fourCylinderCars', 'fourCylinderCars.data(rows.filter(row => row.cyl === 6))'),
  sample('highlight', '07 · Highlight points', 'Keep every car visible and dim cars that do not have four cylinders.', base, 'cars', 'cars.highlight({ cyl: 4 }, { opacity: 0.12 })'),
  sample('color', '08 · Map color', 'Explicitly map cylinder count to a categorical color scale.', base, 'cars', 'cars.color("cyl", { type: "nominal", title: "Cylinders", domain: [4, 6, 8], range: ["#4c78a8", "#f2cf5b", "#f58518"] })'),
  sample('size', '09 · Map size', 'Explicitly map horsepower to point radius.', base, 'cars.radius(5)', 'cars.size("hp", { title: "Horsepower", range: [5, 18] })'),
  sample('flip', '10 · Swap x and y', 'Swap vehicle weight and fuel economy while preserving car identity.', base, 'cars', 'cars.flip({ order: ["x", "y"] })'),
  sample('rollup', '11 · Combine into summaries', 'Gather the points under one fixed view, then let the view return to the summary scale.', summarySetup, 'detailed', 'summary'),
  sample('breakdown', '12 · Reveal detail', 'Set the detail view first, then spread each cylinder-count summary into its cars.', summarySetup, 'summary', 'detailed'),
  sample('focus', '13 · Focus the view', 'Keep all 32 cars in the scene while fitting both axes around four-cylinder cars.', base, 'cars', 'cars.focus({ cyl: 4 })')
];

export const scenarios = pointScenarios;
