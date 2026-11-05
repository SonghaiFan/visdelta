import test from 'node:test';
import assert from 'node:assert/strict';
import { appendDebugRecord, readDebugLog } from '../../website/lib/debug-journal.ts';
test('debug log survives a new reader and preserves exact proposed JSON and receipt', () => {
 let value; const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
 const proposal = { encoding: { xOffset: { field: 'measure' } } };
 appendDebugRecord(storage, { time: 'now', turn: '1', type: 'submission', proposed: proposal, before: { revision: 2 } });
 appendDebugRecord(storage, { time: 'later', turn: '1', type: 'receipt', status: 'applied', after: { revision: 3 } });
 assert.deepEqual(readDebugLog(storage)[0].proposed, proposal);
 assert.equal(readDebugLog(storage)[1].after.revision, 3);
});
test('debug persistence is bounded, redacts credentials/media/reasoning and tolerates blocked storage', () => {
 let value; const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
 for (let n = 0; n < 501; n++) appendDebugRecord(storage, { time: 'now', turn: String(n), type: 'event', apiKey: 'private', audio: 'private', reasoning_details: 'private', detail: 'Bearer synthetic-secret' });
 const records = readDebugLog(storage);
 assert.equal(records.length, 500); assert.equal(records[0].turn, '1');
 assert.ok(!JSON.stringify(records).includes('private')); assert.ok(!JSON.stringify(records).includes('synthetic-secret'));
 assert.equal(appendDebugRecord({ getItem: () => 'invalid', setItem: () => { throw Error('disabled'); } }, { time: 'now', turn: 'x', type: 'event' }).persisted, false);
});
test('quota failures retain successive events in the in-memory export fallback', () => {
 const first = { time: '1', turn: 'x', type: 'before' };
 const storage = { getItem: () => JSON.stringify([first]), setItem: () => { throw Error('quota'); } };
 const second = appendDebugRecord(storage, { time: '2', turn: 'x', type: 'submission' });
 const third = appendDebugRecord(storage, { time: '3', turn: 'x', type: 'receipt' }, second.records);
 assert.equal(third.records.length, 3); assert.equal(third.persisted, false);
});
