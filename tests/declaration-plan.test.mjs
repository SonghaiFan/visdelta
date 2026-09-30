import test from 'node:test';
import assert from 'node:assert/strict';
import { delta, applyDeclarationEdits, declarationEdits, planDeclarationTransition } from '../dist/core.js';
import { point } from '../dist/point.js';
import { resolveIntermediateSpecs } from '../dist/charts/transition-route.js';

const rows = [
  { id: 'a', group: 'A', x: 1, y: 2, other: 4 },
  { id: 'b', group: 'B', x: 3, y: 5, other: 2 }
];
const base = point(rows).key('id').x('x').y('y');
const states = plan => [plan.stages[0].from, ...plan.stages.map(stage => stage.to)];

test('delta edits reconstruct declarations, including ordered transforms and fixed style', () => {
  const from = base.where({ group: 'A' }).radius(4).toSpec();
  const to = base.sort('x').where({ group: 'B' }).radius(9).toSpec();
  const diff = delta(from, to);
  assert.ok(diff.edits.some(edit => edit.path.join('.') === 'size'));
  assert.ok(diff.edits.some(edit => edit.path.join('.') === 'transform'));
  assert.deepEqual(applyDeclarationEdits(from, diff.edits), to);
  const inverse = diff.edits.map(edit => ({ path: edit.path, previous: edit.next, next: edit.previous }));
  assert.deepEqual(applyDeclarationEdits(to, inverse), from);
  assert.throws(() => applyDeclarationEdits(base.radius(12).toSpec(), diff.edits), /Stale|Missing/);
});

test('declaration edits distinguish absent, null, false and zero without mutating inputs', () => {
  const from = { mark: 'custom', width: 0, flag: false, extra: null };
  const to = { mark: 'custom', width: 5, other: null, flag: true };
  const snapshot = JSON.stringify([from, to]);
  assert.deepEqual(applyDeclarationEdits(from, declarationEdits(from, to)), to);
  assert.equal(JSON.stringify([from, to]), snapshot);
});

test('delta edits apply to authored JSON without leaking inferred channel types', () => {
  const from = { mark: 'point', data: { values: rows }, encoding: { x: { field: 'x' }, y: { field: 'y' } } };
  const to = { ...from, encoding: { x: { field: 'group' }, y: { field: 'other' } } };
  assert.deepEqual(applyDeclarationEdits(from, delta(from, to).edits), to);
});

test('composite endpoint changes release attention, change bindings, then restore target attention', () => {
  const from = base.focus({ group: 'A' }).toSpec();
  const to = base.y('other').highlight({ group: 'B' }).toSpec();
  const snapshot = JSON.stringify([from, to]);
  const plan = planDeclarationTransition(from, to);
  assert.deepEqual(plan.stages.map(stage => stage.reason), [
    'release-attention', 'change-state', 'apply-attention'
  ]);
  assert.deepEqual(plan.stages[0].to.encoding, from.encoding);
  assert.equal(plan.stages[0].to.meta.state?.scopes?.focus, undefined);
  assert.equal(plan.stages[1].to.encoding.y.field, 'other');
  assert.deepEqual(plan.stages.at(-1).to, to);
  for (const stage of plan.stages) assert.deepEqual(applyDeclarationEdits(stage.from, stage.edits), stage.to);
  assert.deepEqual(states(planDeclarationTransition(to, from)).reverse(), states(plan));
  assert.equal(JSON.stringify([from, to]), snapshot);
});

test('only terminal sorts are factored; sort before limit or aggregate stays in its pipeline', () => {
  const from = base.sort('x').toSpec();
  const to = base.y('other').sort('other').toSpec();
  const plan = planDeclarationTransition(from, to);
  assert.deepEqual(plan.stages.map(stage => stage.reason), ['remove-output-sort', 'change-state', 'apply-output-sort']);
  const pipeline = [{ sort: { field: 'x' } }, { limit: 1 }];
  const a = { ...base.toSpec(), transform: pipeline };
  const b = { ...base.y('other').toSpec(), transform: pipeline };
  assert.equal(planDeclarationTransition(a, b).stages.length, 1);
  const c = base.y('other').focus({ group: 'A' }).toSpec();
  for (const stage of planDeclarationTransition(a, c).stages) {
    if (stage.to.encoding.y.field === 'y') assert.deepEqual(stage.to.transform, pipeline);
  }
});

test('same attention is preserved and unsupported source changes use direct routes', () => {
  const from = base.focus({ group: 'A' }).toSpec();
  const to = base.y('other').focus({ group: 'A' }).toSpec();
  assert.equal(planDeclarationTransition(from, to).stages.length, 1);
  assert.equal(planDeclarationTransition(from, { ...to, data: { values: rows.slice(0, 1) } }).stages.length, 1);
  assert.equal(planDeclarationTransition(from, { ...to, mark: 'other' }).stages.length, 1);
});

test('JSON endpoints and equivalent authoring histories produce identical plans', () => {
  const a = base.y('other').y('y').focus({ group: 'A' }).toSpec();
  const b = base.y('other').toSpec();
  assert.deepEqual(planDeclarationTransition(a, b), planDeclarationTransition(
    JSON.parse(JSON.stringify(base.focus({ group: 'A' }).toSpec())), JSON.parse(JSON.stringify(b))
  ));
});

test('chart routes keep precedence and opt-in declaration stages are refined only once', () => {
  const a = base.focus({ group: 'A' }).toSpec();
  const b = base.y('other').highlight({ group: 'B' }).toSpec();
  assert.deepEqual(resolveIntermediateSpecs({ intermediateSpecs: () => [] }, a, b), []);
  const explicit = [{ spec: base.toSpec() }];
  assert.equal(resolveIntermediateSpecs({ declarationPlanning: true, intermediateSpecs: () => explicit }, a, b), explicit);
  let calls = 0;
  const waypoints = resolveIntermediateSpecs({ declarationPlanning: true, intermediateSpecs: () => { calls++; return []; } }, a, b);
  assert.equal(calls, 4);
  assert.equal(waypoints.length, 2);
  assert.deepEqual(waypoints.map(({ spec }) => spec), states(planDeclarationTransition(a, b)).slice(1, -1));
});
