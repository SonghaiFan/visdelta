import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRealtimeCompletion } from '../../website/server/liveshow/realtime.mjs';

class Socket extends EventEmitter {
 static sockets = [];
 static outputs = [];
 constructor(url, options) { super(); this.url = url; this.options = options; this.sent = []; this.readyState = 1; Socket.sockets.push(this); queueMicrotask(() => this.event({ type: 'session.created' })); }
 event(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
 send(text) {
  const event = JSON.parse(text); this.sent.push(event);
  if (event.type === 'session.update') queueMicrotask(() => this.event({ type: 'session.updated' }));
  if (event.type === 'response.create') {
   const output = Socket.outputs.shift();
   if (!output) return;
   queueMicrotask(() => { this.event({ type: 'response.created' }); this.event({ type: 'response.output_text.delta', delta: 'Working…' }); this.event({ type: 'response.done', response: { status: 'completed', output } }); });
  }
 }
 close() { this.readyState = 3; this.emit('close'); }
}
const tools = [{ type: 'function', function: { name: 'inspect_marks', description: 'Inspect', parameters: { type: 'object', properties: {} } } }];
test('Realtime reuses its socket, streams text and syncs only new tool results', async () => {
 Socket.sockets = []; Socket.outputs = [[{ type: 'function_call', call_id: 'c1', name: 'inspect_marks', arguments: '{}' }], [{ type: 'message', content: [{ type: 'output_text', text: 'Done' }] }]];
 const complete = createRealtimeCompletion({ WebSocketImpl: Socket }); const events = [];
 const messages = [{ role: 'system', content: 'Use chart tools.' }, { role: 'user', content: 'Inspect the chart.' }];
 const config = { sessionId: 'test', messages, tools, key: 'fake-only', model: 'test-model', onEvent: event => events.push(event) };
 const first = await complete(config);
 assert.equal(first.choices[0].message.tool_calls[0].id, 'c1');
 messages.push(first.choices[0].message, { role: 'tool', tool_call_id: 'c1', content: '{"marks":[]}' });
 const second = await complete(config);
 assert.equal(second.choices[0].message.content, 'Done'); assert.equal(Socket.sockets.length, 1);
 const sent = Socket.sockets[0].sent;
 assert.deepEqual(sent[0].session.output_modalities, ['text']);
 assert.equal(sent.filter(event => event.type === 'conversation.item.create' && event.item.role === 'user').length, 1);
 assert.equal(sent.filter(event => event.item?.type === 'function_call_output').length, 1);
 assert.ok(events.some(event => event.type === 'text_delta'));
 assert.ok(!JSON.stringify(sent).includes('fake-only'));
 complete.close('test'); assert.equal(Socket.sockets[0].readyState, 3);
});
test('abort cancels the active response and closes the upstream connection', async () => {
 Socket.outputs = []; const complete = createRealtimeCompletion({ WebSocketImpl: Socket });
 const controller = new AbortController();
 const request = complete({ sessionId: 'abort', messages: [{ role: 'user', content: 'hello' }], tools: [], key: 'fake-only', signal: controller.signal });
 await new Promise(resolve => setImmediate(resolve)); controller.abort();
 await assert.rejects(request, /cancelled/);
 assert.equal(Socket.sockets.at(-1).readyState, 3);
 assert.ok(Socket.sockets.at(-1).sent.some(event => event.type === 'response.cancel'));
});
test('provider error bodies never appear in app errors', async () => {
 class FailingSocket extends Socket { send(text) { super.send(text); if (JSON.parse(text).type === 'response.create') queueMicrotask(() => this.event({ type: 'error', error: { message: 'sensitive-provider-body' } })); } }
 const complete = createRealtimeCompletion({ WebSocketImpl: FailingSocket });
 await assert.rejects(complete({ sessionId: 'error', messages: [], tools: [], key: 'fake-only' }), error => error.message.includes('OpenAI Realtime') && !error.message.includes('sensitive-provider-body'));
});
