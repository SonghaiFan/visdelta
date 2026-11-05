import test from 'node:test';
import assert from 'node:assert/strict';
import { readAgentResponse } from '../../website/lib/agent-stream.ts';
test('debug events and Unicode text are delivered before the final result', async () => {
 const bytes = new TextEncoder().encode('{"type":"text_delta","text":"你好"}\n{"type":"tool","tool":"edit_chart"}\n{"type":"result","result":{"explanation":"Done"}}\n');
 const chunks = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2)); controller.close(); } });
 const events = [];
 const result = await readAgentResponse(new Response(chunks, { headers: { 'content-type': 'application/x-ndjson' } }), event => events.push(event));
 assert.equal(events[0].text, '你好'); assert.equal(events[1].tool, 'edit_chart'); assert.equal(result.explanation, 'Done');
});
test('truncated and failed streams are not treated as successful chart edits', async () => {
 await assert.rejects(readAgentResponse(new Response('{"type":"error","error":"Realtime unavailable"}\n', { headers: { 'content-type': 'application/x-ndjson' } }), () => {}), /Realtime unavailable/);
 await assert.rejects(readAgentResponse(new Response('', { headers: { 'content-type': 'application/x-ndjson' } }), () => {}), /before completing/);
});
