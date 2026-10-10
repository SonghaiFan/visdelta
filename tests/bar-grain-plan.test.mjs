import test from 'node:test';
import assert from 'node:assert/strict';
import { bar, createBarGrainDeclarationOperationCodec } from '../dist/bar.js';
import { planDeclarationTransition } from '../dist/grammar/declaration-plan.js';
import { selectIntermediateRoute, selectTransitionRoute } from '../dist/charts/transition-route.js';
import { plugin as barPlugin } from '../dist/charts/bar/plugin.js';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { createDeclarationOperationCodec } from '../dist/grammar/declaration-operations.js';
import { serializeViewSpec, specScopes } from '../dist/spec-meta.js';

const data = [
  { state: 'A', age: 'young', region: 'north', population: 10 },
  { state: 'A', age: 'old', region: 'north', population: 20 },
  { state: 'B', age: 'young', region: 'south', population: 5 },
  { state: 'B', age: 'old', region: 'south', population: 15 }
];
const codec = createBarGrainDeclarationOperationCodec();
const total = () => bar(data).x('state').y('population', { title: 'Metric' }).rollup({ title: 'Metric' }).toSpec();
const stacked = () => bar(data).x('state').y('population', { title: 'Metric' }).breakdown('age', { title: 'Metric' }).toSpec();
const aggregate = spec => spec.transform.find(transform => transform.aggregate).aggregate;
function assertSingleOperationPerStage(plan) {
  for (const stage of plan.stages) {
    const from = codec.decompose(stage.from);
    const to = codec.decompose(stage.to);
    assert.equal(from.status, 'ok');
    assert.equal(to.status, 'ok');
    const before = new Map(from.value.map(operation => [operation.id, JSON.stringify(operation)]));
    const after = new Map(to.value.map(operation => [operation.id, JSON.stringify(operation)]));
    const ids = new Set([...before.keys(), ...after.keys()]);
    assert.equal([...ids].filter(id => before.get(id) !== after.get(id)).length, 1);
  }
}

test('focused detail merges before changing focus at the coarse grain and reverses the complete route', () => {
  for (const layout of ['stacked', 'grouped']) {
    for (const op of ['sum', 'mean']) {
      for (const focus of [undefined, { field: 'state', equal: 'B' }]) {
        const fineBuilder = bar(data).x('state').y('population', { title: 'Metric' })
          .breakdown('age', { op, title: 'Metric', layout }).color('#3366ff')
          .focus({ field: 'state', equal: 'A' });
        let coarseBuilder = bar(data).x('state').y('population', { title: 'Metric' })
          .rollup({ op, title: 'Metric' });
        if (focus) coarseBuilder = coarseBuilder.focus(focus);
        const fine = fineBuilder.toSpec();
        const coarse = coarseBuilder.toSpec();
        const unchanged = [serializeViewSpec(fine), serializeViewSpec(coarse)];
        const forward = planDeclarationTransition(fine, coarse, codec);
        assert.equal(forward.status, 'planned', forward.reason);
        assertSingleOperationPerStage(forward);
        for (const stage of forward.stages) {
          assert.equal(codec.validate(stage.from).status, 'ok');
          assert.equal(codec.validate(stage.to).status, 'ok');
          if (!sameFocus(stage.from, stage.to)) {
            assert.deepEqual(aggregate(stage.from).groupby, ['state']);
            assert.deepEqual(aggregate(stage.to).groupby, ['state']);
            assert.equal(stage.from.encoding.detail, undefined);
            assert.equal(stage.to.encoding.detail, undefined);
          }
        }
        const groupingIndex = forward.stages.findIndex(stage => stage.operation.id === '__visdeltaBarGrain/grouping');
        const focusIndex = forward.stages.findIndex(stage => !sameFocus(stage.from, stage.to));
        assert.ok(groupingIndex >= 0 && focusIndex > groupingIndex);
        const reverse = planDeclarationTransition(coarse, fine, codec);
        assert.equal(reverse.status, 'planned', reverse.reason);
        assertSingleOperationPerStage(reverse);
        assert.deepEqual(reverse.stages.map(stage => serializeViewSpec(stage.to)),
          forward.stages.slice().reverse().map(stage => serializeViewSpec(stage.from)));
        assert.deepEqual([serializeViewSpec(fine), serializeViewSpec(coarse)], unchanged);
      }
    }
  }
});

function sameFocus(from, to) {
  return JSON.stringify(specScopes(from).focus) === JSON.stringify(specScopes(to).focus);
}

test('Bar route focus constraint leaves unrelated pairs and valid detail states available', () => {
  const fine = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric' }).focus({ field: 'state', equal: 'A' }).toSpec();
  const otherFocus = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric' }).focus({ field: 'state', equal: 'B' }).toSpec();
  assert.equal(codec.validate(fine).status, 'ok');
  assert.equal(codec.validate(otherFocus).status, 'ok');
  assert.equal(codec.validateStep(fine, otherFocus, { from: fine, to: total() }).status, 'unsupported');
  assert.equal(codec.validateStep(fine, otherFocus, { from: fine, to: otherFocus }).status, 'ok');
  const sameGrain = planDeclarationTransition(fine, otherFocus, codec);
  assert.equal(sameGrain.status, 'planned');
  assert.equal(sameGrain.stages.length, 1);
  const otherCategory = bar(data).x('age').y('population', { title: 'Metric' })
    .rollup({ title: 'Metric' }).toSpec();
  assert.equal(codec.validateStep(fine, otherFocus, { from: fine, to: otherCategory }).status, 'ok');
});

test('detail-only focus cannot be preserved at coarse grain and keeps the ordinary Bar fallback', () => {
  const fine = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric' }).focus({ field: 'age', equal: 'young' }).toSpec();
  const coarse = total();
  assert.equal(codec.validate(fine).status, 'ok');
  assert.equal(codec.validate(coarse).status, 'ok');
  const plan = planDeclarationTransition(fine, coarse, codec);
  assert.equal(plan.status, 'unsupported');
  assert.deepEqual(plan.stages, []);
  const route = selectTransitionRoute(barPlugin.createChartType(DEFAULT_CHART_RUNTIME), fine, coarse);
  assert.equal(route.planning, 'unsupported');
  assert.equal(route.legs.length, 1);
  assert.deepEqual(serializeViewSpec(route.legs[0].from), serializeViewSpec(fine));
  assert.deepEqual(serializeViewSpec(route.legs[0].to), serializeViewSpec(coarse));
  assert.deepEqual(aggregate(coarse).groupby, ['state']);
  assert.equal(coarse.encoding.detail, undefined);
  assert.equal(coarse.encoding.color, undefined);
});

test('total to stacked is one complete grouping operation and reverses the same state exactly', () => {
  const from = total();
  const to = stacked();
  const forward = planDeclarationTransition(from, to, codec);
  const reverse = planDeclarationTransition(to, from, codec);
  assert.equal(forward.status, 'planned');
  assert.equal(forward.stages.length, 1);
  assert.equal(forward.stages[0].operation.id, '__visdeltaBarGrain/grouping');
  assert.deepEqual(aggregate(forward.stages[0].to).groupby, ['state', 'age']);
  assert.deepEqual(forward.stages[0].to.encoding.detail, { field: 'age', type: 'nominal' });
  assert.equal(forward.stages[0].to.encoding.xOffset, undefined);
  assertSingleOperationPerStage(forward);
  assert.equal(reverse.status, 'planned');
  assert.equal(reverse.stages.length, forward.stages.length);
  assert.deepEqual(serializeViewSpec(reverse.stages[0].to), serializeViewSpec(from));
});

test('stacked and grouped detail uses a grouped modifier with a matching offset field', () => {
  const from = stacked();
  const to = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric' }).layout('grouped').toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id), ['__visdeltaBarGrain/layout']);
  assert.ok(plan.stages.some(stage => stage.to.encoding.xOffset?.field === 'age'));
  assert.ok(plan.stages.every(stage => codec.validate(stage.to).status === 'ok'));
  assertSingleOperationPerStage(plan);
});

test('changing grouped detail fields is a grouping operation; grouped offset identity is derived', () => {
  const from = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric', layout: 'grouped' }).toSpec();
  const to = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('region', { title: 'Metric', layout: 'grouped' }).toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.id, '__visdeltaBarGrain/grouping');
  assert.equal(plan.stages[0].to.encoding.xOffset.field, 'region');
  assertSingleOperationPerStage(plan);
});

test('horizontal Grain plans keep category and measure axes and use yOffset for grouped layout', () => {
  const from = bar(data).x('state').y('population', { title: 'Metric' }).rollup({ title: 'Metric' }).flip().toSpec();
  const to = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric', layout: 'grouped' }).flip().toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 2);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id), [
    '__visdeltaBarGrain/grouping', '__visdeltaBarGrain/layout'
  ]);
  assert.ok(plan.stages.every(stage => codec.validate(stage.to).status === 'ok'));
  assertSingleOperationPerStage(plan);
  assert.equal(plan.stages.at(-1).to.encoding.yOffset.field, 'age');
  assert.equal(plan.stages.at(-1).to.encoding.xOffset, undefined);

  const vertical = total();
  const reoriented = bar(data).x('state').y('population', { title: 'Metric' }).rollup({ title: 'Metric' }).flip().toSpec();
  assert.equal(planDeclarationTransition(vertical, reoriented, codec).status, 'unsupported');

  const horizontalTarget = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric' }).layout('grouped').color('#3366ff').flip().toSpec();
  const horizontalComposite = planDeclarationTransition(reoriented, horizontalTarget, codec);
  assert.equal(horizontalComposite.status, 'planned');
  assert.deepEqual(horizontalComposite.stages.map(stage => stage.operation.id), [
    '__visdeltaBarGrain/grouping', '__visdeltaBarGrain/layout', 'encoding/color'
  ]);
  assertSingleOperationPerStage(horizontalComposite);
});

test('reducer and output alias update as one measure operation when presentation is held constant', () => {
  const from = total();
  const to = bar(data).x('state').y('population', { title: 'Metric' })
    .rollup({ op: 'mean', title: 'Metric' }).toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.id, '__visdeltaBarGrain/measure');
  assert.equal(aggregate(plan.stages[0].to).fields[0].op, 'mean');
});

test('a valid measure alias updates its y binding atomically, while a groupby collision is unsupported', () => {
  const from = total();
  const to = total();
  to.transform[0].aggregate.fields[0].as = 'total_population';
  to.encoding.y.field = 'total_population';
  to.meta.object.semantic.measure.value = 'total_population';
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.id, '__visdeltaBarGrain/measure');
  assert.equal(plan.stages[0].to.encoding.y.field, 'total_population');

  const collision = total();
  collision.transform[0].aggregate.fields[0].as = 'state';
  collision.encoding.y.field = 'state';
  collision.meta.object.semantic.measure.value = 'state';
  assert.equal(codec.validate(collision).status, 'unsupported');
});

test('combined grain, grouped layout, and constant color changes only produce valid complete states', () => {
  const from = total();
  const to = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric', layout: 'grouped' }).color('#3366ff').toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 3);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id), [
    '__visdeltaBarGrain/grouping', '__visdeltaBarGrain/layout', 'encoding/color'
  ]);
  assert.ok(plan.stages.some(stage => stage.operation.id === '__visdeltaBarGrain/grouping'));
  assert.ok(plan.stages.some(stage => stage.operation.id === '__visdeltaBarGrain/layout'));
  assert.ok(plan.stages.every(stage => codec.validate(stage.to).status === 'ok'));
  assertSingleOperationPerStage(plan);
});

test('equivalent histories produce the same deterministic route', () => {
  const from = total();
  const targetA = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric', layout: 'grouped' }).color('#3366ff').toSpec();
  const targetB = bar(data).x('state').y('population', { title: 'Metric' }).color('#3366ff')
    .breakdown('age', { title: 'Metric', layout: 'grouped' }).toSpec();
  const a = planDeclarationTransition(from, targetA, codec);
  const b = planDeclarationTransition(from, targetB, codec);
  assert.equal(a.status, 'planned');
  assert.equal(b.status, 'planned');
  assert.deepEqual(a.stages.map(stage => stage.operation.id), b.stages.map(stage => stage.operation.id));
  assert.deepEqual(a.stages.map(stage => serializeViewSpec(stage.to)), b.stages.map(stage => serializeViewSpec(stage.to)));
});

test('unsafe explicit Bar key and field references outside aggregate output are unsupported', () => {
  const wrongKey = bar(data).x('state').y('population').rollup().key('age').toSpec();
  assert.equal(codec.validate(wrongKey).status, 'unsupported');
  const badColor = bar(data).x('state').y('population').rollup().color('age').toSpec();
  assert.equal(codec.validate(badColor).status, 'unsupported');
  const badFocus = bar(data).x('state').y('population').rollup().focus({ field: 'age', equal: 'young' }).toSpec();
  assert.equal(codec.validate(badFocus).status, 'unsupported');
  const badAlias = bar(data).x('state').y('population').rollup({ as: 'total' }).toSpec();
  assert.equal(codec.validate(badAlias).status, 'unsupported');
  const unresolved = bar({ url: 'records.json' }).x('state').y('population').rollup().toSpec();
  assert.equal(codec.validate(unresolved).status, 'unsupported');
});

test('aggregate anchor keeps its authored transform position; wide and multi-aggregate forms stay unsupported', () => {
  const base = total();
  const ordered = { ...base, transform: [
    { filter: { field: 'state', oneOf: ['A', 'B'] } },
    base.transform[0],
    { sort: { field: 'population', order: 'descending' } }
  ] };
  const reordered = bar(data).x('state').y('population', { title: 'Metric' }).breakdown('age', { title: 'Metric' }).toSpec();
  reordered.transform = [ordered.transform[0], reordered.transform[0], ordered.transform[2]];
  const plan = planDeclarationTransition(ordered, reordered, codec);
  assert.equal(plan.status, 'planned');
  assert.ok(plan.stages.every(stage => stage.to.transform.findIndex(item => item.aggregate) === 1));

  const multi = { ...base, transform: [...base.transform, { aggregate: { groupby: ['state'], fields: [{ op: 'count', as: 'n' }] } }] };
  assert.equal(codec.decompose(multi).status, 'unsupported');
  const wide = bar(data).x('state').y('population').breakdown('type', { fields: ['age', 'population'] }).toSpec();
  assert.equal(codec.validate(wide).status, 'unsupported');
});

test('before-chart planning handles direct states without calling authored routes and falls back on unsupported grains', () => {
  let calls = 0;
  const policy = {
    declarationPlanning: true,
    declarationPlanningOrder: 'before-chart',
    declarationOperations: codec,
    intermediateSpecs: () => { calls += 1; return [{ spec: stacked() }]; }
  };
  const direct = selectIntermediateRoute(policy, total(), total());
  assert.equal(direct.planning, 'direct');
  assert.equal(calls, 0);
  const unsupported = { ...total(), transform: [...total().transform, { aggregate: { groupby: ['state'], fields: [{ op: 'count', as: 'n' }] } }] };
  const fallback = selectIntermediateRoute(policy, unsupported, stacked());
  assert.equal(fallback.planning, 'authored');
  assert.equal(calls, 1);
  assert.equal(fallback.waypoints.length, 1);
});

test('before-chart planning refines each planned leg exactly once', () => {
  let calls = 0;
  const policy = {
    declarationPlanning: true,
    declarationPlanningOrder: 'before-chart',
    declarationOperations: codec,
    intermediateSpecs: () => { calls += 1; return []; }
  };
  const target = bar(data).x('state').y('population', { title: 'Metric' })
    .breakdown('age', { title: 'Metric', layout: 'grouped' }).color('#3366ff').toSpec();
  const route = selectIntermediateRoute(policy, total(), target);
  const plan = planDeclarationTransition(total(), target, codec);
  assert.equal(route.planning, 'planned');
  assert.equal(calls, plan.stages.length);
});

test('before-chart planning falls back when bounded search reaches its state limit', () => {
  const flags = Array.from({ length: 12 }, (_, index) => `flag${index}`);
  const searchCodec = createDeclarationOperationCodec({ allowedRoots: ['mark', ...flags] });
  const from = { mark: 'custom', ...Object.fromEntries(flags.map(flag => [flag, false])) };
  const to = { mark: 'custom', ...Object.fromEntries(flags.map(flag => [flag, true])) };
  assert.equal(planDeclarationTransition(from, to, searchCodec).status, 'search-limit');
  let calls = 0;
  const route = selectIntermediateRoute({
    declarationPlanning: true,
    declarationPlanningOrder: 'before-chart',
    declarationOperations: searchCodec,
    intermediateSpecs: () => { calls += 1; return [{ spec: { ...from, flag0: true } }]; }
  }, from, to);
  assert.equal(route.planning, 'authored');
  assert.equal(calls, 1);
});
