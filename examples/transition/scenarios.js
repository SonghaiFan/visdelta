// Keep these pairs aligned with tests/browser/transition.spec.mjs.
const population = `const DATA_URL = "./data/us-population-state-age-tidy.csv";
const FEATURE_STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA"];

const population = bar(DATA_URL)
  .x("state", { title: "State" })
  .y("population", { title: "Population", format: "~s" })
  .key(["state", "age"]);

const under10 = population.where({ age: "<10" });
const featured = under10.where({ field: "state", oneOf: FEATURE_STATES });`;

const populationDataChange = `const DATA_URL = "./data/us-population-state-age-tidy.csv";
const INITIAL_STATES = ["CA", "TX", "FL", "NY", "PA", "IL"];
const EXPANDED_STATES = [...INITIAL_STATES, "OH", "GA"];
const rows = await d3.csv(DATA_URL, d3.autoType);
const under10 = rows.filter(row => row.age === "<10");

const base = bar(under10.filter(row => INITIAL_STATES.includes(row.state)))
  .x("state", { title: "State" })
  .y("population", { title: "Population", format: "~s" })
  .key(["state", "age"]);`;

const populationFocus = `${population}
const FOCUS_ANCHORS = ["NY", "PA"];`;

const ageConstants = `const DATA_URL = "./data/us-population-state-age-tidy.csv";
const AGE_BANDS = ["<10", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "≥80"];
const AGE_COLORS = ["#d53e4f", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#e6f598", "#abdda4", "#66c2a5", "#3288bd"];`;

const segmentedOverview = `${ageConstants}

const detailed = bar(DATA_URL)
  .x("state", { title: "State" })
  .y("population", { title: "Population", format: "~s" })
  .key(["state", "age"])
  .breakdown("age")
  .color("age", { domain: AGE_BANDS, range: AGE_COLORS });`;

const segmentedFeatured = `${ageConstants}
const FEATURE_STATES = ["CA", "TX", "FL", "NY", "PA", "IL"];

const detailed = bar(DATA_URL)
  .x("state", { title: "State" })
  .y("population", { title: "Population", format: "~s" })
  .key(["state", "age"])
  .where({ field: "state", oneOf: FEATURE_STATES })
  .breakdown("age")
  .color("age", { domain: AGE_BANDS, range: AGE_COLORS });`;

const lineageReaggregation = `const cases = [
  { id: "r1", year: 2020, location: "A", cases: 10 },
  { id: "r2", year: 2020, location: "B", cases: 5 },
  { id: "r3", year: 2021, location: "A", cases: 12 },
  { id: "r4", year: 2021, location: "B", cases: 8 }
];

const base = bar(cases)
  .datumKey("id")
  .y("cases", { title: "Cases" });

const byYear = base
  .x("year", { title: "Year" })
  .rollup("year");

const byLocation = base
  .x("location", { title: "Location" })
  .rollup("location");`;

function sample(id, label, description, setup, from, to) {
  return { id, label, description, code: `${setup}\n\nconst from = ${from};\nconst to = ${to};\n\nreturn { from, to };` };
}

export const chart = 'bar';
export async function loadChart() {
  return (await import('../../dist/bar.js')).bar;
}

export const scenarios = [
  sample('measure', '01 · Compare age groups', 'For eight major states, change the observed cohort from residents under 10 to residents aged 80 and over.', population, 'featured', 'population.where({ age: "≥80" }).where({ field: "state", oneOf: FEATURE_STATES })'),
  sample('filter', '02 · Filter states', 'Keep four of the eight explicitly listed states; drag back to restore the others.', population, 'featured', 'featured.where({ field: "state", oneOf: ["CA", "TX", "FL", "NY"] })'),
  sample('highlight', '03 · Highlight states', 'Emphasize California and Texas while retaining all eight state bars.', population, 'featured', 'featured.highlight({ field: "state", oneOf: ["CA", "TX"] })'),
  sample('color', '04 · Change color measure', 'Change the quantitative color encoding from uniform black to the explicitly declared population scale.', population, 'featured', 'featured.color({ field: "population", type: "quantitative", title: "Population" })'),
  sample('sort', '05 · Rank all regions', 'Reorder all 52 regions by their under-10 population, largest first.', population, 'under10', 'under10.sort("population", "descending")'),
  sample('flip', '06 · Flip orientation', 'Move the eight-state comparison from vertical to horizontal bars.', population, 'featured', 'featured.flip()'),
  sample('data', '07 · Add real rows', 'Replace a six-state extract with an eight-state extract from the same tidy CSV, without changing any values.', populationDataChange, 'base', 'base.data(under10.filter(row => EXPANDED_STATES.includes(row.state)))'),
  sample('split', '08 · Split into age stacks', 'Split totals for all 52 regions into nine ordered age bands.', segmentedOverview, 'detailed.rollup()', 'detailed'),
  sample('merge', '09 · Merge age stacks', 'Combine nine age bands into one population total for every region.', segmentedOverview, 'detailed', 'detailed.rollup()'),
  sample('layout', '10 · Stacked → grouped', 'For six named states, keep the age detail and change from stacked to side-by-side bars.', segmentedFeatured, 'detailed', 'detailed.layout("grouped")'),
  sample('grouped-split', '11 · Split into grouped ages', 'Move six state totals into side-by-side age-band detail.', segmentedFeatured, 'detailed.rollup()', 'detailed.layout("grouped")'),
  sample('grouped-merge', '12 · Merge grouped ages', 'Move the six-state grouped detail back into population totals.', segmentedFeatured, 'detailed.layout("grouped")', 'detailed.rollup()'),
  sample('focus', '13 · Focus the view', 'Fit one camera around New York and Pennsylvania. Keep all 52 observations, the complete ordered state scale, and every state between the two anchors.', populationFocus, 'under10', 'under10.focus({ field: "state", oneOf: FOCUS_ANCHORS })'),
  sample('reaggregate', '14 · Split → move → merge', 'Regroup the same four source records from totals by year to totals by location. VisDelta identifies and composes split, update, and merge stages automatically.', lineageReaggregation, 'byYear', 'byLocation')
];
