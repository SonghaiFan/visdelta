import test from 'node:test';
import assert from 'node:assert/strict';
import { area, bar, chartStylePresets, darkChartStyle, detectDataTypes, d3ChartStyle, defineChartStyle, D3_AREA_CURVE_NAMES, D3_CURVE_NAMES, line, paperChartStyle, point, unit, UNIT_LAYOUTS } from '../dist/index.js';
import { areaCells, areaLayers } from '../dist/charts/area/state.js';
import { matchAreaFramePoints } from '../dist/charts/area/render.js';
import { connectedLineStretches, lineRowsAtTotal } from '../dist/charts/line/state.js';
import { pointIntermediateSpecs } from '../dist/charts/point/state.js';
import { defaultTransition } from '../dist/timing.js';
import {
  expandUnits,
  keyFirstTravelMatching,
  minimumTravelMatching
} from '../dist/charts/unit/state.js';

test('per-mark delay is opt-in while explicit partial timing keeps safe bounds', () => {
  assert.equal(defaultTransition().stagger, 0);
  assert.deepEqual(defaultTransition({ stagger: { step: 24 } }).stagger, {
    step: 24,
    max: 120,
    by: ''
  });
});

test('documented filtering uses where, not a nonexistent filter method', () => {
  for (const factory of [area, bar, line, point, unit]) {
    const declaration = factory([{ x: 'A', y: 2 }, { x: 'B', y: 3 }]).x('x').y('y');
    assert.equal(typeof declaration.filter, 'undefined');
    assert.doesNotThrow(() => declaration.where('datum.y >= 2').toSpec());
  }
});

test('core detects tidy field types and resolves missing channel types', () => {
  const rows = [
    { date: '2026-01-01', value: 12, group: 'North' },
    { date: '2026-01-02', value: 18, group: 'South' }
  ];

  assert.deepEqual(detectDataTypes(rows), {
    date: 'temporal',
    value: 'quantitative',
    group: 'nominal'
  });

  for (const factory of [area, line, point]) {
    const encoding = factory(rows).x('date').y('value').toSpec().encoding;
    assert.equal(encoding.x.type, 'temporal');
    assert.equal(encoding.y.type, 'quantitative');
  }
});

test('an explicit channel type overrides core inference', () => {
  const rows = [{ date: '2026-01-01', value: 12 }];
  const spec = line(rows)
    .x('date', { type: 'nominal' })
    .y('value', { type: 'ordinal' })
    .toSpec();

  assert.equal(spec.encoding.x.type, 'nominal');
  assert.equal(spec.encoding.y.type, 'ordinal');
});

test('chart style modules inherit the default grammar without entering chart specs', () => {
  const compact = defineChartStyle({
    key: 'compact',
    tickSpacing: { x: 48 },
    edgeTitleInset: { top: 12, right: 2 },
    legendInset: { top: 6 },
    legendPosition: 'right',
    charts: { bar: { grid: 'horizontal', margin: { left: 32 } } },
    axisTitle: channel => channel?.title
  });
  const spec = bar([{ id: 'A', value: 2 }]).x('id').y('value').toSpec();

  assert.equal(compact.key, 'compact');
  assert.equal(compact.tickSpacing.x, 48);
  assert.equal(compact.tickSpacing.y, d3ChartStyle.tickSpacing.y);
  assert.equal(compact.edgeTitleInset.top, 12);
  assert.equal(compact.edgeTitleInset.right, 2);
  assert.equal(compact.edgeTitleInset.bottom, d3ChartStyle.edgeTitleInset.bottom);
  assert.equal(compact.edgeTitleInset.left, d3ChartStyle.edgeTitleInset.left);
  assert.equal(compact.legendInset.top, 6);
  assert.equal(compact.legendInset.left, d3ChartStyle.legendInset.left);
  assert.equal(compact.legendPosition, 'right');
  assert.equal(compact.charts.bar.grid, 'horizontal');
  assert.equal(compact.charts.bar.margin.left, 32);
  assert.equal(compact.charts.bar.margin.top, d3ChartStyle.charts.bar.margin.top);
  assert.equal(spec.chartStyle, undefined);
  assert.throws(() => defineChartStyle({ key: '' }), /require a key/);
});

test('built-in chart-style presets expose stable structural and CSS keys', () => {
  assert.deepEqual(Object.keys(chartStylePresets), ['d3', 'paper', 'dark']);
  assert.equal(chartStylePresets.d3, d3ChartStyle);
  assert.equal(chartStylePresets.paper, paperChartStyle);
  assert.equal(chartStylePresets.dark, darkChartStyle);
  assert.equal(paperChartStyle.key, 'paper');
  assert.equal(paperChartStyle.charts.point.grid, 'horizontal');
  assert.equal(paperChartStyle.charts.point.edgeTitles, false);
  assert.equal(paperChartStyle.charts.point.openXDomain, false);
  assert.equal(paperChartStyle.charts.point.openYDomain, false);
  assert.equal(paperChartStyle.legendPosition, 'right');
  assert.ok(paperChartStyle.charts.point.margin.right >= 100);
  assert.equal(paperChartStyle.axisTitle({ title: 'Income' }, 'right'), 'Income');
  assert.equal(darkChartStyle.key, 'dark');
  assert.equal(darkChartStyle.charts.point.grid, 'both');
});

test('wide bar segments preserve their fold when rolling up to totals', () => {
  const ageBands = ['<10', '10-19', '≥80'];
  const detailed = bar('./population.csv')
    .x('name')
    .y('population')
    .segment({
      fields: ageBands,
      as: ['age', 'population'],
      category: 'name',
      labels: Object.fromEntries(ageBands.map(age => [age, age])),
      domain: ageBands
    })
    .color('age', { domain: ageBands, range: ['#d53e4f', '#fdae61', '#3288bd'] });

  const total = detailed.rollup().toSpec();
  assert.deepEqual(total.transform, [
    {
      fold: {
        fields: ageBands,
        as: ['age', 'population'],
        sourceAs: '__measure',
        labels: Object.fromEntries(ageBands.map(age => [age, age]))
      }
    },
    {
      aggregate: {
        groupby: ['name'],
        fields: [{ op: 'sum', field: 'population', as: 'population' }]
      }
    }
  ]);
  assert.equal(total.encoding?.color, undefined);
  assert.equal(total.encoding?.y?.field, 'population');
});

test('tidy bar detail preserves number format and rolls up without reshaping data', () => {
  const rows = [
    { state: 'CA', age: '<10', population: 5 },
    { state: 'CA', age: '≥80', population: 1 }
  ];
  const detailed = bar(rows)
    .x('state', { title: 'Region' })
    .y('population', { title: 'Residents', format: '~s' })
    .key(['state', 'age'])
    .breakdown('age')
    .color('age', { domain: ['<10', '≥80'], range: ['#d53e4f', '#3288bd'] });

  const detailSpec = detailed.toSpec();
  const total = detailed.rollup().toSpec();
  assert.equal(detailSpec.encoding.y.format, '~s');
  assert.equal(detailSpec.encoding.x.title, 'Region');
  assert.equal(detailSpec.encoding.y.title, 'Sum of Residents');
  assert.deepEqual(total.transform, [{
    aggregate: {
      groupby: ['state'],
      fields: [{ op: 'sum', field: 'population', as: 'population' }]
    }
  }]);
  assert.equal(total.encoding.color, undefined);
  assert.equal(total.encoding.y.field, 'population');
  assert.equal(total.encoding.y.title, 'Sum of Residents');
});

test('bar aggregate axes describe the default operation', () => {
  const rows = [
    { quarter: 'Q1', region: 'North', revenue: 12 },
    { quarter: 'Q1', region: 'South', revenue: 8 }
  ];
  const base = bar(rows).x('quarter').y('revenue', { title: 'Revenue' });

  assert.equal(base.rollup().toSpec().encoding.y.title, 'Sum of Revenue');
  assert.equal(base.rollup({ op: 'count' }).toSpec().encoding.y.title, 'Count of Revenue');
  assert.equal(base.rollup({ title: 'Quarter total' }).toSpec().encoding.y.title, 'Quarter total');
  assert.equal(
    base.breakdown('region').rollup().toSpec().encoding.y.title,
    'Sum of Revenue'
  );
});

test('chart rows materializes the current tidy state without runtime dependencies', () => {
  const rows = [
    { year: 2004, country: 'Norway', sites: 5 },
    { year: 2004, country: 'Denmark', sites: 4 },
    { year: 2022, country: 'Norway', sites: 8 }
  ];
  const chart = bar(rows).x('year').y('sites').rollup();

  assert.deepEqual(chart.rows(), [
    { year: 2004, sites: 9 },
    { year: 2022, sites: 8 }
  ]);
});

test('where changes rows while focus keeps rows and changes the view', () => {
  const rows = [
    { id: 'A', category: 'A', x: 10, y: 20, region: 'North' },
    { id: 'B', category: 'B', x: 30, y: 40, region: 'South' }
  ];
  const charts = [
    area(rows).x('category').y('y').key('id'),
    bar(rows).x('category').y('y').key('id'),
    point(rows).x('x').y('y').key('id'),
    line(rows).x('x', { type: 'quantitative' }).y('y').key('id'),
    unit(rows).key('id')
  ];

  for (const chart of charts) {
    const filtered = chart.where({ region: 'North' }).toSpec();
    const focused = chart.focus({ region: 'North' }).toSpec();
    assert.ok(filtered.transform?.some(transform => transform.filter));
    assert.equal(focused.transform?.some(transform => transform.filter) ?? false, false);
    assert.equal(focused.meta.state.scopes.focus.mode, 'focus');
  }

  const filteredBar = charts[0].where({ type: 'Hot days' }).toSpec();
  assert.equal(filteredBar.meta.object.key, 'id');
  assert.equal(filteredBar.encoding.y.title, 'Y');
});

test('selectors compose from the previous immutable state and reset to the declaration baseline', () => {
  const rows = [
    { id: 'n-old', region: 'North', age: 85, value: 4 },
    { id: 'n-young', region: 'North', age: 40, value: 3 },
    { id: 's-old', region: 'South', age: 82, value: 2 }
  ];
  const initial = bar(rows).x('id').y('value').key('id');
  const changed = initial
    .where({ region: ['North', 'South'] })
    .where({ region: 'North' })
    .where({ age: { gt: 80 } })
    .focus({ region: 'North' })
    .focus({ age: { gt: 80 } })
    .highlight({ region: 'North' })
    .highlight({ age: { gt: 80 } });
  const spec = changed.toSpec();

  assert.deepEqual(spec.transform.map(transform => transform.filter), [
    { field: 'age', gt: 80 },
    { field: 'region', equal: 'North' },
    { field: 'region', oneOf: ['North', 'South'] }
  ]);
  assert.deepEqual(spec.meta.state.scopes.focus.filters, [
    { field: 'age', gt: 80 },
    { field: 'region', equal: 'North' }
  ]);
  assert.deepEqual(spec.meta.state.scopes.highlight.filters, [
    { field: 'age', gt: 80 },
    { field: 'region', equal: 'North' }
  ]);
  assert.deepEqual(initial.toSpec().transform, undefined);
  assert.deepEqual(changed.reset().toSpec(), initial.toSpec());
});

test('where preserves its position in an order-sensitive transform pipeline', () => {
  const initial = bar([{ year: 2020, region: 'North', value: 4 }])
    .x('year')
    .y('value');
  const spec = initial
    .where({ region: 'North' })
    .rollup('year')
    .where({ field: 'value', gt: 2 })
    .toSpec();

  assert.ok(spec.transform[0].filter);
  assert.ok(spec.transform[1].aggregate);
  assert.ok(spec.transform[2].filter);
});

test('unit separates group meaning from layout and preserves count identity', () => {
  const rows = [
    { id: 'A', category: 'one', count: 0 },
    { id: 'B', category: 'two', count: 3 }
  ];
  const base = unit(rows).value('count', { maxUnits: 20 }).key('id');
  const grouped = base.group('category');
  const bars = grouped.layout('bar', { columns: 2, radius: 5 });
  const groupedSpec = grouped.toSpec();
  const barSpec = bars.toSpec();

  assert.deepEqual(UNIT_LAYOUTS, ['grid', 'force', 'bar', 'beeswarm']);
  assert.equal(groupedSpec.meta.state.sceneState.axis.group, 'category');
  assert.equal(groupedSpec.meta.state.sceneState.axis.layout, 'grid');
  assert.equal(groupedSpec.encoding?.color, undefined);
  assert.equal(barSpec.meta.state.sceneState.axis.layout, 'bar');
  assert.equal(barSpec.meta.unit.columns, 2);
  assert.equal(barSpec.meta.unit.radius, 5);
  assert.equal(base.x('id').layout('beeswarm').toSpec().meta.unit.layout, 'beeswarm');
  assert.equal(base.layout('force').toSpec().meta.unit.layout, 'force');
  assert.equal(typeof bars.rollup, 'undefined');
  assert.equal(typeof bars.breakdown, 'undefined');

  const units = expandUnits(barSpec.data, barSpec, {});
  assert.equal(units.length, 3);
  assert.deepEqual(units.map(value => value.__unitKey), ['B\u00000', 'B\u00001', 'B\u00002']);
  assert.throws(() => base.layout('cluster'), /grid, force, bar, beeswarm/);
  assert.throws(() => base.layout('dodge'), /grid, force, bar, beeswarm/);
  assert.throws(() => base.layout('timeline'), /grid, force, bar, beeswarm/);
  assert.throws(() => base.columns(0), /positive integer/);
  assert.throws(() => base.radius(0), /positive finite/);
  assert.throws(() => base.value('count', { maxUnits: 0 }), /positive integer/);
});

test('unit matching fills each target slot with the closest available unit globally', () => {
  const sources = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 }
  ];
  const targets = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 }
  ];
  const matches = minimumTravelMatching(sources, targets);

  assert.deepEqual(matches.map(({ sourceIndex, targetIndex }) => [sourceIndex, targetIndex]), [
    [0, 0],
    [1, 1],
    [3, 2]
  ]);
  assert.equal(matches.reduce((sum, match) => sum + match.distance, 0), 0);
});

test('unit matching preserves the same key before minimizing unmatched travel', () => {
  const sources = [
    { key: 'A', x: 100, y: 0 },
    { key: 'X', x: 0, y: 0 },
    { key: 'Y', x: 10, y: 0 }
  ];
  const targets = [
    { key: 'A', x: 0, y: 0 },
    { key: 'P', x: 9, y: 0 },
    { key: 'Q', x: 1, y: 0 }
  ];
  const matches = keyFirstTravelMatching(sources, targets);

  assert.deepEqual(matches.map(({ sourceIndex, targetIndex, matchedBy }) => [
    sourceIndex, targetIndex, matchedBy
  ]), [
    [0, 0, 'key'],
    [2, 1, 'travel'],
    [1, 2, 'travel']
  ]);
});

test('area owns explicit baseline and diverging stacked boundaries', () => {
  const rows = [
    { period: 'Q1', region: 'North', value: 12 },
    { period: 'Q1', region: 'South', value: -4 },
    { period: 'Q2', region: 'North', value: 8 },
    { period: 'Q2', region: 'South', value: 5 }
  ];
  const detailed = area(rows).x('period').y('value').key(['period', 'region'])
    .baseline(10).breakdown('region', { color: ['#111111', '#eeeeee'] });
  assert.equal(
    area(rows).x('period').y('value').breakdown('region').toSpec().encoding.color,
    undefined
  );
  const spec = detailed.toSpec();
  assert.equal(spec.baseline, 10);
  assert.equal(spec.meta.state.sceneState.detail.mode, 'stacked');
  assert.deepEqual(spec.encoding.color.range, ['#111111', '#eeeeee']);

  const layers = areaLayers(rows, 'period', 'value', {
    selection: null, mode: 'stacked', seriesField: 'region', baseline: 10
  });
  assert.deepEqual(layers[0].points.map(point => [point.y0, point.y1]), [[10, 22], [10, 18]]);
  assert.deepEqual(layers[1].points.map(point => [point.y0, point.y1]), [[10, 6], [18, 23]]);

  const total = detailed.rollup().toSpec();
  assert.deepEqual(total.transform.at(-1), {
    aggregate: {
      groupby: ['period'],
      fields: [{ op: 'sum', field: 'value', as: 'value' }]
    }
  });
  assert.equal(total.encoding.color, undefined);
  assert.throws(() => detailed.baseline(Number.NaN), /finite number/);
  assert.equal(detailed.connect('adjacent').toSpec().connect, 'adjacent');
  assert.equal(detailed.connect('across').toSpec().connect, 'across');
  assert.throws(() => detailed.connect('sometimes'), /adjacent.*across/);
  assert.equal(D3_AREA_CURVE_NAMES.length, 19);
  for (const curve of D3_AREA_CURVE_NAMES) {
    assert.equal(area(rows).x('period').y('value').curve(curve).toSpec().curve, curve);
  }
  assert.throws(() => detailed.curve('curveBundle'), /supports areas/);
  assert.throws(() => detailed.curve('smooth'), /supports areas/);
});

test('area filters keep separate connected stretches unless the author connects across', () => {
  const lineage = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']
    .map((id, index) => ({ id, period: id, value: index + 1 }));
  const rows = lineage.filter(row => !['Q3', 'Q4'].includes(row.id));
  const selection = { filter: { field: 'id', oneOf: rows.map(row => row.id) } };
  const state = {
    selection, mode: 'single', seriesField: null, baseline: 0, connect: 'adjacent'
  };
  const key = row => row.id;
  const layers = areaLayers(rows, 'period', 'value', state, key);
  const lineageLayers = areaLayers(lineage, 'period', 'value', state, key);
  const adjacent = areaCells(layers, lineageLayers);
  const cell = (cells, key) => cells.find(value => value.observationKey === key);
  assert.deepEqual(adjacent.map(value => value.observationKey), ['Q1', 'Q2', 'Q5', 'Q6']);
  assert.equal(cell(adjacent, 'Q1').left, null);
  assert.equal(cell(adjacent, 'Q1').right.key, 'Q2');
  assert.equal(cell(adjacent, 'Q2').left.key, 'Q1');
  assert.equal(cell(adjacent, 'Q2').right, null);
  assert.equal(cell(adjacent, 'Q5').left, null);
  assert.equal(cell(adjacent, 'Q5').right.key, 'Q6');
  assert.equal(cell(adjacent, 'Q6').left.key, 'Q5');
  assert.equal(cell(adjacent, 'Q6').right, null);

  const across = areaCells(layers, layers);
  assert.equal(cell(across, 'Q2').right.key, 'Q5');
  assert.equal(cell(across, 'Q5').left.key, 'Q2');

  const isolatedLayers = areaLayers([lineage[2]], 'period', 'value', state, key);
  assert.deepEqual(areaCells(isolatedLayers, lineageLayers), []);
});

test('area observations enter and exit at zero thickness without moving x', () => {
  const fewer = [
    { key: 'Q1', x: 10, y0: 100, y1: 70 },
    { key: 'Q3', x: 30, y0: 100, y1: 40 }
  ];
  const more = [
    { key: 'Q1', x: 10, y0: 100, y1: 70 },
    { key: 'Q2', x: 20, y0: 100, y1: 55 },
    { key: 'Q3', x: 30, y0: 100, y1: 40 }
  ];
  const enter = matchAreaFramePoints(fewer, more).find(pair => pair.key === 'Q2');
  assert.deepEqual(enter.from, { x: 20, y0: 100, y1: 100 });
  assert.equal(enter.to.x, 20);
  assert.equal(enter.to.y1, 55);

  const exit = matchAreaFramePoints(more, fewer).find(pair => pair.key === 'Q2');
  assert.equal(exit.from.x, 20);
  assert.deepEqual(exit.to, { x: 20, y0: 100, y1: 100 });
});

test('color is an explicit encoding, including for bar breakdowns', () => {
  const rows = [
    { category: 'A', type: 'one', value: 10 },
    { category: 'A', type: 'two', value: 20 }
  ];
  const base = bar(rows).x('category').y('value').key('category');
  assert.equal(base.toSpec().encoding.color, undefined);
  assert.equal(base.breakdown('type').toSpec().encoding.color, undefined);
  assert.deepEqual(base.breakdown('type').color('type').toSpec().encoding.color, {
    field: 'type', type: 'nominal'
  });
  assert.equal(base.breakdown('type').color('type').rollup().toSpec().encoding.color, undefined);
});

test('chart operations never invent a visual encoding', () => {
  const rows = [
    { id: 'A', period: 'Q1', region: 'North', value: 10 },
    { id: 'B', period: 'Q1', region: 'South', value: 20 }
  ];

  assert.equal(
    bar(rows).x('period').y('value').breakdown('region').toSpec().encoding.color,
    undefined
  );
  assert.equal(
    line(rows).x('period').y('value').breakdown('region').toSpec().encoding.color,
    undefined
  );
  assert.equal(
    area(rows).x('period').y('value').breakdown('region').toSpec().encoding.color,
    undefined
  );
  assert.equal(
    point(rows).x('value').y('value').rollup('region').toSpec().encoding.size,
    undefined
  );
  assert.equal(
    unit(rows).value('value').group('region').toSpec().encoding?.color,
    undefined
  );
});

test('order is the canonical authored transition-step order', () => {
  const base = bar([{ category: 'A', value: 1 }]).x('category').y('value');
  const ordered = base.flip({ order: ['x', 'y'], duration: 300 }).toSpec();

  assert.deepEqual(ordered.meta.state.sceneState.axis.order, ['x', 'y']);
  assert.equal(ordered.meta.state.sceneState.axis.duration, 300);
});

test('point size and summary parent fields survive compilation', () => {
  const rows = [
    { id: 'A', region: 'North', x: 10, y: 20 },
    { id: 'B', region: 'North', x: 20, y: 30 }
  ];
  const detailed = point(rows).x('x').y('y').key('id').pointSize(11).color('region');
  assert.equal(detailed.toSpec().size, 11);
  assert.throws(() => detailed.radius(0), /positive finite number/);

  const summary = detailed.rollup('region', {
    size: { op: 'count', range: [10, 24] }
  });
  assert.deepEqual(summary.toSpec().meta.state.sceneState.detail.groupby, ['region']);
  assert.deepEqual(summary.toSpec().encoding.size, {
    field: 'count', type: 'quantitative', range: [10, 24]
  });
  assert.deepEqual(summary.toSpec().transform.at(-1).aggregate.fields.at(-1), {
    op: 'count', as: 'count'
  });
  assert.equal(detailed.rollup('region').toSpec().encoding.size, undefined);
  assert.equal(
    summary.breakdown('id').toSpec().meta.state.sceneState.detail.parentField,
    'region'
  );
});

test('point detail first sets the target view while keeping summary marks', () => {
  const rows = [
    { id: 'A', region: 'North', x: 10, y: 20 },
    { id: 'B', region: 'North', x: 20, y: 30 },
    { id: 'C', region: 'South', x: 70, y: 80 }
  ];
  const detail = point(rows).x('x').y('y').key('id').color('region').toSpec();
  const summary = point(rows).x('x').y('y').key('id').color('region')
    .rollup('region').toSpec();
  const phases = pointIntermediateSpecs(summary, detail);

  assert.equal(phases.length, 1);
  assert.deepEqual(phases[0].spec.transform, summary.transform);
  assert.equal(phases[0].spec.meta.state.sceneState.detail.mode, 'aggregate');
  assert.equal(phases[0].spec.meta.state.sceneState.detail.step, 'set-view');
  assert.deepEqual(phases[0].spec.meta.state.sceneState.detail.view.encoding, detail.encoding);
  assert.deepEqual(phases[0].spec.meta.state.sceneState.detail.view.transform, detail.transform || []);
});

test('line rollup aggregates by x and line styling uses D3 curve names', () => {
  const rows = [
    { period: 'Q1', region: 'North', value: 12 },
    { period: 'Q1', region: 'South', value: 8 }
  ];
  const detailed = line(rows).x('period').y('value').key(['period', 'region'])
    .breakdown('region', { color: ['#111111', '#eeeeee'] });
  const total = detailed.rollup({ op: 'sum' }).toSpec();

  assert.deepEqual(total.transform.at(-1), {
    aggregate: {
      groupby: ['period'],
      fields: [{ op: 'sum', field: 'value', as: 'value' }]
    }
  });
  assert.equal(total.encoding.color, undefined);
  assert.equal(total.meta.state.sceneState.detail.mode, 'single');
  assert.equal(D3_CURVE_NAMES.length, 20);
  for (const curve of D3_CURVE_NAMES) {
    assert.equal(line(rows).x('period').y('value').curve(curve).toSpec().curve, curve);
  }
  assert.throws(() => detailed.curve('smooth'), /D3 curve name/);
  assert.throws(() => detailed.strokeWidth(0), /positive finite number/);
  assert.throws(() => detailed.pointSize(-1), /nonnegative finite number/);
  assert.equal(detailed.connect('adjacent').toSpec().connect, 'adjacent');
  assert.equal(detailed.connect('across').toSpec().connect, 'across');
  assert.throws(() => detailed.connect('sometimes'), /adjacent.*across/);
  assert.deepEqual(
    lineRowsAtTotal(rows, 'period', 'value', 'mean').map(row => row.value),
    [10, 10]
  );
});

test('line filters keep gaps unless the author connects across them', () => {
  const lineage = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'].map((id, index) => ({ id, value: index }));
  const rows = lineage.filter(row => !['Q3', 'Q4'].includes(row.id));
  const selection = { filter: { field: 'id', oneOf: rows.map(row => row.id) } };
  const key = row => row.id;

  const adjacent = connectedLineStretches(rows, lineage, null, key, selection, 'adjacent');
  assert.deepEqual(adjacent.map(series => series.rows.map(row => row.id)), [
    ['Q1', 'Q2'],
    ['Q5', 'Q6']
  ]);
  assert.deepEqual(
    connectedLineStretches(rows, lineage, null, key, selection, 'across')[0].rows.map(row => row.id),
    ['Q1', 'Q2', 'Q5', 'Q6']
  );
  assert.deepEqual(
    connectedLineStretches([lineage[2]], lineage, null, key, selection, 'adjacent'),
    []
  );
});
