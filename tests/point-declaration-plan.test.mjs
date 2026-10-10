import test from 'node:test';
import assert from 'node:assert/strict';
import { point } from '../dist/point.js';
import { planDeclarationTransition } from '../dist/core.js';
import { createPointDeclarationOperationCodec } from '../dist/charts/point/declaration-operations.js';
import { plugin } from '../dist/charts/point/plugin.js';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { selectTransitionRoute } from '../dist/charts/transition-route.js';
import { serializeViewSpec } from '../dist/spec-meta.js';
import { canonicalPointTransitionPair } from '../dist/charts/point/state.js';

const rows = [
  { id: 'a', region: 'N', cohort: 'one', x: 2, y: 3 },
  { id: 'b', region: 'N', cohort: 'two', x: 4, y: 7 },
  { id: 'c', region: 'S', cohort: 'one', x: 8, y: 9 },
  { id: 'd', region: 'S', cohort: 'two', x: 10, y: 11 }
];
const codec = createPointDeclarationOperationCodec();
const base = () => point(rows).datumKey('id').x('x', { title: 'X' }).y('y', { title: 'Y' });
const summary = (groups = 'region', op = 'mean', size = false) => base().rollup(groups, {
  x: { field: 'x', op, title: 'X' }, y: { field: 'y', op, title: 'Y' }, size
}).toSpec();
const agg = spec => spec.transform.find(item => item.aggregate).aggregate;

function assertPlan(plan, from, to) {
  assert.equal(plan.status, 'planned', plan.reason);
  for (const stage of plan.stages) {
    assert.equal(codec.validate(stage.from).status, 'ok');
    assert.equal(codec.validate(stage.to).status, 'ok');
    const left = codec.decompose(stage.from);
    const right = codec.decompose(stage.to);
    assert.equal(left.status, 'ok');
    assert.equal(right.status, 'ok');
    const before = new Map(left.value.map(op => [op.id, JSON.stringify(op)]));
    const after = new Map(right.value.map(op => [op.id, JSON.stringify(op)]));
    assert.equal([...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id) !== after.get(id)).length, 1);
  }
  assert.deepEqual(plan.stages.at(-1).to, serializeViewSpec(to));
  const reverse = planDeclarationTransition(to, from, codec);
  assert.equal(reverse.status, 'planned', reverse.reason);
  assert.deepEqual(reverse.stages.map(stage => stage.to), plan.stages.slice().reverse().map(stage => stage.from));
}

test('Point summary grouping is one operation with complete default identity and detail metadata', () => {
  const from = summary();
  const to = summary(['region', 'cohort']);
  const unchanged = JSON.stringify([from, to]);
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id), ['__visdeltaPointGrain/grouping']);
  assert.deepEqual(plan.stages[0].to.meta.object.key, ['region', 'cohort']);
  assert.deepEqual(plan.stages[0].to.meta.state.sceneState.detail.groupby, ['region', 'cohort']);
  assert.equal(JSON.stringify([from, to]), unchanged);
});

test('Point rollup measure bundle changes reducers and aliases atomically with position bindings', () => {
  const from = summary();
  const to = summary('region', 'sum');
  agg(to).fields[0].as = 'x_total';
  agg(to).fields[1].as = 'y_total';
  to.encoding.x.field = 'x_total';
  to.encoding.y.field = 'y_total';
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id), ['__visdeltaPointGrain/measures']);
});

test('Point optional count-size inserts and removes within the complete rollup measure operation', () => {
  const from = summary();
  const to = summary('region', 'mean', true);
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.id, '__visdeltaPointGrain/measures');
  assert.deepEqual(plan.stages[0].to.encoding.size, { field: 'count', type: 'quantitative' });
});

test('Point aggregate size presentation remains a separate encoding operation', () => {
  const from = summary('region', 'mean', true);
  const to = summary('region', 'mean', true);
  to.encoding.size.range = [3, 15];
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id), ['encoding/size']);
});

test('Point canonical grouping, measures, appearance and attention ignore overwritten rollup calls', () => {
  const from = summary();
  const target = base().rollup(['region', 'cohort'], {
    x: { field: 'x', op: 'sum', title: 'X' }, y: { field: 'y', op: 'sum', title: 'Y' }
  }).color('#3366ff').pointSize(7).focus({ region: 'N' });
  const overwritten = base().rollup('cohort').rollup(['region', 'cohort'], {
    x: { field: 'x', op: 'sum', title: 'X' }, y: { field: 'y', op: 'sum', title: 'Y' }
  }).color('#ff0000').color('#3366ff').radius(4).pointSize(7).focus({ region: 'N' });
  const to = target.toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.deepEqual(plan, planDeclarationTransition(from, overwritten.toSpec(), codec));
  assert.ok(plan.stages.every(stage => !stage.to.encoding.color || stage.to.encoding.color.value === '#3366ff'));
  const route = selectTransitionRoute(plugin.createChartType(DEFAULT_CHART_RUNTIME), from, to);
  assert.equal(route.planning, 'planned');
  assert.equal(route.legs.length, plan.stages.length);
});

test('Point Grain keeps aggregate pipeline position and validates post-aggregate fields', () => {
  const from = summary();
  from.transform.unshift({ filter: { field: 'region', equal: 'N' } });
  const to = summary(['region', 'cohort']);
  to.transform.unshift({ filter: { field: 'region', equal: 'N' } });
  to.transform.push({ sort: { field: 'cohort' } });
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.ok(plan.stages.every(stage => stage.to.transform[1].aggregate));
  assert.ok(plan.stages.every(stage => !stage.to.transform.at(-1).sort || agg(stage.to).groupby.includes('cohort')));
  const invalid = summary();
  invalid.encoding.color = { field: 'cohort', type: 'nominal' };
  assert.match(codec.validate(invalid).reason, /output field/);
  invalid.encoding.color = { value: '#3366ff' };
  invalid.connector = { by: 'cohort' };
  assert.match(codec.validate(invalid).reason, /connector/);
  invalid.connector = { by: 'region' };
  assert.equal(codec.validate(invalid).status, 'ok');
});

test('Point rejects unverified aliases, keys, missing input and runtime detail views', () => {
  for (const mutate of [
    spec => { agg(spec).fields[0].field = 'missing'; },
    spec => { agg(spec).fields[0].as = 'region'; spec.encoding.x.field = 'region'; },
    spec => { agg(spec).fields[1].as = agg(spec).fields[0].as; spec.encoding.y.field = spec.encoding.x.field; },
    spec => { spec.meta.object.key = 'cohort'; },
    spec => { spec.meta.state.sceneState.detail.view = { encoding: spec.encoding }; },
    spec => { spec.meta.state.scopes = { focus: { mode: 'focus', filter: { field: 'cohort', equal: 'one' } } }; }
  ]) {
    const invalid = summary(); mutate(invalid);
    const plan = planDeclarationTransition(summary(), invalid, codec);
    assert.equal(plan.status, 'unsupported');
    assert.deepEqual(plan.stages, []);
  }
});

test('Point raw to summary preserves the existing chart detail route fallback', () => {
  const from = base().key('id').toSpec();
  const to = summary();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'unsupported');
  assert.match(plan.reason, /raw\/summary/);
  const route = selectTransitionRoute(plugin.createChartType(DEFAULT_CHART_RUNTIME), to, from);
  assert.equal(route.planning, 'authored');
  assert.equal(route.legs.length, 2);
});

test('Point ordinary connectors and fixed radius remain independent complete operations', () => {
  const from = base().key('id').toSpec();
  const to = base().key('id').connector({ by: 'region', orderBy: 'x' }).pointSize(8).color('#3366ff').toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assertPlan(plan, from, to);
  assert.deepEqual(new Set(plan.stages.map(stage => stage.operation.id)), new Set(['connector', 'size', 'encoding/color']));
  const invalid = { ...to, connector: { by: 'absent' } };
  assert.equal(codec.validate(invalid).status, 'unsupported');
  assert.equal(codec.validate({ ...summary(), connector: { from: 0 } }).status, 'unsupported');
  assert.equal(codec.validate({ ...summary(), connector: { from: 0, channel: 'y' } }).status, 'ok');
});

test('Point summary pairs compile one canonical route across refinement and unrelated grouping', () => {
  for (const [from, to] of [
    [summary(), summary(['region', 'cohort'])],
    [summary(), summary('cohort')],
    [summary(), summary('region', 'sum')],
    [summary(), { ...summary(), encoding: { ...summary().encoding, color: { value: '#3366ff' } } }]
  ]) {
    const unchanged = JSON.stringify([from, to]);
    const pair = canonicalPointTransitionPair(from, to);
    const reverse = canonicalPointTransitionPair(to, from);
    assert.deepEqual(pair.from, reverse.from);
    assert.deepEqual(pair.to, reverse.to);
    assert.equal(pair.reverse, !reverse.reverse);
    assert.equal(JSON.stringify([from, to]), unchanged);
  }
  const coarse = summary();
  const fine = summary(['region', 'cohort']);
  assert.equal(canonicalPointTransitionPair(fine, coarse).reverse, true);
});

test('Point renderer-equivalent connector formats have identical operation paths without mutating sources', () => {
  const ordinary = base().key('id').toSpec();
  const aggregate = summary(['region', 'cohort']);
  const categorical = point(rows).datumKey('id').key('id').x('region', { type: 'nominal' }).y('y', { type: 'quantitative' }).toSpec();
  for (const [from, equivalent] of [
    [ordinary, { ...ordinary, connector: null }],
    [aggregate, { ...aggregate, connector: null }],
    [{ ...ordinary, connector: { by: 'region' } }, { ...ordinary, connector: { by: ['region'] } }],
    [{ ...aggregate, connector: { by: 'region' } }, { ...aggregate, connector: { by: ['region'] } }],
    [{ ...categorical, connector: { from: 0 } }, { ...categorical, connector: { from: 0, channel: 'y' } }]
  ]) {
    const unchanged = JSON.stringify([from, equivalent]);
    const to = { ...from, encoding: { ...from.encoding, color: { value: '#3366ff' } } };
    assert.equal(planDeclarationTransition(from, equivalent, codec).status, 'direct');
    assert.deepEqual(codec.decompose(from), codec.decompose(equivalent));
    const plan = planDeclarationTransition(from, to, codec);
    const other = planDeclarationTransition(equivalent, to, codec);
    assert.equal(plan.status, 'planned', plan.reason);
    assert.deepEqual(plan, other);
    assert.deepEqual(plan.stages.map(stage => stage.operation.id), ['encoding/color']);
    assert.equal(JSON.stringify([from, equivalent]), unchanged);
  }
  const from = { ...aggregate, connector: { by: 'region' } };
  const to = { ...aggregate, connector: { by: 'cohort' } };
  const change = planDeclarationTransition(from, to, codec);
  assert.equal(change.status, 'planned', change.reason);
  assert.deepEqual(change.stages.map(stage => stage.operation.id), ['connector']);
});

test('Point explicit fixed radius and size range remain meaningful declarations', () => {
  const from = summary('region', 'mean', true);
  const withRadius = { ...from, size: 9 };
  assert.equal(planDeclarationTransition(from, withRadius, codec).stages[0].operation.id, 'size');
  const withRange = { ...from, encoding: { ...from.encoding, size: { ...from.encoding.size, range: [3, 15] } } };
  assert.equal(planDeclarationTransition(from, withRange, codec).stages[0].operation.id, 'encoding/size');
});
