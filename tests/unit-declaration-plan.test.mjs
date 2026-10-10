import test from 'node:test';
import assert from 'node:assert/strict';
import { unit } from '../dist/unit.js';
import { createUnitDeclarationOperationCodec } from '../dist/charts/unit/declaration-operations.js';
import { planDeclarationTransition } from '../dist/grammar/declaration-plan.js';
import { expandUnits, resolveUnitTransitionPlan } from '../dist/charts/unit/state.js';
import { selectTransitionRoute } from '../dist/charts/transition-route.js';
import { plugin } from '../dist/charts/unit/plugin.js';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { serializeViewSpec } from '../dist/spec-meta.js';

const rows = [{ id: 'a', group: 'A', amount: 6, x: 2, y: 3 }, { id: 'b', group: 'B', amount: 4, x: 5, y: 8 }];
const base = () => unit(rows).datumKey('id').key('id');
const codec = createUnitDeclarationOperationCodec();
const normalized = spec => { const result = codec.normalize(spec); assert.equal(result.status, 'ok', result.reason); return result.value; };
function verify(from, to) {
  const original = [serializeViewSpec(from), serializeViewSpec(to)];
  const forward = planDeclarationTransition(from, to, codec);
  assert.equal(forward.status, 'planned', forward.reason);
  for (const stage of forward.stages) {
    assert.equal(codec.validate(stage.from).status, 'ok');
    assert.equal(codec.validate(stage.to).status, 'ok');
    const left = new Map(codec.decompose(stage.from).value.map(op => [op.id, JSON.stringify(op)]));
    const right = new Map(codec.decompose(stage.to).value.map(op => [op.id, JSON.stringify(op)]));
    assert.equal([...new Set([...left.keys(), ...right.keys()])].filter(id => left.get(id) !== right.get(id)).length, 1);
    const meta = stage.to.meta;
    assert.deepEqual(meta.state.sceneState.axis, {
      layout: meta.unit.layout, group: meta.unit.group ?? null, value: meta.unit.value ?? null
    });
  }
  assert.deepEqual(forward.stages.at(-1).to, normalized(to));
  const reverse = planDeclarationTransition(to, from, codec);
  assert.deepEqual(reverse.stages.map(stage => stage.to), forward.stages.slice().reverse().map(stage => stage.from));
  assert.deepEqual([serializeViewSpec(from), serializeViewSpec(to)], original);
  return forward;
}

test('Unit quantity, units per circle, cap, grouping, layout and appearance are separate operations', () => {
  const plan = verify(base().toSpec(), base().value('amount', { unitValue: 2, maxUnits: 9 }).group('group').layout('bar').color('#3366ff').toSpec());
  assert.deepEqual(plan.stages.map(stage => stage.operation.id).sort(), [
    'meta/unit/value', 'meta/unit/unitValue', 'meta/unit/maxUnits', 'meta/unit/group', 'meta/unit/layout', 'encoding/color'
  ].sort());
  assert.ok(plan.stages.every(stage => stage.to.meta.unit.layout !== 'bar' || stage.to.meta.unit.group === 'group'));
});

test('Unit normalization ignores overwritten authoring calls and explicit renderer defaults', () => {
  const target = base().value('amount', { unitValue: 2 }).group('group').layout('bar').toSpec();
  const plain = base().toSpec();
  const defaults = base().value('amount', { unitValue: 4 }).value('amount', { unitValue: 2 }).layout('force').layout('bar').group('group').toSpec();
  assert.deepEqual(planDeclarationTransition(plain, target, codec), planDeclarationTransition(plain, defaults, codec));
  assert.deepEqual(normalized(plain), normalized(base().layout('grid').toSpec()));
  assert.equal(planDeclarationTransition(plain, base().layout('grid').toSpec(), codec).status, 'direct');
});

test('Unit focus removal and appearance change remain two reversible operations without empty scope leftovers', () => {
  const from = base().value('amount', { unitValue: 2 }).focus({ group: 'A' }).toSpec();
  const to = base().value('amount', { unitValue: 2 }).color('#3366ff').toSpec();
  const plan = verify(from, to);
  assert.equal(plan.stages.length, 2);
  assert.deepEqual(new Set(plan.stages.map(stage => stage.operation.id)), new Set(['meta/state/scopes/focus', 'encoding/color']));
  assert.equal(plan.stages.at(-1).to.meta.state.scopes, undefined);
  const empty = structuredClone(to);
  empty.meta.state ??= {};
  empty.meta.state.scopes = {};
  assert.deepEqual(normalized(empty), normalized(to));
});

test('Unit layout dependencies produce valid binding and unbinding order', () => {
  for (const layout of ['bar', 'beeswarm', 'force']) {
    const next = layout === 'bar' ? base().group('group').layout(layout) : base().x('x').y('y').layout(layout);
    verify(base().layout('grid').toSpec(), next.toSpec());
  }
});

test('Unit renderer quantity agrees with complete planner states and native motion is retained', () => {
  const from = base().value('amount', { unitValue: 2 }).layout('grid').toSpec();
  const to = base().value('amount', { unitValue: 1 }).group('group').layout('bar').toSpec();
  const plan = verify(from, to);
  assert.equal(expandUnits(rows, normalized(from)).length, 5);
  assert.equal(expandUnits(rows, normalized(to)).length, 10);
  const route = selectTransitionRoute(plugin.createChartType(DEFAULT_CHART_RUNTIME), from, to);
  assert.equal(route.planning, 'planned');
  assert.equal(route.legs.length, plan.stages.length);
  const layout = plan.stages.find(stage => stage.operation.id === 'meta/unit/layout');
  assert.equal(resolveUnitTransitionPlan(layout.from, layout.to).match.mode, 'key-first-travel');
});

test('Unit y-only anchor changes receive the native matched layout plan', () => {
  const from = base().layout('force').x('x').toSpec();
  const to = base().layout('force').x('x').y('y').toSpec();
  const plan = verify(from, to);
  assert.equal(plan.stages.length, 1);
  assert.equal(resolveUnitTransitionPlan(from, to).match.mode, 'key-first-travel');
});

test('Unit cap-only changes receive the native matched layout plan', () => {
  const from = base().value('amount', { maxUnits: 3 }).layout('bar').group('group').toSpec();
  const to = base().value('amount', { maxUnits: 9 }).layout('bar').group('group').toSpec();
  const plan = verify(from, to);
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.id, 'meta/unit/maxUnits');
  assert.equal(expandUnits(rows, normalized(from)).length, 3);
  assert.equal(expandUnits(rows, normalized(to)).length, 9);
  assert.equal(resolveUnitTransitionPlan(from, to).match.mode, 'key-first-travel');
});

test('Unit incomplete layouts, invalid parameters, unknown fields and conflicting mirrors are unsupported', () => {
  const badSpecs = [
    base().layout('bar').toSpec(), base().layout('beeswarm').toSpec(),
    base().group('missing').toSpec(), base().value('missing').toSpec(),
    { ...base().toSpec(), unit: { unitValue: 0 } },
    { ...base().toSpec(), unit: { maxUnits: 1.5 } },
    { ...base().toSpec(), unit: { layout: 'grid' }, meta: { state: { sceneState: { axis: { layout: 'bar' } } } } },
    { ...base().toSpec(), unit: { x: 'x' } },
    { ...base().toSpec(), transform: [{ aggregate: { groupby: ['group'], fields: [{ op: 'sum', field: 'amount', as: 'total' }] } }] }
  ];
  for (const spec of badSpecs) {
    const plan = planDeclarationTransition(base().toSpec(), spec, codec);
    assert.equal(plan.status, 'unsupported', JSON.stringify(spec));
    assert.deepEqual(plan.stages, []);
  }
});

test('Unit force domain checks its categorical anchor values even for quantitative bindings', () => {
  const from = base().layout('grid').toSpec();
  const good = base().x('x', { domain: [2, 5] }).layout('force').toSpec();
  verify(from, good);
  const bad = base().x('x', { domain: [0, 10] }).layout('force').toSpec();
  assert.equal(planDeclarationTransition(from, bad, codec).status, 'unsupported');
});

test('Unit unverifiable explicit datum identity reports the identity boundary before inline or layout checks', () => {
  for (const layout of ['grid', 'bar', 'beeswarm']) {
    const spec = { ...base().layout(layout).toSpec(), data: { url: '/unresolved-unit.json' } };
    const result = codec.validate(spec);
    assert.equal(result.status, 'unsupported');
    assert.match(result.reason, /cannot verify explicit datum identity/);
    const normalization = codec.normalize(spec);
    assert.equal(normalization.status, 'unsupported');
    assert.match(normalization.reason, /cannot verify explicit datum identity/);
  }
});
