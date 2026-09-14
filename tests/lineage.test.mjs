import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupingTree,
  compileLineage,
  correspondLineage,
  bar,
  delta
} from '../dist/index.js';
import {
  barIntermediateSpecs,
  barReaggregationIntermediateSpecs
} from '../dist/charts/bar/state.js';

const cases = [
  { id: 'r1', year: 2020, location: 'A', case: 10 },
  { id: 'r2', year: 2020, location: 'B', case: 5 },
  { id: 'r3', year: 2021, location: 'A', case: 12 },
  { id: 'r4', year: 2021, location: 'B', case: 8 }
];

function sumBy(field) {
  return [{
    aggregate: {
      groupby: [field],
      fields: [{ op: 'sum', field: 'case', as: 'case' }]
    }
  }];
}

test('lineage compiles an AniVis-style grouping tree without losing datum identity', () => {
  const byYear = compileLineage(cases, sumBy('year'), { key: 'id' });
  const tree = buildGroupingTree(byYear);

  assert.deepEqual(byYear.rows.map(row => row.datum), [
    { year: 2020, case: 15 },
    { year: 2021, case: 20 }
  ]);
  assert.deepEqual(byYear.rows.map(row => row.lineage.map(atom => atom.datumKey)), [
    ['r1', 'r2'],
    ['r3', 'r4']
  ]);
  assert.equal(tree.field, null);
  assert.deepEqual(tree.children.map(node => [node.field, node.value]), [
    ['year', 2020],
    ['year', 2021]
  ]);
});

test('year to location is a many-to-many reaggregation through common refinement', () => {
  const byYear = compileLineage(cases, sumBy('year'), { key: 'id' });
  const byLocation = compileLineage(cases, sumBy('location'), { key: 'id' });
  const plan = correspondLineage(byYear, byLocation, {
    fromField: 'case',
    toField: 'case'
  });

  assert.equal(plan.mode, 'reaggregate');
  assert.equal(plan.splittable, true);
  assert.deepEqual(plan.commonRefinement, ['location', 'year']);
  assert.deepEqual(plan.fromGrain, ['year']);
  assert.deepEqual(plan.toGrain, ['location']);
  assert.deepEqual(plan.edges.map(edge => ({
    from: edge.from,
    to: edge.to,
    atoms: edge.atoms.map(atom => atom.datumKey),
    sourceValue: edge.sourceValue,
    targetValue: edge.targetValue
  })), [
    { from: '[2020]', to: '["A"]', atoms: ['r1'], sourceValue: 10, targetValue: 10 },
    { from: '[2020]', to: '["B"]', atoms: ['r2'], sourceValue: 5, targetValue: 5 },
    { from: '[2021]', to: '["A"]', atoms: ['r3'], sourceValue: 12, targetValue: 12 },
    { from: '[2021]', to: '["B"]', atoms: ['r4'], sourceValue: 8, targetValue: 8 }
  ]);
  assert.deepEqual(plan.components.map(component => component.operation), ['reaggregate']);
  assert.deepEqual(
    plan.edges.map(edge => edge.key).sort(),
    correspondLineage(byLocation, byYear).edges.map(edge => edge.key).sort()
  );
});

test('bar reaggregation plans split, update, and merge through one stable refinement', () => {
  const base = bar(cases).datumKey('id').y('case');
  const byYear = base.x('year').rollup('year').toSpec();
  const byLocation = base.x('location').rollup('location').toSpec();
  const phases = barReaggregationIntermediateSpecs(byYear, byLocation);

  assert.equal(phases.length, 4);
  assert.deepEqual(phases.map(phase => phase.scene), ['detail', 'axis', 'axis', 'axis']);
  assert.deepEqual(phases.map(phase => phase.spec.meta.object.key), [
    ['location', 'year'],
    ['location', 'year'],
    ['location', 'year'],
    ['location', 'year']
  ]);
  assert.deepEqual(phases.map(phase => phase.spec.transform.at(-1).aggregate.groupby), [
    ['location', 'year'],
    ['location', 'year'],
    ['location', 'year'],
    ['location', 'year']
  ]);
  assert.deepEqual(phases.map(phase => [
    phase.spec.encoding.x.field,
    phase.spec.encoding.detail.field
  ]), [
    ['year', 'location'],
    ['year', 'location'],
    ['location', 'year'],
    ['location', 'year']
  ]);
  assert.deepEqual(
    phases.map(phase => phase.spec.meta.state.sceneState.detail.layout),
    ['stacked', 'grouped', 'grouped', 'stacked']
  );
  assert.deepEqual(phases.map(phase => phase.spec.encoding.xOffset?.field ?? null), [
    null,
    'location',
    'year',
    null
  ]);
});

test('direct split follows the authored target layout without a synthetic route', () => {
  const base = bar(cases).datumKey('id').x('year').y('case');
  const total = base.rollup('year').toSpec();
  const grouped = base.breakdown('location').layout('grouped').toSpec();

  assert.deepEqual(barIntermediateSpecs(total, grouped), []);
});

test('delta exposes lineage correspondence for immutable inline chart endpoints', () => {
  const base = bar(cases).datumKey('id').y('case');
  const byYear = base.x('year').rollup('year');
  const byLocation = base.x('location').rollup('location');
  const result = delta(byYear, byLocation);

  assert.equal(result.lineage.mode, 'reaggregate');
  assert.deepEqual(result.lineage.commonRefinement, ['location', 'year']);
  assert.equal(result.lineage.edges.length, 4);
});

test('datumKey is source identity while key remains the current mark identity', () => {
  const chart = bar(cases).datumKey('id').x('year').y('case').key('year');
  const spec = chart.toSpec();
  assert.equal(spec.meta.lineage.key, 'id');
  assert.equal(spec.meta.object.key, 'year');
});

test('adding and removing one grouping level become split and merge plans', () => {
  const total = compileLineage(cases, [{
    aggregate: { groupby: [], fields: [{ op: 'sum', field: 'case', as: 'case' }] }
  }], { key: 'id' });
  const byYear = compileLineage(cases, sumBy('year'), { key: 'id' });

  assert.equal(correspondLineage(total, byYear).mode, 'split');
  assert.equal(correspondLineage(byYear, total).mode, 'merge');
});

test('correspondence components derive the six primitive operations from graph cardinality', () => {
  const same = compileLineage(cases, [], { key: 'id' });
  const empty = compileLineage([], [], { key: 'id' });
  const total = compileLineage(cases, [{ aggregate: {
    groupby: [], fields: [{ op: 'sum', field: 'case', as: 'case' }]
  } }], { key: 'id' });
  const byYear = compileLineage(cases, sumBy('year'), { key: 'id' });
  const byLocation = compileLineage(cases, sumBy('location'), { key: 'id' });

  assert.equal(correspondLineage(same, same).mode, 'update');
  assert.equal(correspondLineage(total, byYear).mode, 'split');
  assert.equal(correspondLineage(byYear, total).mode, 'merge');
  assert.equal(correspondLineage(byYear, byLocation).mode, 'reaggregate');
  assert.equal(correspondLineage(same, empty).mode, 'exit');
  assert.equal(correspondLineage(empty, same).mode, 'enter');
});

test('disconnected split and merge components are mixed, not a false reaggregate', () => {
  const rows = [
    { id: 'a', from: 'X', to: 'P', value: 1 },
    { id: 'b', from: 'X', to: 'Q', value: 1 },
    { id: 'c', from: 'Y', to: 'R', value: 1 },
    { id: 'd', from: 'Z', to: 'R', value: 1 }
  ];
  const aggregate = field => [{ aggregate: {
    groupby: [field], fields: [{ op: 'sum', field: 'value', as: 'value' }]
  } }];
  const plan = correspondLineage(
    compileLineage(rows, aggregate('from'), { key: 'id' }),
    compileLineage(rows, aggregate('to'), { key: 'id' })
  );

  assert.equal(plan.mode, 'mixed');
  assert.deepEqual(plan.components.map(component => component.operation), ['split', 'merge']);
});

test('filter preserves lineage and fold creates stable measure branches', () => {
  const source = [
    { id: 'A', region: 'North', sales: 10, profit: 3 },
    { id: 'B', region: 'South', sales: 8, profit: 2 }
  ];
  const table = compileLineage(source, [
    { filter: { field: 'region', equal: 'North' } },
    { fold: { fields: ['sales', 'profit'], as: ['measure', 'value'] } }
  ], { key: 'id' });

  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.grain, ['id', 'measure']);
  assert.notEqual(table.rows[0].markKey, table.rows[1].markKey);
  assert.deepEqual(table.rows.map(row => row.datum.measure), ['sales', 'profit']);
  assert.deepEqual(table.rows.map(row => row.lineage[0].branch), [
    ['fold:sales'],
    ['fold:profit']
  ]);
  assert.deepEqual(table.rows.map(row => row.contributions.value[0].value), [10, 3]);
});

test('lineage transform values match renderer missing-value semantics', () => {
  const source = [
    { id: 'A', value: 1 },
    { id: 'B', value: null },
    { id: 'C', value: '' },
    { id: 'D', value: false }
  ];
  const mean = compileLineage(source, [{
    aggregate: { fields: [{ op: 'mean', field: 'value', as: 'result' }] }
  }], { key: 'id' });
  assert.equal(mean.rows[0].datum.result, 1 / 3);

  const binned = compileLineage(source, [{ bin: { field: 'value', step: 1 } }], { key: 'id' });
  assert.deepEqual(binned.rows.map(row => row.datum.value_bin), ['1-2', null, null, null]);
});

test('non-additive aggregates retain provenance but reject split motion', () => {
  const median = compileLineage(cases, [{
    aggregate: {
      groupby: ['year'],
      fields: [{ op: 'median', field: 'case', as: 'case' }]
    }
  }], { key: 'id' });

  assert.equal(median.rows[0].datum.case, 7.5);
  assert.equal(median.rows[0].lineage.length, 2);
  assert.equal(median.capability.splittable, false);
  assert.match(median.capability.reasons[0], /median/);
});

test('mean lineage retains provenance but does not use the additive bar path', () => {
  const meanBy = field => [{
    aggregate: { groupby: [field], fields: [{ op: 'mean', field: 'case', as: 'case' }] }
  }];
  const byYear = compileLineage(cases, meanBy('year'), { key: 'id' });
  assert.equal(byYear.capability.splittable, false);
  assert.match(byYear.capability.reasons[0], /mean/);

  const base = bar(cases).datumKey('id').y('case');
  const from = base.x('year').rollup('year', { op: 'mean' }).toSpec();
  const to = base.x('location').rollup('location', { op: 'mean' }).toSpec();
  assert.deepEqual(barReaggregationIntermediateSpecs(from, to), []);
});

test('reaggregation normalizes an omitted aggregate result name', () => {
  const base = bar(cases).datumKey('id').y('case');
  const from = structuredClone(base.x('year').rollup('year').toSpec());
  const to = structuredClone(base.x('location').rollup('location').toSpec());
  for (const spec of [from, to]) {
    delete spec.transform.at(-1).aggregate.fields[0].as;
    spec.encoding.y.field = 'sum_case';
  }
  const phases = barReaggregationIntermediateSpecs(from, to);
  assert.equal(phases.length, 4);
  assert.deepEqual(phases.map(phase => phase.spec.encoding.y.field), [
    'sum_case',
    'sum_case',
    'sum_case',
    'sum_case'
  ]);
});

test('datum identity rejects duplicates and reports unsafe index fallback', () => {
  assert.throws(
    () => compileLineage([{ id: 'A' }, { id: 'A' }], [], { key: 'id' }),
    /Duplicate datum key/
  );
  const fallback = compileLineage([{ value: 1 }]);
  assert.equal(fallback.identity.mode, 'index');
  assert.equal(fallback.identity.stable, false);
  assert.equal(fallback.capability.splittable, false);

  const duplicateIds = compileLineage([{ id: 'A', value: 1 }, { id: 'A', value: 2 }]);
  assert.equal(duplicateIds.identity.mode, 'index');
  assert.equal(duplicateIds.identity.stable, false);
});
