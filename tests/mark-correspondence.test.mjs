import test from 'node:test';
import assert from 'node:assert/strict';
import { correspondMarks, markKeyValue, resolveMarkIdentity } from '../dist/core.js';

test('chart defaults preserve marks when source observations change', () => {
  const from = [{ state: 'CA', age: '<10' }, { state: 'TX', age: '<10' }];
  const to = [{ state: 'CA', age: '≥80' }, { state: 'TX', age: '≥80' }];
  const spec = { mark: 'bar', datumKey: ['state', 'age'] };
  const identity = resolveMarkIdentity(spec, 'state');
  const correspondence = correspondMarks(from, to, identity, identity);

  assert.equal(identity.source, 'chart-default');
  assert.deepEqual(correspondence.updates.map(({ key }) => key), ['CA', 'TX']);
  assert.deepEqual(correspondence.enter, []);
  assert.deepEqual(correspondence.exit, []);
});

test('an explicit mark key overrides the chart default', () => {
  const spec = { mark: 'bar', key: ['state', 'age'], datumKey: ['state', 'age'] };
  const identity = resolveMarkIdentity(spec, 'state');
  const correspondence = correspondMarks(
    [{ state: 'CA', age: '<10' }],
    [{ state: 'CA', age: '≥80' }],
    identity,
    identity
  );

  assert.equal(identity.source, 'explicit');
  assert.equal(correspondence.updates.length, 0);
  assert.equal(correspondence.exit.length, 1);
  assert.equal(correspondence.enter.length, 1);
});

test('compound mark keys are collision-safe and duplicate identities are unsupported', () => {
  const identity = resolveMarkIdentity({}, ['a', 'b']);
  assert.notEqual(
    markKeyValue({ a: 'x|y', b: 'z' }, identity),
    markKeyValue({ a: 'x', b: 'y|z' }, identity)
  );
  const duplicate = correspondMarks(
    [{ a: 'x', b: 'y' }, { a: 'x', b: 'y' }],
    [{ a: 'x', b: 'y' }],
    identity,
    identity
  );
  assert.equal(duplicate.stable, false);
  assert.deepEqual(duplicate.enter, []);
  assert.deepEqual(duplicate.exit, []);
  assert.match(duplicate.reasons.join(' '), /duplicate mark key/);
});
