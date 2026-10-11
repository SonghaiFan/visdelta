import { transitionScenario } from './scenario.js';

// Every idiom keeps its data bindings. Bar and Line own flat-to-repeat bridges.
export function repeatScenario(chart) {
  const configs = {
    bar: { url: 'us-population-state-age-tidy.csv', field: 'age', builder: 'bar(rows).x("state").y("population", { format: "~s" }).key(["state", "age"]).where({ field: "state", oneOf: ["CA", "TX", "NY", "FL"] }).where({ field: "age", oneOf: ["<10", "10-19", "20-29"] }).breakdown("age").color("age")' },
    line: { url: 'line-lab.csv', field: 'ticker', builder: 'line(rows).x("date").y("close").key(["date", "ticker"]).breakdown("ticker").color("ticker")' },
    area: { url: 'area-lab.csv', field: 'industry', builder: 'area(rows).x("date").y("unemployed").key(["date", "industry"]).where({ field: "industry", oneOf: ["Manufacturing", "Construction"] }).breakdown("industry").color("industry")' },
    point: { url: 'mtcars.csv', field: 'cyl', builder: 'point(rows).x("wt").y("mpg").key("name").color("cyl", { type: "nominal" })' },
    unit: { url: 'iris.csv', field: 'species', builder: 'unit(rows).key("flowerId").layout("grid", { columns: 10, radius: 4 }).color("species")' }
  };
  const config = configs[chart];
  const setup = `const DATA_URL = "./data/${config.url}";\nconst base = ${config.builder};`;
  const repeat = (direction, scales = 'shared') => `base.repeat("${config.field}", { direction: "${direction}", scales: "${scales}" })`;
  return transitionScenario({ id: 'repeat', category: 'layout', label: 'Repeat · Small multiples',
    description: chart === 'line' ? 'Separate the existing Line series into repeated panels in stages; reverse restores the shared chart. Axes, grid and data share each panel frame.' : chart === 'bar' ? 'Move stacked segments into panel baselines in stages. Reverse follows the same route; repeat binds the panel field, layout arranges panels, and numeric scale policy belongs to Coordinate.' : 'Rearrange repeated panels from columns to rows while keeping the same x/y bindings. Flat-to-repeat motion is unsupported for this chart type.',
    setup, from: chart === 'bar' || chart === 'line' ? 'base' : repeat('x'), to: repeat('y') });
}
