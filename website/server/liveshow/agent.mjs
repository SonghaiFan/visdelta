import { delta } from 'visdelta/core';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createChartMcpServer } from '@visdelta/mcp';
import { AIError, validateInput, validatePlan } from './ai.mjs';
import { authorChart, searchDocs, chartTypes, describeChart } from './chart-authoring.mjs';
import { inspectDesignAdvice } from './design-advice.mjs';
import { datasetForSpec } from '../../components/liveshow/presets.ts';
const instructions = `You operate the current chart through the VisDelta MCP tools. Use the user's language.
The supplied chart, source rows, revision and visible mark observations are current. Preserve previous intent.
Use edit_chart with native {method,args} calls, exactly like view.edit. Combine compatible edits into one batch.
Use color({value:"blue"}) for a literal CSS color, or color("field") to encode a data field.
Read package docs for unfamiliar chart syntax. Use set_chart for a complete declaration; do not invent data or fields.
where changes membership; focus changes camera; highlight changes emphasis. They are not substitutes.
Inspect rendered spatial order before using positional references. Capture a PNG only when visual evidence is needed.
Warnings are advice, never permission gates. Explain a relevant tradeoff without overriding an explicit request.
Reset/undo/redo restore accepted declarations. Ask when the intended object or result is ambiguous.
Never claim a change happened until an applied browser receipt matches the validated declaration.
One browser batch normally completes the request. Continue only for a dependent step. Correct an invalid edit once, then stop.`;

export function createAgentRunner({ complete } = {}) {
  if (typeof complete !== 'function') throw new TypeError('Supply a model completion function.');
  const sessions = new Map();
  const run = async function(raw, { key, model, signal, onEvent }) {
    const context = validateInput(raw);
    const sourceRows = datasetForSpec(context.spec).rows;
    const image = raw.capture, observation = raw.observation;
    if ((image && (image.revision !== context.revision || image.mimeType !== 'image/png' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl) || image.dataUrl.length > 1_800_000))
      || !observation || observation.revision !== context.revision || !Array.isArray(observation.marks) || observation.marks.length > 1000) throw new AIError(400, 'Provide a current chart capture and object observation.');
    if (!key?.trim()) throw new AIError(503, `Add OPENAI_API_KEY to .env.local and restart.`);
    for (const [id, session] of sessions) if (Date.now() - session.touched > 300_000)  { sessions.delete(id); complete?.close?.(id); }
    let session = raw.sessionId && sessions.get(raw.sessionId);
    if (raw.sessionId && !session) throw new AIError(409, 'Agent session expired. Please send your request again.');
    const adviceKey = JSON.stringify([context.revision, context.spec]);
    const currentAdvice = session?.adviceKey === adviceKey ? session.currentAdvice : await inspectDesignAdvice(context.spec, sourceRows);
    const emitAdvice = (stage, advice) => onEvent?.({ type: 'design_advice', status: advice.status, revision: context.revision,
      message: `Design advice · ${stage} · ${advice.status === 'ok' ? advice.warnings.length + ' suggestion(s)' : 'unavailable'}`,
      detail: JSON.stringify({ stage, advice }) });
    if (!session) emitAdvice('current', currentAdvice);

    if (!session) {
      if (sessions.size >= 16) throw new AIError(429, 'Too many active conversations. Please wait.');
      const history = Array.isArray(raw.history) ? raw.history.slice(-8).flatMap(item => typeof item.prompt === 'string' && typeof item.reply === 'string' ? [{ role: 'user', content: item.prompt.slice(0, 2000) }, { role: 'assistant', content: item.reply.slice(0, 2000) }] : []) : [];
      session = { id: randomUUID(), touched: Date.now(), messages: [{ role: 'system', content: instructions }, ...history, { role: 'user', content: JSON.stringify({ request: context.prompt, chart: { ...context, presentation: describeChart(context.spec), sourceRows, observation, designAdvice: currentAdvice } }) }], steps: 0, pending: null, busy: false, readRevision: context.revision, attempts: 0, successes: 0, fingerprints: new Set() };
      sessions.set(session.id, session);
    }
    if (session.busy) throw new AIError(409, 'Agent session is already running.');
    session.adviceKey = adviceKey; session.currentAdvice = currentAdvice;
    session.busy = true; session.touched = Date.now();
    const trace = []; const record = entry => { trace.push(entry); onEvent?.({ type: 'tool', ...entry }); }; let command = null, question = null;
    let readState = session.readRevision === context.revision;
    const requireRevision = revision => { if (revision !== context.revision) throw new Error('Stale chart revision. Read get_chart_state again.'); };
    async function prepareCandidate(nextCommand, expectedSpec, summary, continueAfterApply = false) {
      const advice = await inspectDesignAdvice(expectedSpec, sourceRows);
      emitAdvice('candidate', advice);
      session.expectedSpec = expectedSpec; session.summary = summary;
      session.continueAfterApply = continueAfterApply; command = nextCommand;
      return { status: 'awaiting_browser_receipt', designAdvice: advice };
    }
    const bridge = {
      state: async () => { readState = true; session.readRevision = context.revision; session.needsVerification = false; return { ...context, presentation: describeChart(context.spec), sourceRows, designAdvice: currentAdvice }; }, inspect: async () => { session.needsVerification = false; return observation; }, capture: async () => { if (!image) throw new Error('Browser capture is required.'); session.needsVerification = false; return image; },
      edit: async args => {
        requireRevision(args.revision);
        if (!readState) throw new Error('Read current chart state before editing.');
        const edits = args.edits;
        let plan;
        try { plan = await validatePlan({ explanation: 'Agent edit', edits }, context, true); }
        catch (error) { throw new Error(error.details || error.message); }
        onEvent?.({ type: 'semantic_edit', detail: JSON.stringify({ operations: edits, canonicalSpec: plan.targetSpec, changes: delta(context.spec, plan.targetSpec).stateChanges }), status: 'prepared', revision: context.revision });
        return prepareCandidate(plan.action === 'replace' ? { action: 'replace', spec: plan.targetSpec } : { action: 'edit', message: plan.message }, plan.targetSpec, args.summary, args.continueAfterApply === true);
      },
      docs: async query => { session.docsRead = true; return searchDocs(query); },
      setChart: async args => {
        requireRevision(args.revision);
        const target=authorChart(args.spec,context.spec.data,sourceRows);
        return prepareCandidate({action:'replace',spec:target},target,args.summary);
      },
      advice: async args => {
        requireRevision(args.revision);
        const spec = args.spec ? authorChart(args.spec, context.spec.data, sourceRows) : context.spec;
        const advice = args.spec ? await inspectDesignAdvice(spec, sourceRows) : currentAdvice;
        emitAdvice(args.spec ? 'read-only candidate' : 'current', advice);
        return { revision: context.revision, goal: args.goal, designAdvice: advice, applied: false };
      },
      restore: async args => { requireRevision(args.revision); if (!readState) throw new Error('Read current chart state before restoring.'); session.expectedSpec = null; session.summary = args.summary; session.continueAfterApply = false; command = { action: args.action }; return { status: 'awaiting_browser_receipt' }; },
      ask: async value => { question = value; return { status: 'waiting_for_user' }; },
    };
    const server = createChartMcpServer(bridge);
    const client = new Client({ name: 'liveshow-agent', version: '0.2.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(st), client.connect(ct)]);
      const catalog = (await client.listTools()).tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
      async function completeReads(calls) {
        let latestPng;
        for (const call of calls) {
          record({ tool: call.function.name, status: 'called', detail: call.function.arguments.slice(0, 64000) });
          let tool;
          try { tool = await client.callTool({ name: call.function.name, arguments: JSON.parse(call.function.arguments) }); }
          catch { tool = { isError: true, content: [{ type: 'text', text: 'Invalid read-tool arguments. Retry with the declared schema.' }] }; }
          onEvent?.({ type: 'tool_result', tool: call.function.name, status: tool.isError ? 'error' : 'completed', detail: JSON.stringify((tool.content ?? []).filter(block => block.type === 'text')).slice(0, 64000) });
          const blocks = tool.content ?? [];
          session.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ isError: tool.isError ?? false, content: blocks.filter(block => block.type !== 'image') }) });
          const png = blocks.find(block => block.type === 'image'); if (png) latestPng = png;
        }
        if (latestPng) {
          for (const item of session.messages) if (Array.isArray(item.content)) item.content = item.content.filter(block => block.type !== 'image_url');
          session.messages.push({ role: 'user', content: [{ type: 'text', text: `MCP capture_chart image, chart revision ${context.revision}:` }, { type: 'image_url', image_url: { url: `data:${latestPng.mimeType};base64,${latestPng.data}`, detail: 'high' } }] });
        }
      }
      if (session.captureRequest) {
        const pending = session.captureRequest;
        if (!image || pending.revision !== context.revision || raw.toolCallId !== pending.token || raw.receipt?.status !== 'applied') throw new AIError(409, 'Chart changed or capture was not completed. Please retry.');
        session.captureRequest = null;
        await completeReads(pending.calls);
      }
      if (session.pending) {
        if (raw.toolCallId !== session.pending || !raw.receipt || !['applied', 'superseded', 'failed'].includes(raw.receipt.status)) throw new AIError(400, 'Missing or invalid browser tool receipt.');
        session.messages.push({ role: 'tool', tool_call_id: session.pending, content: JSON.stringify({ ...raw.receipt, currentRevision: context.revision }) });
        session.pending = null;
        onEvent?.({ type: 'receipt', status: raw.receipt.status, revision: context.revision, message: raw.receipt.error || 'Browser chart receipt' });
        if (raw.receipt.status !== 'applied' && !(raw.receipt.status === 'failed' && session.attempts < 2 && typeof raw.receipt.error === 'string')) {
          sessions.delete(session.id);
          return { explanation: /[\u3400-\u9fff]/.test(context.prompt) ? '修改未成功应用，已停止本轮操作。' : 'The update was not applied. This turn has stopped.', trace };
        }
        if (raw.receipt.status === 'failed') {
          session.lastError = raw.receipt.error.slice(0, 600);
          session.messages.push({ role: 'user', content: JSON.stringify({ instruction: 'VisDelta rejected the declaration and kept the previous chart. Correct it once using docs and this error. Do not repeat the same declaration.', error: session.lastError, chart: context }) });
        } else {
        if (session.expectedSpec && (session.expectedSpec.mark !== context.spec.mark || delta(session.expectedSpec, context.spec).stateChanges.length)) {
          sessions.delete(session.id);
          return { explanation: 'The browser state does not match the validated edit. Stopped without further changes.', trace };
        }
        emitAdvice('accepted', currentAdvice);
        session.successes++;
        if (!session.continueAfterApply || session.successes >= 2) {
          sessions.delete(session.id);
          return { explanation: session.summary || (/[\u3400-\u9fff]/.test(context.prompt) ? '已应用图表修改。' : 'Chart update applied.'), verified: true, trace };
        }
        session.attempts = 0;
        session.readRevision = context.revision; readState = true;
        session.messages.push({ role: 'user', content: JSON.stringify({ instruction: 'The previous batch is applied and verified. Complete only the remaining dependent step, then stop.', chart: { ...context, observation, designAdvice: currentAdvice } }) });

        }
      }
      // A single tool per model step makes browser mutations transactional and receipts unambiguous.
      while (session.steps++ < 12) {
        const result = await complete({sessionId:session.id,messages:session.messages,tools:catalog,key,model,signal,onEvent});
        const message = result.choices?.[0]?.message;
        if (!message || result.error || result.choices[0].finish_reason === 'length') throw new AIError(502, 'Incomplete agent response. Please retry.');
        session.messages.push({ role: 'assistant', content: message.content ?? null, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}), ...(message.reasoning_details ? { reasoning_details: message.reasoning_details } : {}) });
        if (!message.tool_calls?.length) {
          const answer = String(message.content ?? 'No changes made.');
          sessions.delete(session.id); return { explanation: answer, trace };
        }
        const reads = ['get_chart_state', 'inspect_marks', 'capture_chart', 'search_visdelta_docs', 'get_design_advice'];
        if (message.tool_calls.length > 1 && !message.tool_calls.every(call => reads.includes(call.function.name))) {
          session.parallelFailures = (session.parallelFailures ?? 0) + 1;
          if (session.parallelFailures > 1) { sessions.delete(session.id); return { explanation: 'Stopped repeated incompatible tool batches without changing the chart.', trace }; }
          for (const call of message.tool_calls) session.messages.push({ role: 'tool', tool_call_id: call.id, content: 'Mutating and question tools must be called alone. Call one mutation per response.' });
          continue;
        }
        if (message.tool_calls.every(call => reads.includes(call.function.name))) {
          session.readCounts ??= {};
          for (const call of message.tool_calls) {
            const readKey = `${context.revision}:${call.function.name}:${['search_visdelta_docs', 'get_design_advice'].includes(call.function.name) ? call.function.arguments : ''}`;
            session.readCounts[readKey] = (session.readCounts[readKey] ?? 0) + 1;
            if (session.readCounts[readKey] > 2) {
              sessions.delete(session.id);
              return { explanation: /[\u3400-\u9fff]/.test(context.prompt) ? '相同图表已重复读取，已停止无效调用。你希望对哪个对象做什么修改？' : 'Stopped repeated reads of the same chart. Which object and change do you intend?', question: true, trace };
            }
          }
          if (!image && message.tool_calls.some(call => call.function.name === 'capture_chart')) {
            const token = randomUUID();
            session.captureRequest = { token, revision: context.revision, calls: message.tool_calls };
            return { sessionId: session.id, toolCallId: token, command: { action: 'capture' }, trace };
          }
          await completeReads(message.tool_calls); continue;
        }
        const call = message.tool_calls[0];
        if (['edit_chart', 'restore_chart', 'set_chart'].includes(call.function.name)) {
          let args; try { args = JSON.parse(call.function.arguments); } catch { args = call.function.arguments; }
          const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
          const fingerprint = JSON.stringify([call.function.name, canonical(typeof args === 'object' && args ? { revision: args.revision, edits: args.edits, action: args.action, spec: args.spec } : args)]);
          if (session.attempts >= 2 || session.fingerprints.has(fingerprint)) {
            record({ tool: call.function.name, status: 'blocked', error: session.lastError || 'Repeated edit attempt.' });
            sessions.delete(session.id);
            return { explanation: /[\u3400-\u9fff]/.test(context.prompt) ? `修改未通过校验，已停止重复尝试：${session.lastError || '相同修改被重复提交。'}` : `Stopped repeated edit attempts: ${session.lastError || 'The same edit was submitted again.'}`, trace };
          }
          session.attempts++; session.fingerprints.add(fingerprint);
        }
        const entry = { tool: call.function.name, status: 'called', detail: call.function.arguments.slice(0, 64000) }; record(entry);
        let tool;
        try { tool = await client.callTool({ name: call.function.name, arguments: JSON.parse(call.function.arguments) }); }
        catch { tool = { isError: true, content: [{ type: 'text', text: 'Invalid tool call or stale revision. Read current state and retry with supported arguments.' }] }; }
        if (tool.isError) { entry.status = 'error'; entry.error = (tool.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(' ').slice(0, 600); session.lastError = entry.error; }
        onEvent?.({ type: 'tool_result', tool: call.function.name, status: tool.isError ? 'error' : command ? 'awaiting_browser' : 'completed', detail: JSON.stringify(tool.content ?? []).slice(0, 64000) });
        if (question) { sessions.delete(session.id); return { explanation: question, question: true, trace }; }
        if (command) { session.pending = call.id; return { sessionId: session.id, toolCallId: call.id, command, trace }; }
        session.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(tool) });
      }
      sessions.delete(session.id); return { explanation: /[\u3400-\u9fff]/.test(context.prompt) ? '本轮未能确定可执行的修改，已停止。请说明要改的对象和预期结果。' : 'Stopped because no executable change was resolved. Which object and outcome do you intend?', question: true, trace };
    } catch (error) { sessions.delete(session.id); throw error; }
    finally { if (!sessions.has(session.id)) complete?.close?.(session.id); session.busy = false; await client.close(); await server.close(); }
  };
  run.close = () => { for (const id of sessions.keys()) complete.close?.(id); sessions.clear(); };
  return run;
}
