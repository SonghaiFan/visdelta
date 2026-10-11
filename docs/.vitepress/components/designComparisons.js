// Original illustrative data and runnable VisDelta states, inspired by the linked
// Academy articles. These are contextual choices, not automatic validity rules.
const academy = 'https://www.datawrapper.de/academy/';
export const comparisonGuides = [
  { id: 'baseline', title: 'Bar baselines', url: academy + 'why-our-column-and-bar-charts-start-at-zero' },
  { id: 'stack', title: 'Stacked columns', url: academy + 'what-to-consider-when-creating-stacked-column-charts' },
  { id: 'line', title: 'Lines', url: academy + 'what-to-consider-when-creating-line-charts' },
  { id: 'area', title: 'Areas', url: academy + 'what-to-consider-when-creating-area-charts' },
  { id: 'dot', title: 'Dots and ranges', url: academy + 'examples-of-datawrapper-dot-charts' },
  { id: 'pie', title: 'Pie alternatives', url: academy + 'what-to-consider-when-creating-a-pie-chart' }
];
// Summaries in our own words, not quotations from the linked articles.
export const guideExplanations = {
  baseline: {
    why: 'Readers compare bars by length. Cutting off the baseline makes a small numerical difference occupy a much larger fraction of the visible bar, exaggerating relative magnitudes. Dots encode position instead of filled length; a focused scale can therefore reveal small differences without implying the same length ratio.',
    context: 'For a time trend, use a line with meaningful ordering. If change itself is the message, derive and label the change measure explicitly rather than clipping absolute values.',
    detection: 'VisDelta warns when an explicit bar measure domain excludes zero after scale nicing. It preserves the domain and renders the chart.'
  },
  stack: {
    why: 'A stack makes totals easy to see, but middle components start at different heights. Comparing those components requires judging thickness rather than aligned endpoints. Equal category slots also hide unequal time gaps. Many columns and long labels compete for limited screen width.',
    context: 'Stacks remain useful for totals and a component at the baseline. Use shared-scale panels for comparing every part, lines for crossovers, and continuous time positions for irregular dates. Include components only: adding their total as another segment double-counts the amount. Grouping small parts is an editorial choice that should preserve the total.',
    detection: 'VisDelta warns above 10 vertical stacked columns and for excessive color categories. It cannot infer which component matters, whether parts exhaust a whole, or whether an ordinal label denotes a date. Those examples require manual review.'
  },
  line: {
    why: 'A connecting line suggests meaningful order and values between observations; arbitrary category names do not establish either. Smooth interpolation can suggest peaks or dips that were never observed. Equal emphasis on every series can make a particular comparison harder to follow.',
    context: 'Lines suit trends, including irregular time intervals. Markers reveal actual observations. A focused vertical scale can be appropriate: lines do not always need zero. Context, highlights and explanatory notes should follow the intended message, rather than an automatic rule.',
    detection: 'VisDelta detects nominal connections, natural/cardinal smoothing with at least three observations in a series, and high series/color counts. It does not infer missing context, causal events, percentage semantics or which series deserves emphasis.'
  },
  area: {
    why: 'Filled areas emphasize magnitude and, when stacked, the combined total. Interior layers move with the layers beneath them, making their own changes and crossovers harder to compare. A nonzero fill baseline shows distance from a threshold, which readers may mistake for the full quantity.',
    context: 'Use lines when individual trends or small differences matter most. Sparse, regularly spaced observations may be clearer as columns; irregular dates still need true temporal spacing, even with few observations. A threshold band can be intentional if its meaning is explained.',
    detection: 'VisDelta detects nonzero single-area baselines, negative layered values, nominal connections, risky smoothing and high layer/color counts. It does not automatically reject sparse data, reorder for inferred importance, or combine minor layers.'
  },
  dot: {
    why: 'Dots support comparisons on a common positional scale without relying on bar length. With many dots in one category, matching each point to its identity becomes harder. A connector can make the gap between a pair more apparent.',
    context: 'Datawrapper’s companion dot-plot tutorial recommends at most three dots per row, while allowing four or five in suitable cases. A range emphasizes a gap; the choice depends on the reading goal. The examples guide illustrates these alternatives rather than defining universal errors.',
    detection: 'VisDelta warns when a category has more than three finite observations on a categorical–quantitative Point chart. It excludes summary/detail views and does not apply this count to quantitative scatterplots.',
    additionalUrl: academy + 'how-to-create-a-dot-plot'
  },
  pie: {
    why: 'Similar angles are difficult to compare precisely. More slices also create more boundaries, colors and labels to track. Separate pies lack the shared aligned endpoints available in bars, which makes comparing components across totals harder.',
    context: 'A few familiar proportions can work well in a pie. For one message, text may suffice; for precise comparisons, consider bars. Outside labels can identify small slices, and explicitly grouping minor parts may simplify the display without losing quantity.',
    detection: 'VisDelta warns above four slices, following the Academy guide, and suggests text for one or two slices. These are contextual suggestions, not proof of a bad chart. It cannot infer completeness, the need for precision or label collisions.'
  }
};
const palette = ['#176078', '#19a4c5', '#2ce5b4', '#00b69e'];
const parts = ['Core', 'Growth', 'Services', 'Support'];
const matrix = [[90, 20, 10, 30], [80, 30, 20, 40], [70, 20, 15, 50], [80, 40, 10, 30]];
const regions = ['North', 'South', 'East', 'West'];
const totals = matrix.map((values, i) => ({ label: regions[i], year: 2020 + i, value: values.reduce((a, b) => a + b, 0) }));
const stacked = matrix.flatMap((values, i) => values.map((value, j) => ({ label: regions[i], year: 2020 + i, part: parts[j], value })));
const dense = Array.from({ length: 16 }, (_, i) => ({ year: 2008 + i, label: String(2008 + i), part: parts[0], value: 65 + i * 2 + Math.sin(i) * 12 })).flatMap(row => parts.map((part, j) => ({ ...row, part, value: row.value / (j + 1) })));
const irregular = stacked.map(row => ({ ...row, year: [2020, 2021, 2025, 2030][row.year - 2020], label: String([2020, 2021, 2025, 2030][row.year - 2020]) }));
const colors = `.color("part", { domain: ${JSON.stringify(parts)}, range: ${JSON.stringify(palette)} })`;
const bars = (extra = '', x = 'label') => `const chart = bar(rows)\n  .x("${x}", { type: "ordinal" })\n  .y("value", { title: "Units" })\n  .key(["${x}", "part"])\n  .breakdown("part")\n  ${colors}${extra};`;
const connected = (mark, extra = '') => `const chart = ${mark}(rows)\n  .x("year", { title: "Year" })\n  .y("value", { title: "Units" })\n  .key(["year", "part"])\n  .breakdown("part")\n  ${colors}${extra};`;
const plain = (mark, extra = '') => `const chart = ${mark}(rows)\n  .x("label", { type: "ordinal" })\n  .y("value", { title: "Units" })\n  .key("label")${extra};`;
const single = (mark, extra = '') => `const chart = ${mark}(rows)\n  .x("year", { title: "Year" })\n  .y("value", { title: "Units" })\n  .key("year")${extra};`;
const view = (mark, code, caption, options = {}) => ({ charts: [{ mark, code }], caption, ...options });
const small = () => ({ caption: 'One chart; one panel per component; shared scales.', height: 480, charts: [{ mark: 'bar',
  code: `const chart = bar(rows)
  .x("label").y("value", { title: "Units" }).key("label")
  ${colors}
  .repeat("part", { direction: "y", scales: "shared", minWidth: 180 });`
}] });
const stories = new Map();
const story = (rows, headline, description, y) => { const told = { headline, description, y }; stories.set(rows, told); return told; };
const byYear = { description: 'Revenue by business line, 2020–2023, € million', y: 'Revenue (€m)' };
// Uneven or long year spans need continuous positions; four even years read as ordinal labels.
const continuousYears = new Set();
function narrate(side, told, continuous) {
  if (!side?.charts) return side;
  return { ...side, charts: side.charts.map(chart => ({ ...chart, code: chart.code
    .replaceAll('title: "Units"', `title: "${told.y}"`)
    // A later .y() replaces the channel options, so a domain-only override keeps the unit title.
    .replace(/\.y\("value", \{ domain: (\[[^\]]*\]) \}\)/g, `.y("value", { title: "${told.y}", domain: $1 })`)
    .replaceAll('.x("year", { title: "Year" })', continuous ? '.x("year", { title: "Year", format: "d" })' : '.x("year", { title: "Year", type: "ordinal" })') })) };
}
const entry = (id, guide, title, why, rows, before, after, override = {}) => {
  const usesYear = [before, after].some(side => side?.charts?.some(chart => chart.code.includes('.x("year"')));
  const base = stories.get(rows) ?? {};
  const { byYear: yearStory, ...plainStory } = base;
  const told = { ...plainStory, ...(usesYear && yearStory ? yearStory : {}), ...override };
  const continuous = continuousYears.has(rows);
  return { id, guide, title, why, rows, story: told, before: narrate(before, told, continuous), after: narrate(after, told, continuous) };
};
const tiny = stacked.flatMap(row => row.part !== 'Support' ? [row] : Array.from({ length: 7 }, (_, i) => ({ ...row, part: `Small ${i + 1}`, value: row.value / 7 })));
const combineTiny = `const grouped = rows.map(row => ({ ...row, part: row.part.startsWith("Small") ? "Others" : row.part }));\n`;
const groupTinyBar = combineTiny + bars().replace('bar(rows)', 'bar(grouped)').replace(colors, '.color("part", { domain: ["Core", "Growth", "Services", "Others"], range: ["#176078", "#19a4c5", "#2ce5b4", "#d8e2e5"] })\n  .rollup(["label", "part"])');
const groupTinyArea = `const cells = new Map();
for (const row of rows) {
  const part = row.part.startsWith("Small") ? "Others" : row.part;
  const key = row.year + "|" + part;
  cells.set(key, { ...row, part, value: (cells.get(key)?.value ?? 0) + row.value });
}
const grouped = [...cells.values()];
` + connected('area').replace('area(rows)', 'area(grouped)').replace(colors, '.color("part", { domain: ["Core", "Growth", "Services", "Others"], range: ["#176078", "#19a4c5", "#2ce5b4", "#d8e2e5"] })');
const focusedColors = '.color("part", { domain: ["Core", "Growth", "Services", "Support"], range: ["#00b69e", "#c9d1d4", "#dce1e3", "#edf0f1"] })';
const sparse = totals.map(row => ({ ...row, value: row.value + 200 }));
const narrow = totals.map((row, i) => ({ ...row, label: String(row.year), value: [96, 98, 97, 99][i] }));
const jagged = [10, 12, 80, 12, 10, 12].map((value, i) => ({ year: 2020 + i, value }));
const ordinal = [{ label: 'Retail', value: 35 }, { label: 'Services', value: 55 }, { label: 'Industry', value: 25 }];
const singlePart = stacked.filter(row => row.label === 'North');
const manyTotals = Array.from({ length: 14 }, (_, i) => parts.slice(0, 2).map((part, j) => ({ label: `District ${i + 1}`, part, value: 30 + (i * 7 + j * 11) % 60 }))).flat();
const longLabels = stacked.map(row => ({ ...row, label: { North: 'Northern metropolitan district', South: 'Southern coastal communities', East: 'Eastern rural municipalities', West: 'Western regional partnerships' }[row.label] }));
const nearZero = totals.map((row, i) => ({ ...row, value: [2, 3, 1, 4][i] }));
const pairs = stacked.filter(row => ['Core', 'Growth'].includes(row.part));
const profit = [{ label: 'North', value: 12 }, { label: 'South', value: -4 }, { label: 'East', value: 7 }, { label: 'West', value: -9 }];
const areas = ['Coast', 'Valley', 'Highlands', 'Lakes', 'Plains', 'Forest', 'Delta', 'Islands'];
const satisfaction = areas.map((label, i) => ({ label, value: [64, 71, 58, 77, 69, 73, 61, 66][i] }));
const temperatures = [['Coast', 4, 19], ['Valley', -3, 26], ['Highlands', -8, 17], ['Plains', -5, 28], ['Islands', 7, 18]]
  .flatMap(([label, low, high]) => [{ label, bound: 'Lowest', value: low }, { label, bound: 'Highest', value: high }]);
const survey = [{ part: 'Price', value: 62 }, { part: 'Quality', value: 48 }, { part: 'Delivery', value: 35 }, { part: 'Support', value: 20 }];

// Our own illustrative stories. Both sides of a pair tell the same story in two forms.
story(totals, 'South earns the most revenue', 'Total revenue by region, € million', 'Revenue (€m)').byYear = { headline: 'Revenue peaked in 2021', description: 'Total revenue, 2020–2023, € million' };
story(stacked, 'Core leads revenue in every region', 'Revenue by region and business line, € million', 'Revenue (€m)');
stories.get(stacked).byYear = { headline: 'Growth overtook Support in 2023', ...byYear };
story(irregular, 'Core remains the largest line through 2030', 'Revenue by business line in surveyed years, € million', 'Revenue (€m)');
story(dense, 'All four lines follow the same cycle', 'Revenue by business line, 2008–2023, € million', 'Revenue (€m)');
story(tiny, 'Four lines earn most of the revenue', 'Revenue by business line; Support is split into seven small units, € million', 'Revenue (€m)');
stories.get(tiny).byYear = { headline: 'Four lines earn most of the revenue', ...byYear };
story(narrow, 'Broadband reached 99% of households', 'Share of households with a broadband connection, 2020–2023', 'Households (%)');
story(sparse, 'Revenue held steady around €360 million', 'Total revenue, 2020–2023, € million', 'Revenue (€m)');
story(jagged, 'Visitors spiked once, in 2022', 'Visitors per year, thousands', 'Visitors (thousands)');
story(ordinal, 'Services employ the most people', 'Employment by sector, thousands', 'Employees (thousands)');
story(nearZero, 'Inflation never rose above 4%', 'Annual inflation rate, 2020–2023', 'Inflation (%)');
story(singlePart, 'Core earns 60% of the North’s revenue', 'Revenue by business line, North region, € million', 'Revenue (€m)');
story(manyTotals, 'Revenue differs widely between districts', 'Revenue by district and business line, € million', 'Revenue (€m)');
story(longLabels, 'Core leads in every district', 'Revenue by district and business line, € million', 'Revenue (€m)');
story(pairs, 'Core out-earns Growth in every region', 'Revenue of two business lines by region, € million', 'Revenue (€m)');
story(profit, 'Two regions made a loss in 2023', 'Operating profit by region, 2023, € million', 'Profit (€m)');
story(satisfaction, 'Lakes residents are the most satisfied', 'Average satisfaction score by area, 0–100', 'Score');
story(temperatures, 'Island temperatures vary the least', 'Lowest and highest monthly mean temperature by area, °C', 'Temperature (°C)');
story(survey, 'Price matters to most customers', 'Share of respondents naming each factor; several answers allowed', 'Respondents (%)');
continuousYears.add(irregular).add(dense);

export const designComparisons = [
  entry('bar-zero', 'baseline', 'Preserve the magnitude', 'A filled length needs zero.', narrow,
    view('bar', plain('bar', '\n  .y("value", { domain: [95, 100] })'), 'Truncated baseline'), view('bar', plain('bar', '\n  .y("value", { domain: [0, 100] })'), 'Full magnitudes')),
  entry('bar-negative', 'baseline', 'Keep losses below zero', 'Bars start at zero, or below it when values are negative.', profit,
    view('bar', plain('bar', '\n  .y("value", { domain: [0, 15] })'), 'Floor at zero hides the losses'), view('bar', plain('bar'), 'Losses extend below the baseline')),
  entry('bar-dots', 'baseline', 'Inspect small differences', 'Dots allow a focused positional scale.', narrow,
    view('bar', plain('bar', '\n  .y("value", { domain: [95, 100] })'), 'Truncated bars'), view('point', plain('point', '\n  .y("value", { domain: [95, 100] })'), 'Focused dots')),
  entry('bar-trend', 'baseline', 'Follow an ordered trend', 'Use position when changes matter.', narrow,
    view('bar', plain('bar', '\n  .y("value", { domain: [95, 100] })'), 'Bars with clipped magnitudes'), view('line', single('line', '\n  .y("value", { domain: [95, 100] })\n  .pointSize(4)'), 'Ordered annual values')),
  entry('bar-change', 'baseline', 'Show change explicitly', 'Label the newly derived measure.', narrow,
    view('bar', plain('bar', '\n  .y("value", { domain: [95, 100] })'), 'Absolute values, clipped'), view('bar', 'const changes = rows.slice(1).map((row, i) => ({ ...row, change: row.value - rows[i].value }));\nconst domain = [Math.min(0, ...changes.map(row => row.change)), Math.max(0, ...changes.map(row => row.change))];\nconst chart = bar(changes).x("label").y("change", { title: "Annual change (units)", domain }).key("label");', 'Year-to-year differences')),
  entry('stack-components', 'stack', 'Compare every component', 'Give each component a shared baseline.', stacked,
    view('bar', bars(), 'Middle segments float'), small()),
  entry('stack-trends', 'stack', 'Read component trends', 'Use lines when totals are secondary.', stacked,
    view('bar', bars('', 'year'), 'Totals dominate'), view('line', connected('line', '\n  .pointSize(3)'), 'Each component has a trace')),
  entry('stack-irregular', 'stack', 'Preserve elapsed time', 'Continuous position retains unequal intervals.', irregular,
    view('bar', bars(), 'Equal-width slots'), view('area', connected('area'), 'True spacing between years')),
  entry('stack-crossover', 'stack', 'Find a crossover', 'Compare two traces directly.', stacked,
    view('bar', bars('', 'year'), 'Floating components'), view('line', connected('line', '\n  .where({ field: "part", oneOf: ["Growth", "Support"] })\n  .pointSize(4)'), 'Only the two relevant components')),
  entry('stack-one-total', 'stack', 'Compare parts of one total', 'Separate bars support direct comparison.', singlePart,
    view('bar', bars(), 'One stacked total'), view('bar', 'const chart = bar(rows).x("part").y("value", { title: "Units" }).key("part").flip();', 'One bar per component')),
  entry('stack-one-share', 'stack', 'Communicate one share', 'A stated percentage can suffice.', singlePart,
    view('bar', bars(), 'More chart than message'), { caption: 'Core accounts for 60% of this total.', text: '60%', detail: '90 of 150 units belong to Core.' }),
  entry('stack-many-totals', 'stack', 'Allow room for many totals', 'Rows give categories vertical space.', manyTotals,
    view('bar', bars(), 'Crowded columns'), view('bar', bars('\n  .flip()'), 'One horizontal row per total', { height: 490 })),
  entry('stack-long-labels', 'stack', 'Keep long labels readable', 'Horizontal categories make room for names.', longLabels,
    view('bar', bars(), 'Narrow label slots'), view('bar', bars('\n  .flip()'), 'Labels beside each total')),
  entry('stack-important', 'stack', 'Anchor the focus component', 'The bottom supports comparisons.', stacked,
    view('bar', bars().replace(JSON.stringify(parts), JSON.stringify(['Growth', 'Services', 'Core', 'Support'])), 'Core in the middle'), view('bar', bars().replace(colors, focusedColors), 'Core at zero, highlighted')),
  entry('stack-shares', 'stack', 'Compare relative composition', 'Normalize deliberately when shares matter.', stacked,
    view('bar', bars(), 'Absolute totals differ'), view('bar', 'const percentages = rows.map(row => ({ ...row, value: 100 * row.value / rows.filter(r => r.label === row.label).reduce((sum, r) => sum + r.value, 0) }));\n' + bars().replace('bar(rows)', 'bar(percentages)').replace('title: "Units"', 'title: "Share (%)"'), 'Every total is 100%')),
  entry('stack-total-duplicate', 'stack', 'Stack only components', 'Adding totals double-counts the quantity.', stacked,
    view('bar', 'const withTotals = rows.concat([...new Set(rows.map(row => row.label))].map(label => ({ label, part: "Total", value: rows.filter(row => row.label === label).reduce((sum, row) => sum + row.value, 0) })));\n' + bars().replace('bar(rows)', 'bar(withTotals)').replace(colors, '.color("part")'), 'Total added as another component'), view('bar', bars(), 'Only mutually exclusive parts')),
  entry('stack-tiny', 'stack', 'Simplify minor components', 'Author an aggregation without losing quantity.', tiny,
    view('bar', bars().replace(colors, '.color("part")'), 'Many tiny categories'), view('bar', groupTinyBar, 'Explicit grouping; Others is lighter')),
  entry('line-categories', 'line', 'Respect the category meaning', 'Unordered names do not imply continuity.', ordinal,
    view('line', plain('line'), 'Arbitrary connections'), view('bar', plain('bar'), 'Independent categories')),
  entry('line-total', 'line', 'Make the combined total visible', 'A stack exposes an additive total.', stacked,
    view('line', connected('line'), 'Only individual trajectories'), view('area', connected('area'), 'Top edge is the combined total')),
  entry('line-period-counts', 'line', 'Compare a few period counts', 'Separate totals can suit discrete periods.', totals,
    view('line', single('line'), 'Implied continuity'), view('bar', plain('bar'), 'Distinct annual totals')),
  entry('line-context', 'line', 'Show comparison context', 'Context gives a trajectory meaning.', stacked,
    view('line', connected('line', '\n  .where({ part: "Growth" })'), 'One isolated trajectory'), view('line', connected('line', '\n  .highlight({ part: "Growth" }, { opacity: 0.18 })'), 'Focus with comparison series')),
  entry('line-focus', 'line', 'Separate focus from context', 'Reduce visual competition.', stacked,
    view('line', connected('line'), 'Equal emphasis'), view('line', connected('line').replace(colors, focusedColors), 'Color emphasis and grey context')),
  entry('line-explanation', 'line', 'Explain a relevant interval', 'A short note identifies the event.', dense,
    view('line', connected('line'), 'No contextual explanation'), view('line', connected('line', '\n  .highlight({ field: "year", gte: 2015, lte: 2019 }, { opacity: 0.2 })'), '2015–2019 highlighted', { detail: 'Illustrative event window: compare trajectories within the highlighted interval.' })),
  entry('line-observations', 'line', 'Reveal irregular observations', 'Symbols distinguish measured dates from interpolation.', irregular,
    view('line', connected('line'), 'No observation symbols'), view('line', connected('line', '\n  .pointSize(4)'), 'Symbols at measured years')),
  entry('line-labels', 'line', 'Check identification on mobile', 'A compact key can remain legible.', stacked,
    view('line', connected('line').replace(colors, '.color("part", { title: "Core / Growth / Services / Support component classifications" })'), 'Long key heading'), view('line', connected('line'), 'Short, stable component names', { detail: 'VisDelta does not currently provide direct endpoint labels. This uses its supported legend.' })),
  entry('line-near-zero', 'line', 'Show nearby zero', 'Include the nearby reference when helpful.', nearZero,
    view('line', single('line', '\n  .y("value", { domain: [1, 4] })'), 'Tight range'), view('line', single('line', '\n  .y("value", { domain: [0, 4] })'), 'Zero is visible')),
  entry('line-near-full', 'line', 'Show nearby 100%', 'Retain the full-scale reference for shares.', narrow,
    view('line', single('line', '\n  .y("value", { domain: [96, 99], title: "Share (%)" })'), 'Missing upper reference'), view('line', single('line', '\n  .y("value", { domain: [95, 100], title: "Share (%)" })'), '100% is visible')),
  entry('line-interpolation', 'line', 'Keep interpolation honest', 'Inspect the curve between observations.', jagged,
    view('line', single('line', '\n  .curve("curveNatural")\n  .pointSize(4)'), 'Natural smoothing'), view('line', single('line', '\n  .curve("curveMonotoneX")\n  .pointSize(4)'), 'Monotone interpolation')),
  entry('area-categories', 'area', 'Avoid filling unrelated categories', 'A category comparison needs independent marks.', ordinal,
    view('area', plain('area'), 'Filled continuity'), view('bar', plain('bar'), 'Category magnitudes')),
  entry('area-total-secondary', 'area', 'Prioritize individual trends', 'Lines suit a secondary combined total.', stacked,
    view('area', connected('area'), 'Floating layer positions'), view('line', connected('line'), 'Independent trajectories')),
  entry('area-shares', 'area', 'Show shares that add up to 100%', 'Stacked shares make the whole explicit.', stacked,
    view('line', 'const shares = rows.map(row => ({ ...row, value: 100 * row.value / rows.filter(r => r.year === row.year).reduce((sum, r) => sum + r.value, 0) }));\n' + connected('line').replace('line(rows)', 'line(shares)').replace('title: "Units"', 'title: "Share of revenue (%)"'), 'Separate share lines'),
    view('area', 'const shares = rows.map(row => ({ ...row, value: 100 * row.value / rows.filter(r => r.year === row.year).reduce((sum, r) => sum + r.value, 0) }));\n' + connected('area').replace('area(rows)', 'area(shares)').replace('title: "Units"', 'title: "Share of revenue (%)"'), 'Every year fills to 100%'),
    { headline: 'Core’s share fell from 60% to 50%', description: 'Share of revenue by business line, 2020–2023' }),
  entry('area-small-differences', 'area', 'Reveal small changes', 'A focused line scale can help.', narrow,
    view('area', single('area', '\n  .y("value", { domain: [0, 100] })'), 'Small changes within large fill'), view('line', single('line', '\n  .y("value", { domain: [95, 100] })'), 'Focused positions')),
  entry('area-single', 'area', 'Read one trajectory', 'A line can express a single trend.', sparse,
    view('area', single('area', '\n  .baseline(300)'), 'Nonzero filled baseline'), view('line', single('line', '\n  .y("value", { domain: [300, 400] })'), 'A focused trend')),
  entry('area-few-dates', 'area', 'Compare a few observations', 'Regular, sparse periods allow discrete stacks.', stacked,
    view('area', connected('area'), 'Four interpolated dates'), view('bar', bars('', 'year'), 'Four separate totals')),
  entry('area-crossover', 'area', 'Compare component crossovers', 'A shared positional scale shows crossings.', stacked,
    view('area', connected('area'), 'Floating layers'), view('line', connected('line', '\n  .where({ field: "part", oneOf: ["Growth", "Support"] })'), 'Two relevant traces')),
  entry('area-anchor', 'area', 'Put the focus at the baseline', 'Explicit order can anchor the relevant layer.', stacked,
    view('area', 'const order = ["Growth", "Services", "Core", "Support"];\nconst ordered = rows.slice().sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));\n' + connected('area', '\n  .layout("stream", { offset: "none", order: "none" })').replace('area(rows)', 'area(ordered)'), 'Core inside the stack'), view('area', connected('area').replace(colors, focusedColors), 'Core at the baseline')),
  entry('area-identify', 'area', 'Keep layer identification concise', 'Use stable names and a compact key.', stacked,
    view('area', connected('area').replace(colors, '.color("part", { title: "Long component classification used for the layered composition" })'), 'Long key heading'), view('area', connected('area'), 'Concise identification', { detail: 'Direct in-layer labels are unsupported; the live example uses a legend.' })),
  entry('area-explanation', 'area', 'Explain a period of interest', 'An explicit window guides attention.', dense,
    view('area', connected('area'), 'No context'), view('area', connected('area', '\n  .highlight({ field: "year", gte: 2015, lte: 2019 }, { opacity: 0.2 })'), 'Highlighted interval', { detail: 'Illustrative event window: 2015–2019.' })),
  entry('area-tiny', 'area', 'Aggregate minor layers explicitly', 'Preserve totals while simplifying the key.', tiny,
    view('area', connected('area').replace(colors, '.color("part")'), 'Many thin layers'), view('area', groupTinyArea, 'Author-defined Others; lighter color')),
  entry('area-irregular-exception', 'area', 'Keep uneven intervals visible', 'Few observations can still require continuous spacing.', irregular,
    view('bar', bars(), 'Uniform category spacing'), view('area', connected('area'), 'Actual spacing between years')),
  entry('dot-sorted', 'dot', 'Rank the values', 'Sorting turns a dot plot into a ranking.', satisfaction,
    view('point', 'const chart = point(rows).x("value", { title: "Units", domain: [50, 80] }).y("label").key("label");', 'Unsorted areas'), view('point', 'const chart = point(rows).x("value", { title: "Units", domain: [50, 80] }).y("label").key("label").sort("value", "ascending");', 'Sorted; the highest score on top')),
  entry('dot-range', 'dot', 'Show a spread, not two magnitudes', 'A range plot draws the distance between two values.', temperatures,
    view('bar', 'const chart = bar(rows).x("label").y("value", { title: "Units" }).key(["label", "bound"]).breakdown("bound").color("bound").layout("grouped");', 'Paired bars from zero'), view('point', 'const chart = point(rows).x("value", { title: "Units" }).y("label").key(["label", "bound"]).color("bound").connector({ by: "label" });', 'One range per area')),
  entry('dot-pairs', 'dot', 'Emphasize the paired gap', 'A connector makes the distance explicit.', pairs,
    view('point', 'const chart = point(rows).x("value", { title: "Units" }).y("label").key(["label", "part"]).color("part");', 'Two unconnected dots'), view('point', 'const chart = point(rows).x("value").y("label").key(["label", "part"]).color("part").connector({ by: "label" });', 'A range per category')),
];
const pieCode = (extra = '') => `const chart = pie(rows)
  .value("value")
  .key("part")
  .label("part")
  ${colors}${extra};`;
const pieRows = singlePart.map(row => ({ ...row, value: { Core: 26, Growth: 25, Services: 24, Support: 25 }[row.part] }));
const manyPie = tiny.filter(row => row.label === 'North');
const namedPie = singlePart.map(row => ({ ...row, part: { Core: 'Essential operations', Growth: 'Growth investments', Services: 'Customer services', Support: 'Administrative support' }[row.part] }));
const renewals = [{ part: 'Renewed early', value: 25 }, { part: 'Other customers', value: 75 }];
const coreShare = [{ part: 'Core', value: 90 }, { part: 'Remaining', value: 60 }];
story(renewals, 'One in four customers renewed early', 'Share of customers by renewal timing, %');
story(coreShare, 'Core makes up 60% of revenue', 'Revenue, Core against all other lines, € million');
story(pieRows, 'Revenue is split almost evenly', 'Share of revenue by business line, %');
story(manyPie, 'Four lines earn most of the North’s revenue', 'Revenue by business line, North region; Support split into seven units');
story(namedPie, 'Essential operations is the largest share', 'Revenue by business line, North region');
designComparisons.push(
  entry('pie-exclusive', 'pie', 'Use bars when answers overlap', 'A pie needs parts of one whole; multiple answers exceed 100%.', survey,
    view('pie', 'const chart = pie(rows)\n  .value("value")\n  .key("part")\n  .label("part")\n  .color("part");', 'Slices imply exclusive answers'),
    view('bar', 'const chart = bar(rows).x("part").y("value", { title: "Units", domain: [0, 100] }).key("part").sort("value", "ascending").flip();', 'Each factor against 100%')),
  entry('pie-familiar', 'pie', 'Recognize a familiar proportion', 'Rounded fractions can be recognizable in a pie.', renewals,
    view('pie', pieCode().replace(colors, '.color("part")'), 'A valid familiar proportion', { label: 'Also suitable' }),
    { caption: 'A simpler single-message alternative.', text: '25%', detail: 'One quarter of the total.', label: 'Simpler alternative' }),
  entry('pie-precise', 'pie', 'Compare similar shares', 'Position supports precise comparisons.', pieRows,
    view('pie', pieCode(), 'Similar angles are hard to distinguish'), view('bar', 'const chart = bar(rows).x("part").y("value", { title: "Share (%)" }).key("part").flip();', 'Compare on a common baseline')),
  entry('pie-many', 'pie', 'Handle many components', 'An aligned stack makes a compact alternative.', manyPie,
    view('pie', pieCode().replace(colors, '.color("part")'), 'Ten slices compete for attention'), view('bar', bars('\n  .flip()').replace(colors, '.color("part")'), 'A horizontal total with its components')),
  entry('pie-one-share', 'pie', 'Communicate a single share', 'Text can carry the message directly.', coreShare,
    view('pie', pieCode().replace(colors, '.color("part")'), 'Only one fact to communicate'), { caption: 'State the share.', text: '60%', detail: 'Core: 90 of 150 units.' }),
  entry('pie-multiple', 'pie', 'Compare several totals', 'Aligned stacks compare composition.', stacked,
    { caption: 'Four separate pies', charts: totals.map(row => ({ mark: 'pie', code: pieCode(`\n  .where({ label: "${row.label}" })`) })) }, view('bar', bars('\n  .flip()'), 'One aligned total per row')),
  entry('pie-focus', 'pie', 'Emphasize a component', 'Subdue less relevant components.', singlePart,
    view('pie', pieCode(), 'Equal color emphasis'), view('pie', pieCode().replace(colors, focusedColors), 'Focus and context colors')),
  entry('pie-labels', 'pie', 'Identify small slices', 'Outside labels name components directly.', namedPie,
    view('pie', pieCode('\n  .labels("inside")').replace(colors, '.color("part")'), 'Percentages inside; names in the key'), view('pie', pieCode('\n  .labels("outside")').replace(colors, '.color("part")'), 'Names outside with leaders')),
  entry('pie-tiny', 'pie', 'Combine small components', 'An explicit grouping preserves quantity.', manyPie,
    view('pie', pieCode().replace(colors, '.color("part")'), 'Many tiny sectors'), view('pie', `const cells = new Map();
for (const row of rows) {
  const part = row.part.startsWith("Small") ? "Others" : row.part;
  cells.set(part, { part, value: (cells.get(part)?.value ?? 0) + row.value });
}
const grouped = [...cells.values()];
` + pieCode().replace('pie(rows)', 'pie(grouped)').replace(colors, '.color("part", { domain: ["Core", "Growth", "Services", "Others"], range: ["#176078", "#19a4c5", "#2ce5b4", "#d8e2e5"] })'), 'Minor slices explicitly combined')),
  entry('pie-space', 'pie', 'Use a wide layout efficiently', 'A compact pie can fit beside prose.', singlePart,
    view('pie', pieCode(), 'Pie spanning the available column'), view('pie', pieCode('\n  .labels("inside")'), 'Compact pie alongside the message', { compact: true, detail: 'Core represents 60% of this total. A compact chart leaves room for explanatory text.' }))
);
