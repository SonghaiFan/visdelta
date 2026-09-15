// Keep these pairs aligned with tests/browser/area-lab.spec.mjs.
const unemploymentData = `const DATA_URL = "./data/unemployment.csv";
const startDate = new Date("2007-01-01");
const endDate = new Date("2010-02-01");
const unemploymentRows = await d3.csv(DATA_URL, d3.autoType);
const rows = unemploymentRows.filter((row) =>
  row.date >= startDate && row.date <= endDate
);`;

const base = `${unemploymentData}

const manufacturingRows = rows.filter((row) => row.industry === "Manufacturing");
const constructionRows = rows.filter((row) => row.industry === "Construction");

const base = area(manufacturingRows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key("date")
  .tooltip(["date", "industry", "unemployed", "share"]);`;

const stacked = `${unemploymentData}

const selectedIndustries = [
  "Wholesale and Retail Trade",
  "Manufacturing",
  "Leisure and hospitality",
  "Business services",
  "Construction"
];
const industryRows = rows.filter((row) => selectedIndustries.includes(row.industry));

const detailed = area(industryRows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry", {
    color: ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
  });

const total = detailed.rollup({ op: "sum" });`;

const filtered = `${base}

const filtered = base.where({ field: "year", notEqual: 2008 });`;

const added = `${unemploymentData}

const recentRows = rows
  .filter((row) => row.industry === "Manufacturing")
  .slice(-13);
const beforeLatest = recentRows.slice(0, -1);

const base = area(beforeLatest)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key("date")
  .tooltip(["date", "industry", "unemployed", "share"]);

const withLatest = base.data(recentRows);`;

function sample(id, label, description, setup, from, to) {
  return { id, label, description, code: `${setup}\n\nconst from = ${from};\nconst to = ${to};\n\nreturn { from, to };` };
}

export const chart = 'area';
export async function loadChart() {
  return (await import('../../dist/area.js')).area;
}

export const scenarios = [
  sample('x', '01 · Focus the time window', 'Keep every monthly observation but fit the date axis to the recession period.', base, 'base', 'base.x("date", { title: "Date", domain: [new Date("2008-09-01"), endDate] })'),
  sample('y', '02 · Change the measure', 'Change the manufacturing band from unemployed people to its explicitly prepared share of total unemployment.', base, 'base', 'base.y("share", { title: "Share of total unemployment", format: ".0%" })'),
  sample('filter', '03 · Filter observations', 'Remove the 2008 manufacturing observations and preserve that missing year as an honest gap.', filtered, 'base', 'filtered'),
  sample('restore', '04 · Restore observations', 'Restore the same 2008 observations and their part of the area.', filtered, 'filtered', 'base'),
  sample('add', '05 · Add an observation', 'Extend the manufacturing area to February 2010.', added, 'base', 'withLatest'),
  sample('remove', '06 · Remove an observation', 'Remove February 2010 in the exact reverse of Add.', added, 'withLatest', 'base'),
  sample('data', '07 · Compare industries', 'Keep the monthly dates and mapping, but move from manufacturing to construction unemployment.', base, 'base', 'base.data(constructionRows)'),
  sample('highlight', '08 · Highlight one industry', 'Keep all five industry layers and dim every layer except Construction.', stacked, 'detailed', 'detailed.highlight({ industry: "Construction" }, { opacity: 0.12 })'),
  sample('color', '09 · Change fill color', 'Change a constant fill without changing manufacturing data or geometry.', base, 'base.color("#1c6ae4")', 'base.color("#fa4d1d")'),
  sample('baseline', '10 · Change baseline', 'Rebase the band at 500 thousand so the filled height shows unemployment above that level.', base, 'base', 'base.baseline(500)'),
  sample('focus', '11 · Focus the view', 'Keep all manufacturing observations while fitting one 2D camera around the 2009 area cells.', base, 'base', 'base.focus({ field: "year", equal: 2009 })'),
  sample('split', '12 · Split into industry areas', 'Draw the internal boundaries through the combined total, then reveal five explicitly colored industries.', stacked, 'total', 'detailed'),
  sample('merge', '13 · Merge into a total', 'Hide the industry parts and erase the same boundaries in exact reverse.', stacked, 'detailed', 'total'),
  sample('curve', '14 · Change curve', 'Shape both manufacturing Area boundaries with exact D3 curve names.', base, 'base.curve("curveLinear")', 'base.curve("curveMonotoneX")'),
  sample('stream', '15 · Center as a streamgraph', 'Order the layers inside-out and shift their baseline with D3’s wiggle offset.', stacked, 'detailed', 'detailed.layout("stream", { offset: "wiggle", order: "insideOut" })')
];
