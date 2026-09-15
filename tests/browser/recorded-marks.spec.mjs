import { test, expect } from '@playwright/test';

// A seekable render must never pass through D3's scheduler: while a transition
// compiles, `selection.transition()` must not be called on any node inside the
// chart SVG (marks, axes, grid, labels, legend, layers), and a frame must not
// depend on the seek history. (Checking `node.__transition` afterwards is not
// enough: the cached evaluation path clears harvested schedules once it has
// compiled them.)

const rows = [
  { period: 'Q1', region: 'North', sales: 28 },
  { period: 'Q2', region: 'North', sales: 41 },
  { period: 'Q3', region: 'North', sales: 35 },
  { period: 'Q4', region: 'North', sales: 52 },
  { period: 'Q1', region: 'South', sales: 18 },
  { period: 'Q2', region: 'South', sales: 22 },
  { period: 'Q3', region: 'South', sales: 30 },
  { period: 'Q4', region: 'South', sales: 27 }
];

const flowers = Array.from({ length: 24 }, (_, i) => ({
  flowerId: i + 1,
  species: ['setosa', 'versicolor', 'virginica'][i % 3],
  petalLength: 1 + (i * 7) % 11 / 2,
  sepalWidth: 2 + (i * 5) % 7 / 3
}));

const barRows = [
  { category: 'A', type: 'one', value: 10, other: 30 }, { category: 'A', type: 'two', value: 20, other: 5 },
  { category: 'B', type: 'one', value: 30, other: 20 }, { category: 'B', type: 'two', value: 15, other: 25 },
  { category: 'C', type: 'one', value: 12, other: 9 }, { category: 'C', type: 'two', value: 8, other: 14 }
];

// Every built-in chart. A chart with any harvested transition fails the
// scheduled-nodes check (point failed with 16 before its marks were migrated).
const cases = [
  {
    chart: 'bar',
    // Bar marks, axes, grid, titles, legend, and layers are all recorded:
    // nothing inside the SVG may reach D3's scheduler.
    pairs: {
      measure: [(m) => m.rollup(), (m) => m.rollup().y('other')],
      filter: [(m) => m.rollup(), (m) => m.rollup().where({ field: 'category', oneOf: ['A', 'B'] })],
      sort: [(m) => m.rollup(), (m) => m.rollup().sort('value', 'descending')],
      flip: [(m) => m.rollup(), (m) => m.rollup().flip()],
      split: [(m) => m.rollup(), (m) => m],
      merge: [(m) => m, (m) => m.rollup()],
      grouped: [(m) => m, (m) => m.layout('grouped')],
      groupedSplit: [(m) => m.rollup(), (m) => m.layout('grouped')]
    },
    make: (bar) => bar(rows).x('category').y('value').key('category').breakdown('type').color('type'),
    data: barRows
  },
  {
    chart: 'point',
    pairs: {
      measure: [(m) => m, (m) => m.y('sepalWidth')],
      filter: [(m) => m, (m) => m.where({ species: 'setosa' })],
      // The blend effect is lab-injected spec meta, not a builder option;
      // point-lab.spec covers its recorded blend layer.
      summary: [(m) => m, (m) => m.rollup('species', { key: 'species', x: { op: 'mean' }, y: { op: 'mean' }, size: { op: 'count', range: [8, 20] } })]
    },
    make: (point) => point(rows).x('petalLength').y('sepalWidth').key('flowerId').color('species')
  },
  {
    chart: 'unit',
    pairs: {
      filter: [(m) => m, (m) => m.data(rows.slice(0, 18))],
      bar: [(m) => m, (m) => m.group('species').layout('bar', { columns: 4 })],
      beeswarm: [(m) => m, (m) => m.x('petalLength').layout('beeswarm')],
      force: [(m) => m, (m) => m.x('species').layout('force')]
    },
    make: (unit) => unit(rows).key('flowerId').layout('grid', { columns: 6, radius: 6 }).color('species')
  },
  {
    chart: 'line',
    pairs: {
      filter: [(m) => m, (m) => m.where({ region: 'North' })],
      window: [(m) => m, (m) => m.where({ field: 'period', oneOf: ['Q1', 'Q2', 'Q3'] })],
      highlight: [(m) => m, (m) => m.highlight({ region: 'North' })],
      split: [(m) => m.rollup(), (m) => m]
    },
    make: (line) => line(rows).x('period').y('sales').key(['region', 'period']).color('region')
  },
  {
    chart: 'area',
    pairs: {
      filter: [(m) => m, (m) => m.where({ region: 'North' })],
      window: [(m) => m, (m) => m.where({ field: 'period', oneOf: ['Q1', 'Q2', 'Q3'] })],
      split: [(m) => m.rollup(), (m) => m],
      stream: [(m) => m, (m) => m.layout('stream')]
    },
    make: (area) => area(rows).x('period').y('sales').key(['region', 'period']).breakdown('region').color('region')
  }
];

for (const { chart, pairs, make, data = chart === 'point' || chart === 'unit' ? flowers : rows } of cases) {
  for (const [name, [from, to]] of Object.entries(pairs)) {
    test(`${chart} ${name}: every node is recorded, none scheduled through D3`, async ({ page }) => {
      await page.goto('/tests/fixtures/runtime.html');
      await page.waitForSelector('rect.vd-bar');
      const result = await page.evaluate(async ({ chart, from, to, make, rows }) => {
        const [module, { transition }] = await Promise.all([
          import(`/dist/${chart}.js`),
          import('/dist/transition-entry.js')
        ]);
        document.body.innerHTML = '<div id="a" style="width:800px"></div><div id="b" style="width:800px"></div>';
        const base = new Function('module', 'rows', `return (${make})(module.${chart});`)(module, rows);
        const start = new Function('m', 'rows', `return (${from})(m);`)(base, rows);
        const end = new Function('m', 'rows', `return (${to})(m);`)(start, rows);
        const options = (target) => ({ target, height: 400 });
        // Record every node that reaches D3's scheduler while the pair compiles.
        const scheduledNodes = new Set();
        const proto = d3.selection.prototype;
        const originalTransition = proto.transition;
        proto.transition = function(...args) {
          this.nodes().forEach((node) => scheduledNodes.add(node));
          return originalTransition.apply(this, args);
        };
        let forward, backward;
        try {
          forward = await transition(start, end, options('#a'));
          backward = await transition(start, end, options('#b'));
        } finally {
          proto.transition = originalTransition;
        }
        const nodes = (target) => [...document.querySelector(target).querySelectorAll('svg, svg *')];
        const scheduled = (target) => nodes(target).filter((node) => scheduledNodes.has(node))
          .map((node) => `${node.tagName}.${node.getAttribute('class') || ''}`);
        const geometry = (target) => nodes(target).map((node) => ({
          tag: node.tagName,
          class: node.getAttribute('class'),
          key: node.getAttribute('data-key'),
          transform: node.getAttribute('transform'),
          d: node.getAttribute('d'),
          x: node.getAttribute('x'), y: node.getAttribute('y'),
          cx: node.getAttribute('cx'), cy: node.getAttribute('cy'), r: node.getAttribute('r'),
          width: node.getAttribute('width'), height: node.getAttribute('height'),
          dashoffset: node.getAttribute('stroke-dashoffset'),
          text: node.childElementCount ? null : node.textContent,
          opacity: node.style.opacity,
          visibility: node.style.visibility
        }));
        // Reach the same progress from opposite directions.
        forward.progress(0.5);
        backward.progress(1);
        backward.progress(0.5);
        return {
          marks: nodes('#a').length,
          scheduledNodes: [...scheduled('#a'), ...scheduled('#b')],
          fromZero: geometry('#a'),
          fromOne: geometry('#b')
        };
      }, { chart, from: String(from), to: String(to), make: String(make), rows: data });
      expect(result.marks).toBeGreaterThan(0);
      expect(result.scheduledNodes).toEqual([]);
      expect(result.fromOne).toEqual(result.fromZero);
    });
  }
}
