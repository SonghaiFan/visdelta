import { transitionScenario } from '../scenario.js';

// Keep these pairs aligned with tests/browser/transition.spec.mjs.
const population = `const DATA_URL = "./data/us-population-state-age-tidy.csv";
const FEATURE_STATES = ["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA"];

const population = bar({ url: DATA_URL })
  .datumKey(["state", "age"])
  .x("state")
  .y("population")
  .key(["state", "age"]);

const under10 = population.where({ age: "<10" });
const featured = under10.where({ field: "state", oneOf: FEATURE_STATES });`;

const populationDataChange = `const DATA_URL = "./data/us-population-state-age-tidy.csv";
const INITIAL_STATES = ["CA", "TX", "FL", "NY", "PA", "IL"];
const EXPANDED_STATES = [...INITIAL_STATES, "OH", "GA"];
const rows = await d3.csv(DATA_URL, d3.autoType);
const under10 = rows.filter(row => row.age === "<10");

const base = bar(under10.filter(row => INITIAL_STATES.includes(row.state)))
  .datumKey(["state", "age"])
  .x("state")
  .y("population")
  .key(["state", "age"]);`;

const populationFocus = `${population}
const FOCUS_ANCHORS = ["NY", "PA"];`;

const ageConstants = `const DATA_URL = "./data/us-population-state-age-tidy.csv";
const AGE_BANDS = ["<10", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "≥80"];`;

const segmentedOverview = `${ageConstants}

const detailed = bar({ url: DATA_URL })
  .x("state")
  .y("population")
  .key(["state", "age"])
  .breakdown("age")
  .color("age", { domain: AGE_BANDS, scheme: "Blues" });`;

const segmentedFeatured = `${ageConstants}
const FEATURE_STATES = ["CA", "TX", "FL", "NY", "PA", "IL"];

const detailed = bar({ url: DATA_URL })
  .x("state")
  .y("population")
  .key(["state", "age"])
  .where({ field: "state", oneOf: FEATURE_STATES })
  .breakdown("age")
  .color("age", { domain: AGE_BANDS, scheme: "Blues" });`;

const lineageReaggregation = `const cases = [
  { id: "r1", year: 2020, location: "A", cases: 10 },
  { id: "r2", year: 2020, location: "B", cases: 5 },
  { id: "r3", year: 2021, location: "A", cases: 12 },
  { id: "r4", year: 2021, location: "B", cases: 8 }
];

const base = bar(cases)
  .datumKey("id")
  .y("cases");

const byYear = base
  .x("year")
  .rollup("year");

const byLocation = base
  .x("location")
  .rollup("location");`;

const sampleCategories = {
  measure: 'data', filter: 'data', highlight: 'attention', color: 'encoding',
  sort: 'layout', flip: 'coordinate', data: 'data', split: 'grain', merge: 'grain',
  layout: 'layout', 'grouped-split': 'grain', 'grouped-merge': 'grain',
  focus: 'attention', reaggregate: 'grain', appearance: 'appearance'
};

function sample(id, label, description, setup, from, to) {
  return transitionScenario({ id, category: sampleCategories[id], label, description, setup, from, to });
}

export const chart = 'bar';
export async function loadChart() {
  return (await import('../../dist/bar.js')).bar;
}

export const scenarios = [
  sample('measure', '01 · Compare age groups', 'For eight major states, change the observed cohort from residents under 10 to residents aged 80 and over.', population, 'featured', 'population.where({ age: "≥80" }).where({ field: "state", oneOf: FEATURE_STATES })'),
  sample('filter', '02 · Filter states', 'Keep four of the eight explicitly listed states; drag back to restore the others.', population, 'featured', 'featured.where({ field: "state", oneOf: ["CA", "TX", "FL", "NY"] })'),
  sample('highlight', '03 · Highlight states', 'Emphasize California and Texas while retaining all eight state bars.', population, 'featured', 'featured.highlight({ field: "state", oneOf: ["CA", "TX"] })'),
  sample('color', '04 · Change color measure', 'Change the quantitative color encoding from uniform black to the explicitly declared population scale.', population, 'featured', 'featured.color({ field: "population", type: "quantitative" })'),
  sample('sort', '05 · Rank all regions', 'Reorder all 52 regions by their under-10 population, largest first.', population, 'under10', 'under10.sort("population", "descending")'),
  sample('flip', '06 · Flip orientation', 'Move the eight-state comparison from vertical to horizontal bars.', population, 'featured', 'featured.flip()'),
  sample('data', '07 · Add real rows', 'Replace a six-state extract with an eight-state extract from the same tidy CSV, without changing any values.', populationDataChange, 'base', 'base.data(under10.filter(row => EXPANDED_STATES.includes(row.state)))'),
  sample('split', '08 · Split into age stacks', 'Split totals for all 52 regions into nine ordered age bands.', segmentedOverview, 'detailed.rollup()', 'detailed'),
  sample('merge', '09 · Merge age stacks', 'Combine nine age bands into one population total for every region.', segmentedOverview, 'detailed', 'detailed.rollup()'),
  sample('layout', '10 · Stacked → grouped', 'For six named states, keep the age detail and change from stacked to side-by-side bars.', segmentedFeatured, 'detailed', 'detailed.layout("grouped")'),
  sample('grouped-split', '11 · Split into grouped ages', 'Move six state totals into side-by-side age-band detail.', segmentedFeatured, 'detailed.rollup()', 'detailed.layout("grouped")'),
  sample('grouped-merge', '12 · Merge grouped ages', 'Move the six-state grouped detail back into population totals.', segmentedFeatured, 'detailed.layout("grouped")', 'detailed.rollup()'),
  sample('focus', '13 · Focus the view', 'Fit one camera around New York and Pennsylvania. Keep all 52 observations, the complete ordered state scale, and every state between the two anchors.', populationFocus, 'under10', 'under10.focus({ field: "state", oneOf: FOCUS_ANCHORS })'),
  sample('reaggregate', '14 · Split → move → merge', 'Regroup the same four source records from totals by year to totals by location. VisDelta identifies and composes split, update, and merge stages automatically.', lineageReaggregation, 'byYear', 'byLocation'),
  sample('appearance', '15 · Restyle bars', 'Change one authored constant bar color without changing data, grain, encoding, coordinates, or layout.', population, 'featured.color("#111111")', 'featured.color("#2f64ff")')
];
