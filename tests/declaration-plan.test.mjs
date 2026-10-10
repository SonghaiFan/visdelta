import test from 'node:test';
import assert from 'node:assert/strict';
import { planDeclarationTransition } from '../dist/core.js';
import { bar } from '../dist/bar.js';
import { createDeclarationOperationCodec, stableValueKey } from '../dist/grammar/declaration-operations.js';
import { semanticToMeta } from '../dist/spec-meta.js';
import { plugin as barPlugin } from '../dist/charts/bar/plugin.js';
import { DEFAULT_CHART_RUNTIME } from '../dist/runtime/chart-runtime.js';
import { createChartTypeRegistry } from '../dist/charts/index.js';
import { createViewRenderer, prepareChartSpec } from '../dist/runtime/view-renderer.js';
import { selectTransitionRoute } from '../dist/charts/transition-route.js';
import { semanticKeyFromEncoding } from '../dist/charts/bar/compile.js';
import { plugin as pointPlugin } from '../dist/charts/point/plugin.js';
import { plugin as linePlugin } from '../dist/charts/line/plugin.js';
import { plugin as areaPlugin } from '../dist/charts/area/plugin.js';
import { areaGrainError } from '../dist/charts/area/grain.js';
import { applyTransforms } from '../dist/data/transforms.js';
import { plugin as unitPlugin } from '../dist/charts/unit/plugin.js';
import { unit } from '../dist/unit.js';

const rows = [
  { id: 'a', group: 'A', x: 1, y: 2, other: 4 },
  { id: 'b', group: 'B', x: 3, y: 5, other: 2 }
];
const chartType = barPlugin.createChartType(DEFAULT_CHART_RUNTIME);
const base = bar(rows).datumKey('id').x('group').y('y');
const codec = chartType.declarationOperations;
const ops = (spec) => {
  const result = codec.decompose(spec);
  assert.equal(result.status, 'ok', result.reason);
  return result.value;
};

test('Area planning rejects duplicate single-grain endpoints and unresolved sources', () => {
  const areaCodec = areaPlugin.createChartType(DEFAULT_CHART_RUNTIME).declarationOperations;
  const duplicate = {
    mark: 'area', data: { values: [{ x: 1, y: 2 }, { x: 1, y: 3 }] },
    encoding: { x: { field: 'x' }, y: { field: 'y' } }
  };
  const invalid = areaCodec.decompose(duplicate);
  assert.equal(invalid.status, 'unsupported');
  assert.match(invalid.reason, /one value per x/);

  const unresolved = areaCodec.decompose({
    mark: 'area', data: { url: '/values.json' },
    encoding: { x: { field: 'x' }, y: { field: 'y' } }
  });
  assert.equal(unresolved.status, 'unsupported');
  assert.match(unresolved.reason, /inline data/);
});

test('Area accepts duplicate source x values when transforms make the plotted grain unique', () => {
  const areaCodec = areaPlugin.createChartType(DEFAULT_CHART_RUNTIME).declarationOperations;
  const filtered = {
    mark: 'area',
    data: { values: [
      { x: 1, y: 2, group: 'keep' }, { x: 1, y: 3, group: 'drop' },
      { x: 2, y: 4, group: 'keep' }, { x: 2, y: 5, group: 'drop' }
    ] },
    encoding: { x: { field: 'x' }, y: { field: 'y' } },
    transform: [{ filter: { field: 'group', equal: 'keep' } }]
  };
  assert.equal(areaCodec.decompose(filtered).status, 'ok');

  const target = {
    ...filtered,
    encoding: { ...filtered.encoding, color: { value: '#3366ff' } },
    meta: { state: { scopes: { highlight: { mode: 'highlight', filter: { field: 'group', equal: 'keep' } } } } }
  };
  const plan = planDeclarationTransition(filtered, target, areaCodec);
  assert.equal(plan.status, 'planned', plan.reason);
  for (const state of [filtered, ...plan.stages.map(stage => stage.to)]) {
    const source = state.data.values;
    const rows = applyTransforms(source, state.transform ?? []);
    assert.equal(areaGrainError(state, rows), null);
  }
});

test('Bar field-to-constant color is one complete atomic channel update', () => {
  const from = base.color('group').toSpec();
  const to = base.color('#ff0000').toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.action, 'update');
  assert.deepEqual(plan.stages[0].operation.previous.path, ['encoding', 'color']);
  assert.deepEqual(plan.stages[0].operation.next.value.value, { value: '#ff0000' });
  assert.deepEqual(plan.stages[0].to, to);
});

test('Bar channel parameter edits are complete and synchronize derived semantic identity', () => {
  const from = base.toSpec();
  const to = base.y({ field: 'other', type: 'quantitative', title: 'Other', format: '.2f' }).toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  for (const state of [from, ...plan.stages.map(stage => stage.to)]) {
    const serializedEncoding = state.encoding ?? {};
    assert.deepEqual(state.meta.object.semantic,
      semanticToMeta(semanticKeyFromEncoding(serializedEncoding, null)));
    assert.ok(state.encoding?.x && state.encoding?.y);
  }
  assert.deepEqual(plan.stages.at(-1).to, to);
});

test('Bar flip cannot route through an invalid single-axis category/measure state', () => {
  const from = prepareChartSpec(chartType, base.toSpec());
  const to = prepareChartSpec(chartType, base.flip().toSpec());
  assert.ok(from && to);
  assert.equal(codec.validate(from).status, 'ok');
  assert.equal(codec.validate(to).status, 'ok');

  const bothDiscrete = structuredClone(from);
  bothDiscrete.encoding.y.type = 'nominal';
  assert.equal(codec.validate(bothDiscrete).status, 'unsupported');
  assert.match(codec.validate(bothDiscrete).reason, /one nominal or ordinal category axis and one quantitative measure axis/);

  const bothQuantitative = structuredClone(from);
  bothQuantitative.encoding.x.type = 'quantitative';
  assert.equal(codec.validate(bothQuantitative).status, 'unsupported');
  assert.match(codec.validate(bothQuantitative).reason, /one nominal or ordinal category axis and one quantitative measure axis/);

  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'unsupported');
  assert.equal(plan.stages.length, 0);

  const route = selectTransitionRoute(chartType, from, to);
  assert.equal(route.planning, 'unsupported');
  assert.equal(route.legs.length, 1);
  assert.equal(route.legs[0].from, from);
  assert.equal(route.legs[0].to, to);
});

test('focus and highlight are separate complete scope operations', () => {
  const from = base.focus({ group: 'A' }).toSpec();
  const to = base.highlight({ group: 'A' }).toSpec();
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 2);
  assert.deepEqual(plan.stages.map(stage => stage.operation.action).sort(), ['delete', 'insert']);
  assert.deepEqual(plan.stages.map(stage => stage.operation.id).sort(), [
    'meta/state/scopes/focus', 'meta/state/scopes/highlight'
  ]);
});

test('ordered transform identities do not depend on array indexes', () => {
  const from = { mark: 'bar', data: { values: rows }, encoding: { x: { field: 'group' }, y: { field: 'y' } }, transform: [
    { filter: { field: 'group', equal: 'A' } },
    { sort: { field: 'x', order: 'ascending' } },
    { timeUnit: { field: 'x', unit: 'month', as: 'month' } }
  ] };
  const to = { ...from, transform: [from.transform[2]] };
  const plan = planDeclarationTransition(from, to, codec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 2);
  assert.deepEqual(plan.stages.map(stage => stage.operation.action), ['delete', 'delete']);
  assert.ok(plan.stages.every(stage => stage.operation.id !== 'transform:0'));
  assert.deepEqual(plan.stages.at(-1).to.transform, to.transform);
});

const peerCases = [
  ['Point', pointPlugin, { mark: 'point', encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { value: '#ff0000' } } }],
  ['Line', linePlugin, { mark: 'line', encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { value: '#ff0000' } } }],
  ['Area', areaPlugin, { mark: 'area', encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { value: '#ff0000' } } }],
  ['Unit', unitPlugin, unit(rows).layout('grid').radius(12).color('group').toSpec()]
].map(([name, plugin, state]) => [name, plugin.createChartType(DEFAULT_CHART_RUNTIME).declarationOperations, state]);

for (const [name, peerCodec, state] of peerCases) {
  test(`${name} canonical codec makes one complete color operation and reversible compound attention path`, () => {
    const from = { ...state, data: state.data ?? { values: rows } };
    const to = { ...from, encoding: { ...from.encoding, color: { value: '#3366ff' } } };
    const colorPlan = planDeclarationTransition(from, to, peerCodec);
    assert.equal(colorPlan.status, 'planned', colorPlan.reason);
    assert.equal(colorPlan.stages.length, 1);
    assert.deepEqual(colorPlan.stages[0].operation.next.value.value, { value: '#3366ff' });

    const attentionFrom = { ...from, meta: { state: { scopes: { focus: { mode: 'focus', filters: [{ field: 'group', equal: 'A' }] } } } } };
    const attentionTo = { ...from, encoding: { ...from.encoding, color: { value: '#3366ff' } }, meta: { state: { scopes: { highlight: { mode: 'highlight', filters: [{ field: 'group', equal: 'A' }] } } } } };
    const forward = planDeclarationTransition(attentionFrom, attentionTo, peerCodec);
    const reverse = planDeclarationTransition(attentionTo, attentionFrom, peerCodec);
    assert.equal(forward.status, 'planned', forward.reason);
    assert.equal(reverse.status, 'planned', reverse.reason);
    assert.deepEqual(reverse.stages.map(stage => [stage.from, stage.to]), forward.stages.slice().reverse().map(stage => [stage.to, stage.from]));
    assert.equal(forward.stages.length, 3);
    for (const stage of forward.stages) {
      assert.equal(peerCodec.validate(stage.from).status, 'ok');
      assert.equal(peerCodec.validate(stage.to).status, 'ok');
      const left = new Map(peerCodec.decompose(stage.from).value.map(operation => [operation.id, JSON.stringify(operation)]));
      const right = new Map(peerCodec.decompose(stage.to).value.map(operation => [operation.id, JSON.stringify(operation)]));
      assert.equal([...new Set([...left.keys(), ...right.keys()])].filter(id => left.get(id) !== right.get(id)).length, 1);
    }
    const normalizedTarget = peerCodec.normalize(attentionTo);
    assert.equal(normalizedTarget.status, 'ok', normalizedTarget.reason);
    assert.deepEqual(forward.stages.at(-1).to, normalizedTarget.value);
  });
}

test('canonical metadata aliases produce the same Point declaration state', () => {
  const peerCodec = peerCases[0][1];
  const source = { mark: 'point', data: { values: rows }, encoding: { x: { field: 'x' }, y: { field: 'y' } }, key: 'id' };
  const target = { mark: 'point', data: { values: rows }, encoding: { x: { field: 'x' }, y: { field: 'y' } }, meta: { object: { key: 'id' } } };
  const plan = planDeclarationTransition(source, target, peerCodec);
  assert.equal(plan.status, 'direct');
  assert.equal(plan.stages.length, 0);
});

test('peer codecs reject invalid transforms, malformed scopes, and missing multi-sort fields', () => {
  const [name, peerCodec, state] = peerCases[0];
  const base = { ...state, data: { values: rows } };
  for (const transform of [
    { timeUnit: { field: 'x', unit: 'year' } },
    { sort: { field: 'x', order: 'sideways' } },
    { filter: { field: 'x', unsupported: true } },
    { sort: { fields: ['missing'] } }
  ]) {
    const invalid = peerCodec.validate({ ...base, transform: [transform] });
    assert.equal(invalid.status, 'unsupported', `${name}: ${JSON.stringify(transform)}`);
  }
  const malformedScope = peerCodec.validate({ ...base, meta: { state: { scopes: { focus: { mode: 'highlight', filters: [{ field: 'x', equal: 1 }] } } } } });
  assert.equal(malformedScope.status, 'unsupported');
});

test('Unit canonical planning supports independent grouping, quantity, unit value and layout changes', () => {
  const peerCodec = peerCases[3][1];
  const builder = unit(rows).layout('grid').radius(12).color('group');
  const from = builder.toSpec();
  const valued = builder.value('y').toSpec();
  for (const [source, target, id] of [
    [from, builder.group('group').toSpec(), 'meta/unit/group'],
    [from, valued, 'meta/unit/value'],
    [valued, builder.value('y', { unitValue: 2 }).toSpec(), 'meta/unit/unitValue'],
    [from, builder.layout('force').toSpec(), 'meta/unit/layout']
  ]) {
    assert.equal(peerCodec.validate(target).status, 'ok');
    const forward = planDeclarationTransition(source, target, peerCodec);
    const reverse = planDeclarationTransition(target, source, peerCodec);
    assert.equal(forward.status, 'planned', forward.reason);
    assert.equal(forward.stages.length, 1);
    assert.equal(forward.stages[0].operation.id, id);
    assert.equal(peerCodec.validate(forward.stages[0].from).status, 'ok');
    assert.equal(peerCodec.validate(forward.stages[0].to).status, 'ok');
    assert.deepEqual(forward.stages[0].to, peerCodec.normalize(target).value);
    assert.equal(reverse.status, 'planned', reverse.reason);
    assert.deepEqual(reverse.stages.map(stage => [stage.from, stage.to]), forward.stages.slice().reverse().map(stage => [stage.to, stage.from]));
    const left = new Map(peerCodec.decompose(forward.stages[0].from).value.map(operation => [operation.id, JSON.stringify(operation)]));
    const right = new Map(peerCodec.decompose(forward.stages[0].to).value.map(operation => [operation.id, JSON.stringify(operation)]));
    assert.equal([...new Set([...left.keys(), ...right.keys()])].filter(key => left.get(key) !== right.get(key)).length, 1);
  }
  const sized = unit(rows).layout('grid').size('x').toSpec();
  assert.equal(peerCodec.validate(sized).status, 'unsupported');
  const invalidLayout = { ...from, meta: { ...from.meta, unit: { layout: 'bogus' }, state: { sceneState: { axis: { layout: 'bogus' } } } } };
  assert.equal(peerCodec.validate(invalidLayout).status, 'unsupported');
  assert.equal(peerCodec.validate(builder.layout('bar').toSpec()).status, 'unsupported');
  assert.equal(peerCodec.validate(builder.layout('beeswarm').toSpec()).status, 'unsupported');
});

test('sequence order and duplicate transforms are retained', () => {
  const filter = { filter: { field: 'group', equal: 'A' } };
  const from = { mark: 'bar', data: { values: rows }, encoding: { x: { field: 'group' }, y: { field: 'y' } }, transform: [filter, filter] };
  const genericCodec = createDeclarationOperationCodec();
  const result = genericCodec.decompose(from);
  assert.equal(result.status, 'ok');
  assert.notEqual(result.value[0].id, result.value[1].id);
  assert.deepEqual(result.value.filter(op => op.sequence === 'transform').map(op => op.value.value), [filter, filter]);
  const applied = genericCodec.evaluate(from, result.value);
  assert.equal(applied.status, 'ok');
  assert.deepEqual(applied.value.transform, [filter, filter]);
});

test('a transform parameter change is one stable sequence update', () => {
  const genericCodec = createDeclarationOperationCodec();
  const from = { mark: 'custom', transform: [{ filter: { field: 'group', equal: 'A' } }] };
  const to = { mark: 'custom', transform: [{ filter: { field: 'group', equal: 'B' } }] };
  const plan = planDeclarationTransition(from, to, genericCodec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.action, 'update');
  assert.notEqual(plan.stages[0].operation.previous.id, plan.stages[0].operation.next.id);
  assert.deepEqual(plan.stages[0].to.transform, to.transform);
});

test('Core preserves opaque IDs from a custom ordered-sequence codec', () => {
  const customCodec = {
    decompose(spec) {
      return { status: 'ok', value: (spec.calls ?? []).map(value => ({
        id: `step-${value}`, path: ['calls'], sequence: 'custom-steps', value: { present: true, value }
      })) };
    },
    evaluate(template, operations) {
      return { status: 'ok', value: { ...template, calls: operations.filter(operation => operation.sequence === 'custom-steps').map(operation => operation.value.value) } };
    },
    normalize(spec) { return { status: 'ok', value: spec }; },
    validate(spec) { return spec.mark === 'custom' ? { status: 'ok', value: undefined } : { status: 'unsupported', reason: 'wrong mark' }; }
  };
  const from = { mark: 'custom', calls: ['A'] };
  const to = { mark: 'custom', calls: ['B'] };
  const plan = planDeclarationTransition(from, to, customCodec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.action, 'update');
  assert.equal(plan.stages[0].operation.previous.id, 'step-A');
  assert.equal(plan.stages[0].operation.next.id, 'step-B');
  const reverse = planDeclarationTransition(to, from, customCodec);
  assert.equal(reverse.stages[0].operation.previous.id, 'step-B');
  assert.equal(reverse.stages[0].operation.next.id, 'step-A');
});

test('sequence alignment retains the matching later call and deletes the unmatched earlier call', () => {
  const genericCodec = createDeclarationOperationCodec();
  const filterA = { filter: { field: 'group', equal: 'A' } };
  const filterB = { filter: { field: 'group', equal: 'B' } };
  const from = { mark: 'custom', transform: [filterA, { sort: { field: 'x' } }, filterB] };
  const to = { mark: 'custom', transform: [filterB] };
  const plan = planDeclarationTransition(from, to, genericCodec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 2);
  assert.deepEqual(plan.stages.map(stage => stage.operation.action), ['delete', 'delete']);
  assert.deepEqual(plan.stages.at(-1).to.transform, [filterB]);
});

test('a duplicate transform can be added with one in-place parameter update', () => {
  const genericCodec = createDeclarationOperationCodec();
  const filterA = { filter: { field: 'group', equal: 'A' } };
  const filterB = { filter: { field: 'group', equal: 'B' } };
  const from = { mark: 'custom', transform: [filterA, filterB] };
  const to = { mark: 'custom', transform: [filterB, filterB] };
  const plan = planDeclarationTransition(from, to, genericCodec);
  assert.equal(plan.status, 'planned');
  assert.equal(plan.stages.length, 1);
  assert.equal(plan.stages[0].operation.action, 'update');
  assert.deepEqual(plan.stages[0].to.transform, to.transform);
});

test('the last transform can be deleted, duplicated calls canonicalize, and reverse indexes invert', () => {
  const genericCodec = createDeclarationOperationCodec();
  const filter = { filter: { field: 'group', equal: 'A' } };
  const only = { mark: 'custom', transform: [filter] };
  const empty = { mark: 'custom' };
  const deletion = planDeclarationTransition(only, empty, genericCodec);
  assert.equal(deletion.status, 'planned');
  assert.equal(deletion.stages.length, 1);
  assert.equal(deletion.stages[0].operation.action, 'delete');
  assert.equal(deletion.stages[0].operation.fromIndex, 0);
  const insertion = planDeclarationTransition(empty, only, genericCodec);
  assert.equal(insertion.status, 'planned');
  assert.equal(insertion.stages[0].operation.action, 'insert');
  assert.equal(insertion.stages[0].operation.toIndex, deletion.stages[0].operation.fromIndex);

  const duplicates = { mark: 'custom', transform: [filter, filter] };
  const one = planDeclarationTransition(duplicates, only, genericCodec);
  assert.equal(one.status, 'planned');
  assert.equal(one.stages.length, 1);
  assert.equal(one.stages[0].operation.action, 'delete');
  assert.equal(one.stages[0].operation.fromIndex, 1);
});

test('an empty transform sequence is a valid temporary state for a gated route', () => {
  const filter = { filter: { field: 'group', equal: 'A' } };
  const gateCodec = createDeclarationOperationCodec({
    allowedRoots: ['mark', 'a', 'b', 'transform'],
    validate(spec) {
      if (spec.transform?.length && spec.a !== spec.b) return 'transform blocks unequal values';
    }
  });
  const from = { mark: 'custom', a: 0, b: 0, transform: [filter] };
  const to = { mark: 'custom', a: 1, b: 1, transform: [filter] };
  const plan = planDeclarationTransition(from, to, gateCodec);
  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.stages.map(stage => stage.operation.action), ['delete', 'update', 'update', 'insert']);
  assert.deepEqual(plan.stages.at(-1).to.transform, [filter]);
});

test('BFS uses valid temporary states and reverses the same canonical route', () => {
  const gateCodec = createDeclarationOperationCodec({
    allowedRoots: ['mark', 'a', 'b', 'gate'],
    validate(spec) {
      if (spec.gate === true && spec.a !== spec.b) return 'gate blocks unequal updates';
    }
  });
  const from = { mark: 'custom', a: 0, b: 0, gate: true };
  const to = { mark: 'custom', a: 1, b: 1, gate: true };
  const forward = planDeclarationTransition(from, to, gateCodec);
  assert.equal(forward.status, 'planned');
  assert.deepEqual(forward.stages.map(stage => stage.operation.action), ['delete', 'update', 'update', 'insert']);
  for (const stage of forward.stages) {
    const evaluated = gateCodec.evaluate(stage.from, gateCodec.decompose(stage.to).value);
    assert.equal(evaluated.status, 'ok');
    assert.deepEqual(evaluated.value, stage.to);
  }
  const backward = planDeclarationTransition(to, from, gateCodec);
  assert.equal(backward.status, 'planned');
  assert.deepEqual(backward.stages.map(stage => stage.to), forward.stages.slice().reverse().map(stage => stage.from));
  for (const stage of backward.stages) {
    const previous = stage.operation.previous;
    const next = stage.operation.next;
    const before = gateCodec.decompose(stage.from).value;
    const after = gateCodec.decompose(stage.to).value;
    if (stage.operation.action === 'insert') {
      assert.ok(after.some(operation => operation.id === next?.id));
      assert.ok(!before.some(operation => operation.id === next?.id));
    } else if (stage.operation.action === 'delete') {
      assert.ok(before.some(operation => operation.id === previous?.id));
      assert.ok(!after.some(operation => operation.id === previous?.id));
    } else {
      assert.ok(before.some(operation => operation.id === previous?.id));
      assert.ok(after.some(operation => operation.id === next?.id));
    }
  }
});

test('search limit counts distinct valid states and keeps an already-enqueued goal', () => {
  const simple = createDeclarationOperationCodec({ allowedRoots: ['mark', 'a'] });
  const result = planDeclarationTransition({ mark: 'custom', a: 0 }, { mark: 'custom', a: 1 }, simple, { maxSearchStates: 2 });
  assert.equal(result.status, 'planned');
  assert.equal(result.stages.length, 1);
});

test('codec step constraints reject edges between valid states and reuse stable canonical endpoints in reverse', () => {
  const ordinary = createDeclarationOperationCodec({
    allowedRoots: ['mark', 'a', 'b'],
    validate(spec) {
      if (typeof spec.a !== 'number' || typeof spec.b !== 'number') return 'both slots are required';
    }
  });
  const calls = [];
  const constrained = {
    ...ordinary,
    validateStep(from, to, endpoints) {
      assert.equal(ordinary.validate(from).status, 'ok');
      assert.equal(ordinary.validate(to).status, 'ok');
      assert.equal(ordinary.decompose(to).status, 'ok');
      const rejected = from.a !== to.a && (from.b !== endpoints.to.b || to.b !== endpoints.to.b);
      calls.push({ from, to, endpoints, rejected });
      return rejected ? { status: 'unsupported', reason: 'change b before a' } : { status: 'ok', value: undefined };
    }
  };
  const from = { mark: 'custom', a: 0, b: 0 };
  const to = { mark: 'custom', a: 1, b: 1 };
  const unconstrained = planDeclarationTransition(from, to, ordinary);
  assert.deepEqual(unconstrained.stages.map(stage => stage.operation.id), ['a', 'b']);
  const forward = planDeclarationTransition(from, to, constrained);
  assert.equal(forward.status, 'planned');
  assert.deepEqual(forward.stages.map(stage => stage.operation.id), ['b', 'a']);
  assert.ok(calls.some(call => call.rejected));
  assert.ok(calls.some(call => !call.rejected));
  assert.ok(calls.every(call => call.endpoints === calls[0].endpoints));
  const canonicalEndpoints = calls[0].endpoints;
  calls.length = 0;
  const reverse = planDeclarationTransition(to, from, constrained);
  assert.equal(reverse.status, 'planned');
  assert.deepEqual(reverse.stages.map(stage => stage.to), forward.stages.slice().reverse().map(stage => stage.from));
  assert.ok(calls.every(call => call.endpoints === calls[0].endpoints));
  assert.deepEqual(calls[0].endpoints, canonicalEndpoints);
});

test('rejecting every valid route edge yields unsupported without invalidating endpoints', () => {
  const ordinary = createDeclarationOperationCodec({ allowedRoots: ['mark', 'width'] });
  const from = { mark: 'custom', width: 1 };
  const to = { mark: 'custom', width: 2 };
  const constrained = { ...ordinary, validateStep() { return { status: 'unsupported', reason: 'blocked route edge' }; } };
  assert.equal(constrained.validate(from).status, 'ok');
  assert.equal(constrained.validate(to).status, 'ok');
  const plan = planDeclarationTransition(from, to, constrained);
  assert.equal(plan.status, 'unsupported');
  assert.deepEqual(plan.stages, []);
});

test('codec operations must reconstruct complete endpoints from one shared template', () => {
  const partialCodec = createDeclarationOperationCodec({
    allowedRoots: ['mark', 'width', 'flag'],
    // Deliberately broken: it claims a valid operation but never applies flag.
    sequences: [],
    validate: () => undefined
  });
  const endpointCodec = {
    ...partialCodec,
    decompose(spec) {
      const width = partialCodec.decompose(spec);
      return width.status === 'ok'
        ? { status: 'ok', value: width.value.filter(operation => operation.id === 'width') }
        : width;
    },
    evaluate(template, operations) {
      const width = operations.find(operation => operation.id === 'width');
      return { status: 'ok', value: { ...template, width: width?.value.value } };
    }
  };
  const result = planDeclarationTransition(
    { mark: 'custom', width: 1, flag: 'A' },
    { mark: 'custom', width: 2, flag: 'B' },
    endpointCodec
  );
  assert.equal(result.status, 'unsupported');
  assert.match(result.reason, /complete normalized target/);
});

test('Core invokes the public validator on normalized codec endpoints', () => {
  const validCodec = createDeclarationOperationCodec({ allowedRoots: ['mark', 'width'] });
  const rejectingCodec = {
    ...validCodec,
    validate() { return { status: 'unsupported', reason: 'rejected by public codec validator' }; }
  };
  const result = planDeclarationTransition(
    { mark: 'custom', width: 1 }, { mark: 'custom', width: 2 }, rejectingCodec
  );
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason, 'rejected by public codec validator');
});

test('unsupported codec states retain their reason and unknown Bar config is unsupported', () => {
  const unsupported = codec.decompose({ ...base.toSpec(), extraConfig: true });
  assert.deepEqual(unsupported, { status: 'unsupported', reason: 'unsupported declaration field: extraConfig' });
  const invalid = codec.decompose({ mark: 'bar', data: { values: rows }, encoding: { x: { field: 'group' }, y: { field: 'missing' } } });
  assert.equal(invalid.status, 'unsupported');
  assert.match(invalid.reason, /unknown inline-data field/);
  assert.equal(planDeclarationTransition(base.toSpec(), { ...base.toSpec(), extraConfig: true }, codec).status, 'unsupported');
  assert.equal(codec.decompose({ ...base.toSpec(), encoding: { ...base.toSpec().encoding, unknownChannel: { field: 'group' } } }).status, 'unsupported');
  assert.equal(codec.decompose({ ...base.toSpec(), encoding: { ...base.toSpec().encoding, color: { value: { hex: '#fff' } } } }).status, 'unsupported');
  const authoredConflict = structuredClone(base.toSpec());
  authoredConflict.meta.object.semantic.measure = { value: 'other' };
  assert.equal(codec.normalize(authoredConflict).status, 'unsupported');
});

test('unsafe declaration paths and non-JSON values fail, while data records remain opaque', () => {
  const unsafe = { ...base.toSpec(), data: { values: [JSON.parse('{"id":"a","group":"A","y":2,"__proto__":{"x":1}}')] } };
  const opaque = codec.decompose(unsafe);
  assert.equal(opaque.status, 'ok');
  assert.equal(planDeclarationTransition(unsafe, unsafe, codec).status, 'direct');
  const unsafeConfig = JSON.parse('{"mark":"bar","encoding":{"x":{"field":"group"},"y":{"field":"y"},"constructor":{"x":1}}}');
  assert.equal(codec.decompose(unsafeConfig).status, 'unsupported');
  assert.equal(codec.decompose({ ...base.toSpec(), encoding: { ...base.toSpec().encoding, color: { value: Infinity } } }).status, 'unsupported');
  assert.equal(codec.decompose({ ...base.toSpec(), custom: () => 1 }).status, 'unsupported');
  assert.equal(codec.decompose({ ...unsafe, data: { values: [{ id: 'a', group: 'A', y: Infinity }] } }).status, 'unsupported');
});

test('stable values distinguish absent, undefined, dates, and JSON stringify collisions', () => {
  const genericCodec = createDeclarationOperationCodec();
  const missing = genericCodec.decompose({ mark: 'bar' });
  const presentUndefined = genericCodec.decompose({ mark: 'bar', title: undefined });
  assert.equal(missing.status, 'ok');
  assert.equal(presentUndefined.status, 'ok');
  assert.notEqual(missing.value.some(op => op.id === 'title'), true);
  assert.equal(presentUndefined.value.some(op => op.id === 'title' && op.value.value === undefined), true);
  assert.notEqual(stableValueKey(new Date(0)).value, stableValueKey('1970-01-01T00:00:00.000Z').value);
  assert.notEqual(stableValueKey([1, 2]).value, stableValueKey(['1', '2']).value);
});

test('route rendering consumes prepared leg states without re-preparing waypoints', () => {
  const preparedPlugin = {
    ...chartType,
    prepareSpec(spec) { return { ...spec, value: spec.value + 10 }; },
    intermediateSpecs(from, to) {
      return [{ spec: { ...to, value: 50 } }];
    }
  };
  const registry = createChartTypeRegistry().register(preparedPlugin);
  const renderer = createViewRenderer(registry);
  const from = { mark: 'bar', data: { values: rows }, encoding: { x: { field: 'group' }, y: { field: 'y' } }, value: 0 };
  const to = { ...from, value: 100 };
  const preparedFrom = prepareChartSpec(preparedPlugin, renderer.compileTransitionSource(from).effectiveViewSpec);
  const preparedTo = prepareChartSpec(preparedPlugin, renderer.compileTransitionSource(to).effectiveViewSpec);
  const route = selectTransitionRoute(preparedPlugin, preparedFrom, preparedTo);
  assert.deepEqual(route.legs.map(leg => leg.to.value), [50, 110]);
  const phases = renderer.renderPhaseConfigs(route.legs.slice(0, -1).map(leg => ({ spec: leg.to })), {
    chartType: preparedPlugin, node: {}, finalSpec: preparedTo, viewConfig: {}, datasets: {}, tooltip: {},
    seekable: true, transitionSource: { effectiveViewSpec: route.from, sceneTransition: { scene: [] } }
  }, route);
  assert.deepEqual(phases.map(phase => phase.spec.value), [50, 110]);
  assert.ok(phases.every(phase => phase.routePrepared));
});
