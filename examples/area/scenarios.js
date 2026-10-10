import { transitionScenario } from '../scenario.js';

// Keep these pairs aligned with tests/browser/area-lab.spec.mjs.
const base = `const DATA_URL = "./data/area-lab.csv";

const industries = area({ url: DATA_URL })
  .x("date")
  .y("unemployed");

const base = industries
  .where({ industry: "Manufacturing" })
  .connect("across");`;

const stacked = `const DATA_URL = "./data/area-lab.csv";

const detailed = area({ url: DATA_URL })
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");

const total = detailed.rollup({ op: "sum" });`;

const filtered = `${base}

const filtered = base.where({ field: "year", notEqual: 2008 });`;

const added = `${base}

const withoutLatest = base.where({ field: "date", lt: new Date("2010-02-01") });
const withLatest = base;`;

const sampleCategories = {
  x: 'coordinate', y: 'encoding', filter: 'data', restore: 'data', add: 'data',
  remove: 'data', data: 'data', highlight: 'attention', 'highlight-range': 'attention', color: 'appearance',
  baseline: 'appearance', focus: 'attention', split: 'grain', merge: 'grain',
  curve: 'appearance', stream: 'layout'
};

function sample(id, label, description, setup, from, to) {
  return transitionScenario({ id, category: sampleCategories[id], label, description, setup, from, to });
}

export const chart = 'area';
export async function loadChart() {
  return (await import('../../dist/area.js')).area;
}

export const scenarios = [
  sample('x', '01 · Focus the time window', 'Keep every monthly observation but fit the date axis to the most recent nine months.', base, 'base', 'base.x("date", { domain: [new Date("2009-06-01"), new Date("2010-02-01")] })'),
  sample('y', '02 · Change the measure', 'Change the manufacturing band from unemployed people to its explicitly prepared share of total unemployment.', base, 'base', 'base.y("share")'),
  sample('filter', '03 · Filter observations', 'Remove the 2008 manufacturing observations and update the remaining area.', filtered, 'base', 'filtered'),
  sample('restore', '04 · Restore observations', 'Restore the same 2008 observations and their part of the area.', filtered, 'filtered', 'base'),
  sample('add', '05 · Add an observation', 'Extend the manufacturing area to February 2010.', added, 'withoutLatest', 'withLatest'),
  sample('remove', '06 · Remove an observation', 'Remove February 2010 in the exact reverse of Add.', added, 'withLatest', 'withoutLatest'),
  sample('data', '07 · Compare industries', 'Keep the monthly dates and mapping, but move from manufacturing to construction unemployment.', base, 'base', 'industries.where({ industry: "Construction" }).connect("across")'),
  sample('highlight', '08 · Highlight one industry', 'Keep all three industry layers and dim every layer except Construction.', stacked, 'detailed', 'detailed.highlight({ industry: "Construction" }, { opacity: 0.12 })'),
  sample('highlight-range', '09 · Highlight an x range', 'Keep the complete manufacturing series and emphasize the recession interval from September 2008 through June 2009.', base, 'base', 'base.highlight({ field: "date", gte: new Date("2008-09-01"), lte: new Date("2009-06-01") }, { opacity: 0.12 })'),
  sample('color', '10 · Change fill color', 'Change a constant fill without changing manufacturing data or geometry.', base, 'base.color("#1c6ae4")', 'base.color("#fa4d1d")'),
  sample('baseline', '11 · Change baseline', 'Rebase the band at 500 thousand so the filled height shows unemployment above that level.', base, 'base', 'base.baseline(500)'),
  sample('focus', '12 · Focus the view', 'Keep all manufacturing observations while fitting one 2D camera around the 2009 area cells.', base, 'base', 'base.focus({ field: "year", equal: 2009 })'),
  sample('split', '13 · Split into industry areas', 'Draw the internal boundaries through the combined total, then reveal three industries using the default color scheme.', stacked, 'total', 'detailed'),
  sample('merge', '14 · Merge into a total', 'Hide the industry parts and erase the same boundaries in exact reverse.', stacked, 'detailed', 'total'),
  sample('curve', '15 · Change curve', 'Shape both manufacturing Area boundaries with exact D3 curve names.', base, 'base.curve("curveLinear")', 'base.curve("curveMonotoneX")'),
  sample('stream', '16 · Center as a streamgraph', 'Order the layers inside-out and shift their baseline with D3’s wiggle offset.', stacked, 'detailed', 'detailed.layout("stream", { offset: "wiggle", order: "insideOut" })')
];
