import WebSocket from 'ws';
import { AIError } from './ai.mjs';

/** Stateful OpenAI Realtime transport. Only this server owns the API key/socket. */
export function createRealtimeCompletion({ WebSocketImpl = WebSocket } = {}) {
  const sessions = new Map();
  const safeError = code => new AIError(code === 401 ? 503 : 502, code === 401 ? 'OpenAI rejected the API key. Check OPENAI_API_KEY and restart.' : 'OpenAI Realtime could not complete this response. Check model access, credits and connection.');
  function close(id) {
    const state = sessions.get(id);
    if (!state) return;
    sessions.delete(id); clearTimeout(state.expiry);
    state.socket.close();
  }
  function wait(state, expected, signal, start) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); state.socket.off('message', message); state.socket.off('error', error); state.socket.off('close', ended); state.socket.off('unexpected-response', denied); signal?.removeEventListener('abort', abort); };
      const finish = (error, value) => { cleanup(); if (error) { close(state.id); reject(error); } else resolve(value); };
      const error = () => finish(safeError());
      const ended = () => finish(new AIError(502, 'OpenAI Realtime connection closed. Please send the request again.'));
      const denied = (_request, response) => { response.resume(); finish(safeError(response.statusCode)); };
      const abort = () => { if (state.socket.readyState === 1) state.socket.send(JSON.stringify({ type: 'response.cancel' })); finish(new AIError(499, 'Realtime request cancelled.')); };
      const message = data => {
        let event; try { event = JSON.parse(data.toString()); } catch { return finish(safeError()); }
        if (event.type === 'error') return finish(safeError());
        if (event.type === 'response.output_text.delta') state.emit?.({ type: 'text_delta', text: event.delta });
        if (event.type === 'response.output_text.done') state.emit?.({ type: 'assistant_text', message: 'Assistant update', detail: (event.text ?? '').slice(0, 2000) });
        if (event.type === 'response.created') state.emit?.({ type: 'status', message: 'Generating response' });
        if (event.type === expected) finish(null, event);
      };
      state.socket.on('message', message); state.socket.on('error', error); state.socket.on('close', ended); state.socket.on('unexpected-response', denied);
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(new AIError(504, 'OpenAI Realtime timed out. Please retry.')), 60_000);
      if (signal?.aborted) return abort();
      try { start(); } catch { error(); }
    });
  }
  async function complete({ sessionId, messages, tools, key, model = 'gpt-realtime-2.1', signal, onEvent }) {
    let state = sessions.get(sessionId);
    if (!state) {
      const socket = new WebSocketImpl(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` }, maxPayload: 4_000_000 });
      state = { id: sessionId, socket, cursor: 0, skipAssistant: false, emit: onEvent };
      // Idle sockets can fail between browser receipts; never print provider errors.
      socket.on('error', () => close(sessionId));
      sessions.set(sessionId, state);
      state.expiry = setTimeout(() => close(sessionId), 300_000); state.expiry.unref?.();
      onEvent?.({ type: 'status', message: 'Connecting to OpenAI Realtime' });
      await wait(state, 'session.created', signal, () => {});
      await wait(state, 'session.updated', signal, () => socket.send(JSON.stringify({ type: 'session.update', session: {
        type: 'realtime', output_modalities: ['text'], instructions: messages.find(message => message.role === 'system')?.content ?? '',
        tools: tools.map(tool => ({ type: 'function', ...tool.function })), tool_choice: 'auto', max_output_tokens: 4096,
      } })));
      onEvent?.({ type: 'status', message: 'Realtime connected · text mode' });
    }
    state.emit = onEvent;
    clearTimeout(state.expiry); state.expiry = setTimeout(() => close(sessionId), 300_000); state.expiry.unref?.();
    const send = item => state.socket.send(JSON.stringify({ type: 'conversation.item.create', item }));
    for (; state.cursor < messages.length; state.cursor++) {
      const message = messages[state.cursor];
      if (message.role === 'system') continue;
      // The model's own last response is already present in this Realtime session.
      if (message.role === 'assistant' && state.skipAssistant) { state.skipAssistant = false; continue; }
      if (message.role === 'assistant' && message.tool_calls) for (const call of message.tool_calls) send({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
      if (message.role === 'tool') { send({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }); continue; }
      const content = typeof message.content === 'string' ? [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }] : (message.content ?? []).map(block => block.type === 'image_url' ? { type: 'input_image', image_url: block.image_url.url } : { type: 'input_text', text: block.text });
      if (content.length) send({ type: 'message', role: message.role, content });
    }
    const done = await wait(state, 'response.done', signal, () => state.socket.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['text'] } })));
    if (done.response?.status !== 'completed') { close(sessionId); throw safeError(); }
    state.skipAssistant = true;
    const output = done.response.output ?? [];
    const calls = output.filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } }));
    const content = output.filter(item => item.type === 'message').flatMap(item => item.content ?? []).map(part => part.text ?? '').join('');
    return { choices: [{ message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: 'stop' }] };
  }
  complete.close = close;
  return complete;
}
