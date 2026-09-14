// Keep these pairs aligned with tests/browser/unit-lab.spec.mjs.
const base = `const DATA_URL = "./data/iris.csv";
const rows = await d3.csv(DATA_URL, d3.autoType);

const flowers = unit(rows)
  .key("flowerId")
  .layout("grid", { columns: 15, radius: 6 })
  .tooltip(["flowerId", "species", "sepalLength", "sepalWidth", "petalLength", "petalWidth"]);`;

const withHeldOutFlowers = `${base}

const first140 = flowers.data(rows.slice(0, -10));`;

const speciesColors = `["#4c78a8", "#f58518", "#54a24b"]`;

const bars = `${base}

const colored = flowers.color("species", {
  title: "Species",
  range: ${speciesColors}
});
const bySpecies = colored
  .group("species")
  .layout("bar", { columns: 10 });`;

const positioned = `${base}

const colored = flowers.color("species", {
  title: "Species",
  range: ${speciesColors}
});
const byPetalLength = colored
  .x("petalLength", { title: "Petal length (cm)" })
  .layout("beeswarm");`;

const forced = `${base}

const colored = flowers.color("species", {
  title: "Species",
  range: ${speciesColors}
});
const bySpeciesForce = colored
  .x("species", { title: "Species" })
  .layout("force");`;

const unitValueSplit = `${base}

const sampleRows = [...rows.slice(0, 8), ...rows.slice(50, 54)];
const counts = Array.from(
  d3.rollup(sampleRows, values => values.length, row => row.species),
  ([species, count]) => ({ species, count })
);
const detailed = unit(counts)
  .value("count", { unitValue: 1, maxUnits: 40 })
  .key("species")
  .group("species")
  .layout("bar", { columns: 5, radius: 8 })
  .color("species", { title: "Species", range: ${speciesColors} });`;

function sample(id, label, description, setup, from, to) {
  return { id, label, description, code: `${setup}\n\nconst from = ${from};\nconst to = ${to};\n\nreturn { from, to };` };
}

export const chart = 'unit';
export async function loadChart() {
  return (await import('../../dist/unit.js')).unit;
}

export const scenarios = [
  sample('all', '01 · Show all flowers', 'Start with the 50 setosa flowers, then add the other 100 observations as equal units.', base, 'flowers.where({ species: "setosa" })', 'flowers'),
  sample('add', '02 · Add observations', 'Add the final ten virginica observations while every existing flower keeps its identity.', withHeldOutFlowers, 'first140', 'flowers'),
  sample('remove', '03 · Remove observations', 'Remove those same ten flowers in the exact reverse of Add.', withHeldOutFlowers, 'flowers', 'first140'),
  sample('filter', '04 · Filter observations', 'Keep setosa and versicolor flowers, then reflow the surviving units.', base, 'flowers', 'flowers.where({ field: "species", oneOf: ["setosa", "versicolor"] })'),
  sample('highlight', '05 · Highlight a species', 'Keep every flower visible and dim the species outside setosa.', base, 'flowers', 'flowers.highlight({ species: "setosa" }, { opacity: 0.12 })'),
  sample('color', '06 · Map species to color', 'Explicitly map the three Iris species to color while position stays in one grid.', base, 'flowers', `flowers.color("species", { title: "Species", range: ${speciesColors} })`),
  sample('columns', '07 · Change grid columns', 'Reflow all 150 keyed flowers into a wider grid.', base, 'flowers', 'flowers.layout("grid", { columns: 20, radius: 6 })'),
  sample('radius', '08 · Change unit size', 'Change the size of every equal flower unit without mapping size to a data field.', base, 'flowers', 'flowers.radius(8)'),
  sample('bar', '09 · Group flowers by species', 'Arrange the same 150 flowers as three explicitly colored unit bars.', bars, 'colored', 'bySpecies'),
  sample('measure', '10 · Change the measured position', 'Move every flower from its petal-length position to its sepal-length position.', positioned, 'byPetalLength', 'colored.x("sepalLength", { title: "Sepal length (cm)" }).layout("beeswarm")'),
  sample('beeswarm', '11 · Beeswarm by petal length', 'Move flowers across to their measured petal lengths, then use dodge placement to form a non-overlapping swarm.', positioned, 'colored', 'byPetalLength'),
  sample('force', '12 · Gather with forceX', 'Use the explicitly mapped species positions as forceX attractors while collision keeps every flower separate.', forced, 'colored', 'bySpeciesForce'),
  sample('grid', '13 · Return to one grid', 'Move the three species bars back into one grid while every flower keeps its identity.', bars, 'bySpecies', 'colored.layout("grid", { columns: 15, radius: 6 })'),
  sample('unit-value', '14 · Split represented quantities', 'Split each coarse circle into the finer quantity intervals it represents; reverse merges those exact children into their parent.', unitValueSplit, 'detailed.value("count", { unitValue: 4, maxUnits: 40 })', 'detailed'),
  sample('focus', '15 · Focus one flower', 'Keep all 150 flowers and use the shared 2D camera to fit one selected unit to the plot.', base, 'flowers', 'flowers.focus({ flowerId: "iris-001" })')
];
