import { transitionScenario } from '../scenario.js';

// Keep these pairs aligned with tests/browser/line-lab.spec.mjs.
const base = `const DATA_URL = "./data/line-lab.csv";

const stocks = line({ url: DATA_URL })
  .x("date")
  .y("close");

const base = stocks
  .where({ ticker: "AAPL" });`;

const timeGrain = `${base}

const weekly = base
  .x("week", { title: "Week" })
  .key("week")
  .rollup({ op: "mean" });

const weeklyHigh = base
  .x("week", { title: "Week" })
  .y("high", { title: "Weekly high (USD)", format: "$.2f" })
  .key("week")
  .rollup({ op: "max" });`;

const series = `const DATA_URL = "./data/line-lab.csv";

const detailed = line({ url: DATA_URL })
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker")
  .color("ticker");

const average = detailed.rollup({ op: "mean" });`;

const filtered = `${base}

const filtered = base
  .where({ field: "volume", lt: 70000000 })
  .connect("adjacent");`;

const added = `${base}

const withoutLatest = base.where({ field: "date", lt: new Date("2026-08-07") });
const withLatest = base;`;

const slidingWindow = `${base}

const firstWindow = base
  .where({ field: "date", gte: new Date("2026-07-22"), lt: new Date("2026-08-07") })
  .curve("curveMonotoneX");

const nextWindow = base
  .where({ field: "date", gte: new Date("2026-07-23") })
  .curve("curveMonotoneX");`;

const volumeScale = `${base}

const volume = base.y("volume");`;

const sampleCategories = {
  x: 'grain', y: 'encoding', xy: 'grain', filter: 'data', restore: 'data',
  add: 'data', remove: 'data', data: 'data', highlight: 'attention',
  color: 'appearance', style: 'appearance', log: 'coordinate', split: 'grain',
  merge: 'grain', shift: 'data', focus: 'attention'
};

function sample(id, label, description, setup, from, to) {
  return transitionScenario({ id, category: sampleCategories[id], label, description, setup, from, to });
}

export const chart = 'line';
export async function loadChart() {
  return (await import('../../dist/line.js')).line;
}

export const scenarios = [
  sample('x', '01 · Daily → weekly', 'Change AAPL from daily closes to one mean close per week.', timeGrain, 'base', 'weekly'),
  sample('y', '02 · Change y field', 'Keep the trading dates and change the AAPL measure from close to high.', base, 'base', 'base.y("high")'),
  sample('xy', '03 · Daily close → weekly high', 'Change both temporal grain and measure: daily closes become each week\'s maximum high.', timeGrain, 'base', 'weeklyHigh'),
  sample('filter', '04 · Filter observations', 'Remove AAPL high-volume days: points disappear first, then their connecting line retracts and leaves an honest gap.', filtered, 'base', 'filtered'),
  sample('restore', '05 · Restore observations', 'Restore the same AAPL days in exact reverse: the line reaches each observation before its point appears.', filtered, 'filtered', 'base'),
  sample('add', '06 · Add an observation', 'Extend the AAPL line to the latest trading day first, then reveal its point.', added, 'withoutLatest', 'withLatest'),
  sample('remove', '07 · Remove an observation', 'Remove the latest AAPL trading day in exact reverse: hide the point first, then retract the line.', added, 'withLatest', 'withoutLatest'),
  sample('data', '08 · Replace the data', 'Keep the same dates and close-price mapping, but move from AAPL observations to GOOG observations.', base, 'base', 'stocks.where({ ticker: "GOOG" })'),
  sample('highlight', '09 · Highlight one series', 'Keep both company lines and dim GOOG without filtering it out.', series, 'detailed', 'detailed.highlight({ ticker: "AAPL" }, { opacity: 0.12 })'),
  sample('color', '10 · Change line color', 'Change a constant color without changing AAPL data or position.', base, 'base.color("#1c6ae4")', 'base.color("#fa4d1d")'),
  sample('style', '11 · Change line style', 'Change the D3 curve, line width, and point size as one visual state change.', base, 'base.curve("curveLinear").strokeWidth(2).pointSize(3)', 'base.curve("curveStep").strokeWidth(6).pointSize(7)'),
  sample('log', '12 · Linear → log₂ scale', 'Keep AAPL trading volume on y and change only how that measure is positioned: from a linear scale to a base-2 logarithmic scale.', volumeScale, 'volume', 'volume.y("volume", { scale: { type: "log", base: 2 } })'),
  sample('split', '13 · Split into company lines', 'Release AAPL and GOOG from the mean reference like a zipper, then remove the reference once both company lines are readable.', series, 'average', 'detailed'),
  sample('merge', '14 · Merge into an average', 'Grow the mean as a thin dashed reference, zip AAPL and GOOG onto it, then snap the coincident paths into one line.', series, 'detailed', 'average'),
  sample('shift', '15 · Shift the time window', 'Remove the leaving AAPL day, move the shared observations, extend the line, then reveal the entering day.', slidingWindow, 'firstWindow', 'nextWindow'),
  sample('focus', '16 · Focus the view', 'Keep every AAPL observation and the full line, but fit the view around days whose close is at least $325.', base, 'base', 'base.focus({ field: "close", gte: 325 })')
];
