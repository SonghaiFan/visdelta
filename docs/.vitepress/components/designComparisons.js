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
const palette = ['#176078', '#19a4c5', '#2ce5b4', '#00b69e'];
const parts = ['Core', 'Growth', 'Services', 'Support'];
const matrix = [[90, 20, 10, 30], [80, 30, 20, 40], [70, 20, 15, 50], [80, 40, 10, 30]];
const totals = matrix.map((values, i) => ({ label: String.fromCharCode(65 + i), year: 2020 + i, value: values.reduce((a, b) => a + b, 0) }));
const stacked = matrix.flatMap((values, i) => values.map((value, j) => ({ label: String.fromCharCode(65 + i), year: 2020 + i, part: parts[j], value })));
const dense = Array.from({ length: 16 }, (_, i) => ({ year: 2008 + i, label: String(2008 + i), part: parts[0], value: 65 + i * 2 + Math.sin(i) * 12 })).flatMap(row => parts.map((part, j) => ({ ...row, part, value: row.value / (j + 1) })));
const irregular = stacked.map(row => ({ ...row, year: [2020, 2021, 2025, 2030][row.year - 2020], label: String([2020, 2021, 2025, 2030][row.year - 2020]) }));
const colors = `.color("part", { domain: ${JSON.stringify(parts)}, range: ${JSON.stringify(palette)} })`;
const bars = (extra = '', x = 'label') => `const chart = bar(rows)\n  .x("${x}", { type: "ordinal" })\n  .y("value", { title: "Units" })\n  .key(["${x}", "part"])\n  .breakdown("part")\n  ${colors}${extra};`;
const connected = (mark, extra = '') => `const chart = ${mark}(rows)\n  .x("year", { title: "Year" })\n  .y("value", { title: "Units" })\n  .key(["year", "part"])\n  .breakdown("part")\n  ${colors}${extra};`;
const plain = (mark, extra = '') => `const chart = ${mark}(rows)\n  .x("label")\n  .y("value", { title: "Units" })\n  .key("label")${extra};`;
const single = (mark, extra = '') => `const chart = ${mark}(rows)\n  .x("year", { title: "Year" })\n  .y("value", { title: "Units" })\n  .key("year")${extra};`;
const view = (mark, code, caption, options = {}) => ({ charts: [{ mark, code }], caption, ...options });
const small = () => ({ caption: 'One chart; one panel per component; shared scales.', height: 480, charts: [{ mark: 'bar',
  code: `const chart = bar(rows)
  .x("label").y("value", { title: "Units" }).key("label")
  ${colors}
  .repeat("part", { direction: "y", scales: "shared", minWidth: 180 });`
}] });
const entry = (id, guide, title, why, rows, before, after) => ({ id, guide, title, why, rows, before, after });
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
const narrow = totals.map((row, i) => ({ ...row, value: [96, 98, 97, 99][i] }));
const jagged = [10, 12, 80, 12, 10, 12].map((value, i) => ({ year: 2020 + i, value }));
const ordinal = [{ label: 'Retail', value: 35 }, { label: 'Services', value: 55 }, { label: 'Industry', value: 25 }];
const singlePart = stacked.filter(row => row.label === 'A');
const manyTotals = Array.from({ length: 14 }, (_, i) => parts.slice(0, 2).map((part, j) => ({ label: `Region ${i + 1}`, part, value: 30 + (i * 7 + j * 11) % 60 }))).flat();
const longLabels = stacked.map(row => ({ ...row, label: { A: 'Northern metropolitan district', B: 'Southern coastal communities', C: 'Central rural municipalities', D: 'Western regional partnerships' }[row.label] }));
export const designComparisons = [
  entry('bar-zero', 'baseline', 'Preserve the magnitude', 'A filled length needs zero.', narrow,
    view('bar', plain('bar', '\n  .y("value", { domain: [95, 100] })'), 'Truncated baseline'), view('bar', plain('bar', '\n  .y("value", { domain: [0, 100] })'), 'Full magnitudes')),
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
  entry('line-near-zero', 'line', 'Show nearby zero', 'Include the nearby reference when helpful.', totals.map((row, i) => ({ ...row, value: [2, 3, 1, 4][i] })),
    view('line', single('line', '\n  .y("value", { domain: [1, 4] })'), 'Tight range'), view('line', single('line', '\n  .y("value", { domain: [0, 4] })'), 'Zero is visible')),
  entry('line-near-full', 'line', 'Show nearby 100%', 'Retain the full-scale reference for shares.', narrow,
    view('line', single('line', '\n  .y("value", { domain: [96, 99], title: "Share (%)" })'), 'Missing upper reference'), view('line', single('line', '\n  .y("value", { domain: [95, 100], title: "Share (%)" })'), '100% is visible')),
  entry('line-interpolation', 'line', 'Keep interpolation honest', 'Inspect the curve between observations.', jagged,
    view('line', single('line', '\n  .curve("curveNatural")\n  .pointSize(4)'), 'Natural smoothing'), view('line', single('line', '\n  .curve("curveMonotoneX")\n  .pointSize(4)'), 'Monotone interpolation')),
  entry('area-categories', 'area', 'Avoid filling unrelated categories', 'A category comparison needs independent marks.', ordinal,
    view('area', plain('area'), 'Filled continuity'), view('bar', plain('bar'), 'Category magnitudes')),
  entry('area-total-secondary', 'area', 'Prioritize individual trends', 'Lines suit a secondary combined total.', stacked,
    view('area', connected('area'), 'Floating layer positions'), view('line', connected('line'), 'Independent trajectories')),
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
  entry('dot-pairs', 'dot', 'Emphasize the paired gap', 'A connector makes the distance explicit.', stacked.filter(row => ['Core', 'Growth'].includes(row.part)),
    view('point', 'const chart = point(rows).x("value").y("label").key(["label", "part"]).color("part");', 'Two unconnected dots'), view('point', 'const chart = point(rows).x("value").y("label").key(["label", "part"]).color("part").connector({ by: "label" });', 'A range per category')),
];
const pieCode = (extra = '') => `const chart = pie(rows)
  .value("value")
  .key("part")
  .label("part")
  ${colors}${extra};`;
const pieRows = singlePart.map(row => ({ ...row, value: { Core: 26, Growth: 25, Services: 24, Support: 25 }[row.part] }));
const manyPie = tiny.filter(row => row.label === 'A');
const namedPie = singlePart.map(row => ({ ...row, part: { Core: 'Essential operations', Growth: 'Growth investments', Services: 'Customer services', Support: 'Administrative support' }[row.part] }));
designComparisons.push(
  entry('pie-familiar', 'pie', 'Recognize a familiar proportion', 'Rounded fractions can be recognizable in a pie.', [{ part: 'Selected', value: 25 }, { part: 'Remaining', value: 75 }],
    view('pie', pieCode().replace(colors, '.color("part")'), 'A valid familiar proportion', { label: 'Also suitable' }),
    { caption: 'A simpler single-message alternative.', text: '25%', detail: 'One quarter of the total.', label: 'Simpler alternative' }),
  entry('pie-precise', 'pie', 'Compare similar shares', 'Position supports precise comparisons.', pieRows,
    view('pie', pieCode(), 'Similar angles are hard to distinguish'), view('bar', 'const chart = bar(rows).x("part").y("value", { title: "Share (%)" }).key("part").flip();', 'Compare on a common baseline')),
  entry('pie-many', 'pie', 'Handle many components', 'An aligned stack makes a compact alternative.', manyPie,
    view('pie', pieCode().replace(colors, '.color("part")'), 'Ten slices compete for attention'), view('bar', bars('\n  .flip()').replace(colors, '.color("part")'), 'A horizontal total with its components')),
  entry('pie-one-share', 'pie', 'Communicate a single share', 'Text can carry the message directly.', [{ part: 'Core', value: 90 }, { part: 'Remaining', value: 60 }],
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
    view('pie', pieCode(), 'Pie spanning the available column'), view('pie', pieCode(), 'Compact pie alongside the message', { compact: true, detail: 'Core represents 60% of this total. A compact chart leaves room for explanatory text.' }))
);
