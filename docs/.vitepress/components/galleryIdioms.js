// Visual idioms VisDelta can express today, grouped by mark. Each idiom is the
// exact code a reader can paste into the Playground: `rows` is the parsed CSV
// named by `data`, and the chart factory is in scope under its own name.
// Gallery and Playground both evaluate these strings; keep them runnable.

const FEATURE_STATES = '["CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA"]';
const SIX_STATES = '["CA", "TX", "FL", "NY", "PA", "IL"]';
const AGES = '["<10", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "≥80"]';
const POPULATION = './data/us-population-state-age-tidy.csv';
const STOCKS = './data/line-lab.csv';
const STOCK_YEAR = './data/stock.csv';
const INDUSTRIES = './data/area-lab.csv';
const UNEMPLOYMENT = './data/unemployment.csv';
const CARS = './data/mtcars.csv';
const IRIS = './data/iris.csv';

export const idiomGroups = [
  { mark: 'bar', title: 'Bar', summary: 'Compare categories against a shared baseline with rectangles.' },
  { mark: 'line', title: 'Line', summary: 'Follow an ordered measure through connected observations.' },
  { mark: 'area', title: 'Area', summary: 'Fill the band between a baseline and a measure, alone or stacked.' },
  { mark: 'point', title: 'Point', summary: 'Place each observation as a dot; relate, rank and connect them.' },
  { mark: 'unit', title: 'Unit', summary: 'Count with one equal circle per observation or represented quantity.' }
];

export const idioms = [
  // Bar ------------------------------------------------------------------
  {
    id: 'vertical-bars', mark: 'bar', title: 'Vertical bar chart', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { title: "Residents under 10" })
  .key(["state", "age"])
  .where({ age: "<10" })
  .where({ field: "state", oneOf: ${FEATURE_STATES} });`
  },
  {
    id: 'horizontal-bars', mark: 'bar', title: 'Horizontal bar chart', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { title: "Residents under 10" })
  .key(["state", "age"])
  .where({ age: "<10" })
  .where({ field: "state", oneOf: ${FEATURE_STATES} })
  .flip();`
  },
  {
    id: 'ranked-bars', mark: 'bar', title: 'Ranked bar chart', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { title: "Residents under 10" })
  .key(["state", "age"])
  .where({ age: "<10" })
  .sort("population", "descending");`
  },
  {
    id: 'ranked-horizontal-bars', mark: 'bar', title: 'Ranked horizontal bars', data: CARS,
    code: `const chart = bar(rows)
  .x("name", { title: "Car" })
  .y("hp", { title: "Horsepower" })
  .key("name")
  .sort("hp", "descending")
  .flip();`
  },
  {
    id: 'stacked-bars', mark: 'bar', title: 'Stacked bar chart', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { format: "~s" })
  .key(["state", "age"])
  .where({ field: "state", oneOf: ${SIX_STATES} })
  .breakdown("age")
  .color("age", { domain: ${AGES}, scheme: "Blues" });`
  },
  {
    id: 'stacked-bars-all', mark: 'bar', title: 'Stacked bars, many categories', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { format: "~s" })
  .key(["state", "age"])
  .breakdown("age")
  .color("age", { domain: ${AGES}, scheme: "Blues" });`
  },
  {
    id: 'horizontal-stacked-bars', mark: 'bar', title: 'Horizontal stacked bars', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { format: "~s" })
  .key(["state", "age"])
  .where({ field: "state", oneOf: ${SIX_STATES} })
  .breakdown("age")
  .color("age", { domain: ${AGES}, scheme: "Blues" })
  .flip();`
  },
  {
    id: 'grouped-bars', mark: 'bar', title: 'Grouped bar chart', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population", { format: "~s" })
  .key(["state", "age"])
  .where({ field: "state", oneOf: ${SIX_STATES} })
  .breakdown("age")
  .color("age", { domain: ${AGES}, scheme: "Blues" })
  .layout("grouped");`
  },
  {
    id: 'aggregated-bars', mark: 'bar', title: 'Aggregated bars', data: POPULATION,
    code: `const chart = bar(rows)
  .x("age", { title: "Age band" })
  .y("population", { title: "Total residents", format: "~s" })
  .rollup("age");`
  },
  {
    id: 'color-scaled-bars', mark: 'bar', title: 'Color-scaled bars', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population")
  .key(["state", "age"])
  .where({ age: "<10" })
  .where({ field: "state", oneOf: ${FEATURE_STATES} })
  .color({ field: "population", type: "quantitative" });`
  },
  {
    id: 'highlighted-bars', mark: 'bar', title: 'Highlighted bars', data: POPULATION,
    code: `const chart = bar(rows)
  .x("state")
  .y("population")
  .key(["state", "age"])
  .where({ age: "<10" })
  .where({ field: "state", oneOf: ${FEATURE_STATES} })
  .highlight({ field: "state", oneOf: ["CA", "TX"] });`
  },

  // Line -----------------------------------------------------------------
  {
    id: 'line', mark: 'line', title: 'Line chart', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key("date")
  .where({ ticker: "AAPL" });`
  },
  {
    id: 'multi-series-line', mark: 'line', title: 'Multi-series line chart', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker");`
  },
  {
    id: 'many-series-line', mark: 'line', title: 'Many series', data: UNEMPLOYMENT,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)" })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");`
  },
  {
    id: 'long-line', mark: 'line', title: 'Daily time series', data: STOCK_YEAR,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.0f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker")
  .strokeWidth(1.5);`
  },
  {
    id: 'line-with-points', mark: 'line', title: 'Line with points', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key("date")
  .where({ ticker: "GOOG" })
  .pointSize(4);`
  },
  {
    id: 'step-line', mark: 'line', title: 'Step line', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key("date")
  .where({ ticker: "AAPL" })
  .curve("curveStep")
  .strokeWidth(2);`
  },
  {
    id: 'smooth-line', mark: 'line', title: 'Smoothed line', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker")
  .curve("curveMonotoneX");`
  },
  {
    id: 'weekly-mean-line', mark: 'line', title: 'Aggregated line', data: STOCKS,
    code: `const chart = line(rows)
  .x("week", { title: "Week" })
  .y("close", { title: "Mean close (USD)", format: "$.2f" })
  .where({ ticker: "AAPL" })
  .rollup({ op: "mean" })
  .pointSize(4);`
  },
  {
    id: 'log-line', mark: 'line', title: 'Log-scale line', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("volume", { title: "Volume", scale: { type: "log", base: 2 } })
  .key("date")
  .where({ ticker: "AAPL" });`
  },
  {
    id: 'highlighted-line', mark: 'line', title: 'Highlighted series', data: STOCKS,
    code: `const chart = line(rows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker")
  .highlight({ ticker: "AAPL" }, { opacity: 0.15 });`
  },

  // Area -----------------------------------------------------------------
  {
    id: 'area', mark: 'area', title: 'Area chart', data: INDUSTRIES,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key("date")
  .where({ industry: "Manufacturing" });`
  },
  {
    id: 'baseline-area', mark: 'area', title: 'Area with a baseline', data: INDUSTRIES,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key("date")
  .where({ industry: "Manufacturing" })
  .baseline(1000);`
  },
  {
    id: 'step-area', mark: 'area', title: 'Stepped area', data: INDUSTRIES,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key("date")
  .where({ industry: "Construction" })
  .curve("curveStep");`
  },
  {
    id: 'stacked-area', mark: 'area', title: 'Stacked area chart', data: INDUSTRIES,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");`
  },
  {
    id: 'many-layer-area', mark: 'area', title: 'Stacked area, many layers', data: UNEMPLOYMENT,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "~s" })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry");`
  },
  {
    id: 'normalized-area', mark: 'area', title: 'Normalized stacked area', data: UNEMPLOYMENT,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Share of unemployed" })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry")
  .layout("stream", { offset: "expand", order: "none" });`
  },
  {
    id: 'streamgraph', mark: 'area', title: 'Streamgraph', data: UNEMPLOYMENT,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "~s" })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry")
  .layout("stream");`
  },
  {
    id: 'smooth-stream', mark: 'area', title: 'Smoothed streamgraph', data: INDUSTRIES,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key(["date", "industry"])
  .breakdown("industry")
  .color("industry")
  .layout("stream", { offset: "silhouette" })
  .curve("curveBasis");`
  },
  {
    id: 'highlighted-range', mark: 'area', title: 'Highlighted range', data: INDUSTRIES,
    code: `const chart = area(rows)
  .x("date", { title: "Date" })
  .y("unemployed", { title: "Unemployed (thousands)", format: "," })
  .key("date")
  .where({ industry: "Manufacturing" })
  .highlight({ field: "date", gte: new Date("2008-09-01"), lt: new Date("2009-07-01") });`
  },

  // Point ----------------------------------------------------------------
  {
    id: 'scatterplot', mark: 'point', title: 'Scatterplot', data: CARS,
    code: `const chart = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name");`
  },
  {
    id: 'categorical-scatterplot', mark: 'point', title: 'Categorical scatterplot', data: IRIS,
    code: `const chart = point(rows)
  .x("petalLength", { title: "Petal length" })
  .y("petalWidth", { title: "Petal width" })
  .key("flowerId")
  .color("species");`
  },
  {
    id: 'bubble-chart', mark: 'point', title: 'Bubble chart', data: CARS,
    code: `const chart = point(rows)
  .x("wt", { title: "Weight (1000 lb)" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .size("hp", { range: [4, 18] })
  .color("cyl", { type: "nominal" });`
  },
  {
    id: 'dot-plot', mark: 'point', title: 'Dot plot', data: POPULATION,
    code: `const chart = point(rows)
  .x("population", { title: "Residents under 10", format: "~s" })
  .y("state")
  .key(["state", "age"])
  .where({ age: "<10" })
  .where({ field: "state", oneOf: ${FEATURE_STATES} });`
  },
  {
    id: 'lollipop', mark: 'point', title: 'Lollipop chart', data: POPULATION,
    code: `const chart = point(rows)
  .x("state")
  .y("population", { title: "Residents under 10", format: "~s" })
  .key(["state", "age"])
  .where({ age: "<10" })
  .where({ field: "state", oneOf: ${FEATURE_STATES} })
  .connector({ from: 0 });`
  },
  {
    id: 'dumbbell', mark: 'point', title: 'Dumbbell chart', data: POPULATION,
    code: `const chart = point(rows)
  .x("population", { title: "Residents", format: "~s" })
  .y("state")
  .key(["state", "age"])
  .where({ field: "age", oneOf: ["<10", "≥80"] })
  .where({ field: "state", oneOf: ${FEATURE_STATES} })
  .color("age", { domain: ["<10", "≥80"] })
  .connector({ by: "state" });`
  },
  {
    id: 'strip-plot', mark: 'point', title: 'Strip plot', data: IRIS,
    code: `const chart = point(rows)
  .x("sepalLength", { title: "Sepal length" })
  .y("species")
  .key("flowerId")
  .color("species")
  .radius(4);`
  },
  {
    id: 'aggregated-points', mark: 'point', title: 'Aggregated points', data: CARS,
    code: `const chart = point(rows)
  .x("wt", { title: "Mean weight" })
  .y("mpg", { title: "Mean mpg" })
  .key("name")
  .color("cyl", { type: "nominal" })
  .rollup("cyl", {
    key: "cyl",
    x: { op: "mean" },
    y: { op: "mean" },
    size: { op: "count", range: [8, 26] }
  });`
  },
  {
    id: 'highlighted-points', mark: 'point', title: 'Highlighted points', data: CARS,
    code: `const chart = point(rows)
  .x("hp", { title: "Horsepower" })
  .y("mpg", { title: "Miles per gallon" })
  .key("name")
  .highlight({ cyl: 4 }, { opacity: 0.12 });`
  },

  // Unit -----------------------------------------------------------------
  {
    id: 'unit-grid', mark: 'unit', title: 'Unit chart', data: IRIS,
    code: `const chart = unit(rows)
  .key("flowerId")
  .color("species")
  .layout("grid", { columns: 15, radius: 6 });`
  },
  {
    id: 'unit-bars', mark: 'unit', title: 'Unit bar chart', data: IRIS,
    code: `const chart = unit(rows)
  .key("flowerId")
  .color("species")
  .group("species")
  .layout("bar", { columns: 10 });`
  },
  {
    id: 'beeswarm', mark: 'unit', title: 'Beeswarm', data: IRIS,
    code: `const chart = unit(rows)
  .key("flowerId")
  .color("species")
  .x("petalLength", { title: "Petal length" })
  .layout("beeswarm");`
  },
  {
    id: 'force-clusters', mark: 'unit', title: 'Force-clustered units', data: IRIS,
    code: `const chart = unit(rows)
  .key("flowerId")
  .color("species")
  .x("species")
  .layout("force");`
  },
  {
    id: 'quantity-units', mark: 'unit', title: 'Quantity units', data: CARS,
    code: `const chart = unit(rows)
  .key("name")
  .value("hp", { unitValue: 50, maxUnits: 200 })
  .group("cyl")
  .color("cyl", { type: "nominal" })
  .layout("bar", { columns: 6, radius: 5 });`
  },
  {
    id: 'highlighted-units', mark: 'unit', title: 'Highlighted units', data: IRIS,
    code: `const chart = unit(rows)
  .key("flowerId")
  .layout("grid", { columns: 25, radius: 5 })
  .highlight({ species: "virginica" }, { opacity: 0.12 });`
  }
];

export function findIdiom(id) {
  return idioms.find(idiom => idiom.id === id) ?? null;
}

export function datasetName(url) {
  return url.split('/').at(-1).replace(/\.csv$/, '');
}
