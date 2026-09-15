// Keep these pairs aligned with tests/browser/line-lab.spec.mjs.
const stockData = `const sampleSize = 24;
const stockRows = await d3.csv("./data/stock.csv", d3.autoType);
const aaplRows = stockRows
  .filter((row) => row.ticker === "AAPL")
  .slice(-sampleSize);
const googRows = stockRows
  .filter((row) => row.ticker === "GOOG")
  .slice(-sampleSize);`;

const base = `${stockData}

const base = line(aaplRows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key("date")
  .tooltip(["date", "ticker", "open", "high", "low", "close", "volume"]);`;

const timeGrain = `${base}

const weeklyRows = Array.from(
  d3.group(
    aaplRows,
    (row) => d3.utcMonday.floor(row.date).getTime()
  ).values(),
  (rows) => ({
    ...rows.at(-1),
    open: rows[0].open,
    high: d3.max(rows, (row) => row.high),
    low: d3.min(rows, (row) => row.low),
    close: rows.at(-1).close,
    volume: d3.sum(rows, (row) => row.volume)
  })
);

const weekly = base.data(weeklyRows);`;

const series = `${stockData}

const companyRows = [...aaplRows, ...googRows];
const detailed = line(companyRows)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key(["date", "ticker"])
  .breakdown("ticker", {
    color: ["#1c6ae4", "#fa4d1d"]
  });

const average = detailed.rollup({ op: "mean" });`;

const filtered = `${base}

const filtered = base
  .where({ field: "volume", lt: 70000000 })
  .connect("adjacent");`;

const added = `${stockData}

const aaplWithLatest = stockRows
  .filter((row) => row.ticker === "AAPL")
  .slice(-(sampleSize + 1));
const beforeLatest = aaplWithLatest.slice(0, -1);

const base = line(beforeLatest)
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key("date")
  .tooltip(["date", "ticker", "open", "high", "low", "close", "volume"]);

const withLatest = base.data(aaplWithLatest);`;

const slidingWindow = `${stockData}

const windowSize = 12;
const windowRows = stockRows
  .filter((row) => row.ticker === "AAPL")
  .slice(-(windowSize + 1));

const firstWindow = line(windowRows.slice(0, windowSize))
  .x("date", { title: "Date" })
  .y("close", { title: "Close (USD)", format: "$.2f" })
  .key("date")
  .curve("curveMonotoneX")
  .transition({ duration: 900, ease: "linear" });

const nextWindow = firstWindow.data(windowRows.slice(1));`;

function sample(id, label, description, setup, from, to) {
  return { id, label, description, code: `${setup}\n\nconst from = ${from};\nconst to = ${to};\n\nreturn { from, to };` };
}

export const chart = 'line';
export async function loadChart() {
  return (await import('../../dist/line.js')).line;
}

export const scenarios = [
  sample('x', '01 · Daily → weekly', 'Keep time on x and summarize daily AAPL observations into weekly OHLC rows represented by each week\'s final trading date.', timeGrain, 'base', 'weekly'),
  sample('y', '02 · Change y field', 'Keep the trading dates and change the AAPL measure from close to high.', base, 'base', 'base.y("high", { title: "High (USD)", format: "$.2f" })'),
  sample('xy', '03 · Daily close → weekly high', 'Keep time on x while changing both temporal grain and measure: daily closes become weekly highs.', timeGrain, 'base', 'weekly.y("high", { title: "High (USD)", format: "$.2f" })'),
  sample('filter', '04 · Filter observations', 'Remove AAPL high-volume days: points disappear first, then their connecting line retracts and leaves an honest gap.', filtered, 'base', 'filtered'),
  sample('restore', '05 · Restore observations', 'Restore the same AAPL days in exact reverse: the line reaches each observation before its point appears.', filtered, 'filtered', 'base'),
  sample('add', '06 · Add an observation', 'Extend the AAPL line to the latest trading day first, then reveal its point.', added, 'base', 'withLatest'),
  sample('remove', '07 · Remove an observation', 'Remove the latest AAPL trading day in exact reverse: hide the point first, then retract the line.', added, 'withLatest', 'base'),
  sample('data', '08 · Replace the data', 'Keep the same dates and close-price mapping, but move from AAPL observations to GOOG observations.', base, 'base', 'base.data(googRows)'),
  sample('highlight', '09 · Highlight one series', 'Keep both company lines and dim GOOG without filtering it out.', series, 'detailed', 'detailed.highlight({ ticker: "AAPL" }, { opacity: 0.12 })'),
  sample('color', '10 · Change line color', 'Change a constant color without changing AAPL data or position.', base, 'base.color("#1c6ae4")', 'base.color("#fa4d1d")'),
  sample('style', '11 · Change line style', 'Change the D3 curve, line width, and point size as one visual state change.', base, 'base.curve("curveLinear").strokeWidth(2).pointSize(3)', 'base.curve("curveStep").strokeWidth(6).pointSize(7)'),
  sample('flip', '12 · Flip orientation', 'Move AAPL close from a vertical value axis to a horizontal value axis, changing x before y.', base, 'base', 'base.flip({ order: ["x", "y"] })'),
  sample('split', '13 · Split into company lines', 'Release AAPL and GOOG from the mean reference like a zipper, then remove the reference once both company lines are readable.', series, 'average', 'detailed'),
  sample('merge', '14 · Merge into an average', 'Grow the mean as a thin dashed reference, zip AAPL and GOOG onto it, then snap the coincident paths into one line.', series, 'detailed', 'average'),
  sample('shift', '15 · Shift the time window', 'Remove the leaving AAPL day, move the shared observations, extend the line, then reveal the entering day.', slidingWindow, 'firstWindow', 'nextWindow'),
  sample('focus', '16 · Focus the view', 'Keep every AAPL observation and the full line, but fit the view around days whose close is at least $325.', base, 'base', 'base.focus({ field: "close", gte: 325 })')
];
