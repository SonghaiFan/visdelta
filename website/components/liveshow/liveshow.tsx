'use client';

import { useEffect, useRef, useState } from 'react';
import type { ViewSpec } from 'visdelta/core';
import { delta } from 'visdelta/core';
import type { ChartView, UpdateResult } from 'visdelta/render';
import { readAgentResponse, type DebugEvent } from '@/lib/agent-stream';
import visdeltaBuild from '@/lib/visdelta-build.json';
import { appendDebugRecord, readDebugLog, type DebugRecord } from '@/lib/debug-journal';
import { VoiceRecorder } from './voice-recorder';
import { initialSpec, sales, survey, workspaceDatasets, datasetForSpec, type WorkspaceDatasetName } from './presets';

type Receipt = { id: number; label: string; status: UpdateResult['status'] | 'submitted' | 'rejected' };
const json = (spec: unknown) => JSON.stringify(spec, null, 2);

export function Liveshow() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<ChartView | null>(null);
  const past = useRef<ViewSpec[]>([]);
  const future = useRef<ViewSpec[]>([]);
  const [history, setHistory] = useState({ past: 0, future: 0 });
  const lastRejection = useRef('');
  const activeUpdates = useRef(0);
  const [updating, setUpdating] = useState(false);
  function refreshHistory() { setHistory({ past: past.current.length, future: future.current.length }); }
  const [restoring, setRestoring] = useState(false);
  const historyLock = useRef(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const nextId = useRef(0);
  const [ready, setReady] = useState(false);
  const [datasetName, setDatasetName] = useState<WorkspaceDatasetName>('sales');
  const activeDataset = workspaceDatasets[datasetName];
  const [draft, setDraft] = useState(() => json({ requestId: 'edit-initial', baseRevision: 0, edits: [{method:'y',args:['profit',{label:'Profit ($k)'}]}] }));
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [connection, setConnection] = useState('Checking local AI…');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [serviceReady, setServiceReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [duration, setDuration] = useState(550);
  const [changes, setChanges] = useState<string[]>([]);
  const [chat, setChat] = useState<{ id: number; prompt: string; reply: string; tools?: string[]; debug?: DebugEvent[] }[]>([]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [chat]);
  const pending = useRef<AbortController | null>(null);
  const aiId = useRef(0);
  const journalRun = useRef('');
  const journalRecords = useRef<DebugRecord[]>([]);
  const [journal, setJournal] = useState<DebugRecord[]>([]);
  const [journalStatus, setJournalStatus] = useState('Saved in this browser · latest 500 events');
  function recordDebug(event: { type: string; [key: string]: unknown }) {
    if (!journalRun.current) journalRun.current = crypto.randomUUID();
    try {
      const result = appendDebugRecord(localStorage, { ...event, type: event.type, time: new Date().toISOString(), turn: `${journalRun.current}:${aiId.current}` }, journalRecords.current);
      journalRecords.current = result.records;
      setJournal(result.records);
      if (!result.persisted) setJournalStatus('Browser storage unavailable · export this session before leaving');
    } catch { setJournalStatus('Browser storage unavailable'); }
  }
  function loadJournal() {
    try { setJournal(readDebugLog(localStorage)); } catch { setJournalStatus('Browser storage unavailable'); }
  }
  function exportJournal() {
    let saved = journal;
    try { saved = readDebugLog(localStorage); } catch { /* Use in-memory log. */ }
    const memory = journalRecords.current;
    const events = memory.length && (!saved.length || memory.at(-1)!.time >= saved.at(-1)!.time) ? memory : saved;
    const url = URL.createObjectURL(new Blob([json({ format: 'visdelta-liveshow-debug-v1', exportedAt: new Date().toISOString(), events: events.length ? events : journal })], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `liveshow-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click(); URL.revokeObjectURL(url);
  }

  const api = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/liveshow`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${api}/status/`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const status = await response.json();
      if (status.visdeltaBuild?.buildSha256 !== visdeltaBuild.buildSha256) { setError('VisDelta browser/server versions differ. Restart the local service and reload this page.'); return; }
      setServiceReady(true);
      setAiReady(status.configured === true);
      setVoiceSupported(status.voiceInput === true);
      setConnection(status.configured ? `OpenAI Realtime · ${status.model}` : 'Add OPENAI_API_KEY to .env.local, then restart');
    }).catch(() => { if (!controller.signal.aborted) setConnection('AI is available in the local app'); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [api]);

  useEffect(() => {
    let disposed = false;
    let owned: ChartView | undefined;
    const mount = document.createElement('div');
    host.current!.append(mount);
    void (async () => {
      const [{ createRenderer }, { barModule }, { pieModule }, { lineModule }, { areaModule }, { pointModule }, { unitModule }] = await Promise.all([import('visdelta/render'), import('visdelta/bar'), import('visdelta/pie'), import('visdelta/line'), import('visdelta/area'), import('visdelta/point'), import('visdelta/unit')]);
      if (disposed) return;
      owned = await createRenderer({ modules: [barModule, pieModule, lineModule, areaModule, pointModule, unitModule] }).render(mount, initialSpec, {
        data: { sales, survey }, height: 340, updates: { policy: 'latest', duration: 550 },
      });
      if (disposed) { owned.destroy(); return; }
      view.current = owned;
      setReady(true);
    })().catch(reason => { if (!disposed) setError(String(reason instanceof Error ? reason.message : reason)); });
    return () => {
      disposed = true;
      if (view.current === owned) view.current = null;
      owned?.destroy();
      mount.remove();
    };
  }, []);

  async function submit(text: string, label: string, complete = false, recordHistory = true) {
    const current = view.current;
    if (!current || (historyLock.current && recordHistory)) return;
    activeUpdates.current++; setUpdating(true);
    const id = ++nextId.current;
    setError(''); lastRejection.current = '';
    setReceipts(items => [{ id, label, status: 'submitted' as const }, ...items].slice(0, 8));
    try {
      const beforeSnapshot = current.snapshot();
      const before = beforeSnapshot.spec;
      recordDebug({ type: 'chart_submission', label, mode: complete ? 'complete' : 'edit', proposed: JSON.parse(text), before: beforeSnapshot });
      const settings = { duration, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches };
      const result = await (complete ? (JSON.parse(text).mark !== before.mark ? current.replace(text, settings) : current.update(text, settings)) : current.edit(text, settings));
      if (view.current !== current) return;
      if (recordHistory && result.revision !== undefined && result.revision > beforeSnapshot.revision) {
        past.current = [...past.current, before].slice(-40); future.current = [];
        refreshHistory();
      }
      recordDebug({ type: 'chart_receipt', result, after: current.snapshot() });
      const binding = current.snapshot().spec.data as { name?: WorkspaceDatasetName };
      if (binding.name && Object.hasOwn(workspaceDatasets, binding.name)) setDatasetName(binding.name);
      setRevision(current.snapshot().revision);
      setChanges(before.mark !== current.snapshot().spec.mark ? [`Chart replaced: ${before.mark} → ${current.snapshot().spec.mark}`] : delta(before, current.snapshot().spec).stateChanges.map(change => `${change.category}.${change.action}`));
      setReceipts(items => items.map(item => item.id === id ? { ...item, status: result.status } : item));
      return result;
    } catch (reason) {
      if (view.current !== current) return;
      lastRejection.current = reason instanceof Error ? reason.message : String(reason);
      recordDebug({ type: 'chart_rejected', error: lastRejection.current, after: current.snapshot() });
      setError(lastRejection.current);
      setReceipts(items => items.map(item => item.id === id ? { ...item, status: 'rejected' } : item));
    } finally { activeUpdates.current--; setUpdating(activeUpdates.current > 0); }
  }

  async function restore(action: 'reset' | 'undo' | 'redo', label = action as string) {
    const current = view.current;
    if (!current || historyLock.current || activeUpdates.current > 0) return;
    const target = action === 'reset' ? (datasetForSpec(current.snapshot().spec)?.initialSpec ?? initialSpec) : action === 'undo' ? past.current.at(-1) : future.current.at(-1);
    if (!target) return;
    historyLock.current = true; setRestoring(true);
    const before = current.snapshot().spec;
    try {
      const result = await submit(json(target), label, true, false);
      if (result?.status === 'applied') {
        if (action === 'undo') { past.current.pop(); future.current.push(before); }
        else if (action === 'redo') { future.current.pop(); past.current.push(before); }
        else { past.current = [...past.current, before].slice(-40); future.current = []; }
        refreshHistory();
        setDraftComplete(true); setDraft(json(target));
      }
      return result;
    } finally { historyLock.current = false; setRestoring(false); }
  }

  async function selectDataset(name: WorkspaceDatasetName) {
    if (name === datasetName) return;
    cancelAI();
    const target = workspaceDatasets[name].initialSpec;
    const result = await submit(json(target), `Load ${name} example`, true);
    if (result?.status === 'applied') { setChat([]); setDraftComplete(true); setDraft(json(target)); }
  }

  async function burst() {
    const current = view.current;
    if (!current) return;
    for (const [label, edits] of [
      ['Use blue', [{method:'color',args:['#4269d0']}]],
      ['Actually, use amber', [{method:'color',args:['#efb118']}]],
      ['Actually, use coral', [{method:'color',args:['#ff725c']}]],
    ] as const) {
      if (view.current !== current) return;
      const baseRevision = current.snapshot().revision;
      const text = json({ requestId: crypto.randomUUID(), baseRevision, edits });
      setDraft(text);
      let finished = false;
      const completion = submit(text, label).finally(() => { finished = true; });
      // Wait for acceptance, not animation. Each next edit includes earlier intent.
      while (!finished && view.current === current && current.snapshot().revision === baseRevision) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      if (view.current !== current) return;
      setRevision(current.snapshot().revision);
      void completion;
    }
  }

  const externalActions=useRef({submit,restore,recordDebug});
  useEffect(()=>{externalActions.current={submit,restore,recordDebug};});
  useEffect(()=>{
    if(!ready||!serviceReady)return;
    const clientId=crypto.randomUUID();
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;let activate=true;
    const post=async(path:string,body:unknown)=>fetch(`${api}/browser/${path}`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:json(body)});
    async function poll(){
      try{
        const current=view.current;
        if(!current)return;
        const snapshot=current.snapshot();
        await post('state/',{clientId,activate,...snapshot,sourceRows:datasetForSpec(snapshot.spec)?.rows,capabilities:current.capabilities(),observation:current.inspectMarks()});activate=false;
        const response=await fetch(`${api}/browser/next/?clientId=${clientId}`,{signal:controller.signal});
        if(!response.ok)return;
        const next=await response.json();
        if(!next)return;
        let receipt:UpdateResult|{status:'applied';revision:number}|undefined;
        let capture;
        try{
          const command=next.command;
          if(command.baseRevision!==current.snapshot().revision)throw new Error('Chart changed before the MCP command. Read the current state again.');
          externalActions.current.recordDebug({type:'mcp_command',command});
          if(command.action==='capture'){capture=await current.capture();receipt={status:'applied',revision:current.snapshot().revision};}
          else if(command.action==='inspect')receipt={status:'applied',revision:current.snapshot().revision};
          else if(command.action==='edit'){setDraftComplete(false);setDraft(json(command.message));receipt=await externalActions.current.submit(json(command.message),'MCP edit');}
          else if(command.action==='replace'){setDraftComplete(true);setDraft(json(command.spec));receipt=await externalActions.current.submit(json(command.spec),'MCP declaration',true);}
          else receipt=await externalActions.current.restore(command.action,'MCP history');
          await post('receipt/',{id:next.id,clientId,receipt,spec:current.snapshot().spec,observation:current.inspectMarks(),capture});
        }catch(error){await post('receipt/',{id:next.id,clientId,error:error instanceof Error?error.message:'Browser command failed.',receipt:{status:'failed'}});}
      }catch{/* Static hosting has no local MCP service. Manual editing remains available. */}
      finally{if(!controller.signal.aborted)timer=setTimeout(()=>void poll(),700);}
    }
    void poll();
    return()=>{controller.abort();clearTimeout(timer);};
  },[ready,serviceReady,api]);

  async function ask(spokenText?: string, voiceSignal?: AbortSignal, onVerified?: () => void) {
    if (spokenText) while (pending.current || activeUpdates.current > 0) { if (voiceSignal?.aborted) return; await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); }
    const current = view.current;
    if (voiceSignal?.aborted || !current || (!spokenText && !prompt.trim()) || !aiReady) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const abortVoice = () => controller.abort();
    voiceSignal?.addEventListener('abort', abortVoice, { once: true });
    const id = ++aiId.current;
    const text = spokenText || prompt.trim();
    const turnStarted = performance.now();
    recordDebug({ type: 'user_request', prompt: text, before: current.snapshot() });
    let publicProgress = '';
    const flushProgress = () => { if (publicProgress) { recordDebug({ type: 'assistant_progress', text: publicProgress }); publicProgress = ''; } };
    if (!spokenText) setPrompt(''); setThinking(true);
    setChat(items => [...items.map(item => item.id === id - 1 && thinking ? { ...item, reply: 'Replaced by your next request.' } : item), { id, prompt: text, reply: 'Thinking…' }].slice(-12));
    const reply = (value: string) => setChat(items => items.map(item => item.id === id ? { ...item, reply: value } : item));
    try {
      let continuation: { sessionId?: string; toolCallId?: string; receipt?: { status: string; revision?: number; error?: string } } = {};
      const tools: string[] = [];
      let requestedCapture: Awaited<ReturnType<ChartView['capture']>> | undefined;
      for (let step = 0; step < 8; step++) {
        if (controller.signal.aborted || view.current !== current) return;
        const observed = current.inspectMarks();
        const sent = current.snapshot();
        if (sent.revision !== observed.revision || (requestedCapture && sent.revision !== requestedCapture.revision)) throw new Error('Chart changed during observation. Send your request again.');
        const response = await fetch(`${api}/agent/`, { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: json({ prompt: text, ...sent, ...(requestedCapture ? { capture: requestedCapture } : {}), observation: observed, history: chat.slice(-8).map(({ prompt, reply }) => ({ prompt, reply })), ...continuation }) });
        let streamedText = '';
        const result = await readAgentResponse(response, event => {
          if (controller.signal.aborted || view.current !== current) return;
          if (event.type === 'text_delta') { streamedText += event.text || ''; publicProgress += event.text || ''; reply(streamedText); return; }
          flushProgress(); recordDebug({ ...event, elapsedMs: Math.round(performance.now() - turnStarted) });
          setChat(items => items.map(item => item.id === id ? { ...item, debug: [...(item.debug ?? []), { ...event, elapsedMs: Math.round(performance.now() - turnStarted) }].slice(-80) } : item));
        });
        flushProgress();
        recordDebug({ type: 'agent_result', explanation: result.explanation, command: result.command, trace: result.trace, verified: result.verified, question: result.question });
        requestedCapture = undefined;
        if (!response.ok) throw new Error(result.error || 'The agent request failed.');
        if (controller.signal.aborted || view.current !== current) return;
        tools.push(...(result.trace ?? []).map((entry: { tool: string; status?: string; error?: string }) => entry.status === 'error' || entry.status === 'blocked' ? `${entry.tool} [${entry.status}: ${(entry.error || '').slice(0, 160)}]` : entry.tool));
        setChat(items => items.map(item => item.id === id ? { ...item, tools: [...tools] } : item));
        if (current.snapshot().revision !== sent.revision) {
          reply('The chart changed while I was thinking. Please send your request again against the current view.'); return;
        }
        const operation = result.command ?? result;
        if (operation.action === 'capture') {
          reply('Capturing the chart for visual inspection…');
          requestedCapture = await current.capture();
          continuation = { sessionId: result.sessionId, toolCallId: result.toolCallId, receipt: { status: 'applied', revision: current.snapshot().revision } };
          continue;
        }
        let applied: UpdateResult | undefined;
        if (['reset', 'undo', 'redo'].includes(operation.action)) {
          const action = operation.action as 'reset' | 'undo' | 'redo';
          if ((action === 'undo' && !past.current.length) || (action === 'redo' && !future.current.length)) {
            if (!result.command) { reply(action === 'undo' ? 'There is no earlier chart state to undo.' : 'There is no undone chart state to redo.'); return; }
          } else applied = await restore(action, text);
        } else if (operation.action === 'replace' && operation.spec) {
          setDraftComplete(true); setDraft(json(operation.spec));
          applied = await submit(json(operation.spec), text, true);
        } else if (operation.message) {
          setDraftComplete(false); setDraft(json(operation.message));
          applied = await submit(json(operation.message), text);
        } else { const explanation = result.explanation || 'No chart changes made.'; reply(explanation); if (result.verified) onVerified?.(); return explanation; }
        if (controller.signal.aborted) return;
        if (!result.sessionId) {
          const explanation = applied?.status === 'applied' ? result.explanation : 'The requested chart update was not applied.'; reply(explanation); if (result.verified) onVerified?.(); return explanation;
        }
        reply(applied?.status === 'applied' ? 'Checking the updated chart…' : 'The tool could not apply the change; checking the result…');
        continuation = { sessionId: result.sessionId, toolCallId: result.toolCallId,
          receipt: { status: applied?.status === 'applied' ? 'applied' : applied?.status === 'superseded' ? 'superseded' : 'failed', revision: current.snapshot().revision, ...(lastRejection.current ? { error: lastRejection.current.slice(0, 600) } : {}) } };
      }
      reply('Reached the tool limit. Please narrow your request.');
    } catch (reason) {
      if (!controller.signal.aborted) { const explanation = reason instanceof Error ? reason.message : 'Unable to reach the local AI service.'; recordDebug({ type: 'agent_error', error: explanation }); reply(explanation); return explanation; }
    } finally {
      flushProgress();
      voiceSignal?.removeEventListener('abort', abortVoice);
      if (pending.current === controller) { pending.current = null; setThinking(false); }
    }
  }
  function cancelAI() {
    if (!pending.current) return;
    recordDebug({ type: 'agent_cancelled' });
    pending.current.abort(); pending.current = null; setThinking(false);
    setChat(items => items.map(item => item.id === aiId.current ? { ...item, reply: 'Cancelled.' } : item));
  }

  return (
    <div className="live-workspace">
      <details className="live-debug-journal" onToggle={event => { if (event.currentTarget.open) loadJournal(); }}>
        <summary>Debug log · progress, JSON edits & receipts <span aria-label="VisDelta build">· VisDelta {visdeltaBuild.version}</span></summary>
        <p>{journalStatus}. Public activity only; private model reasoning and media are excluded. Chart state is not restored when this log is reopened.</p>
        <button type="button" className="pg-tool" onClick={exportJournal}>Export debug JSON</button>
        <ol aria-label="Saved debug log">{journal.map((event, index) => <li key={`${event.time}-${index}`}><details><summary>{event.time} · {event.type}</summary><pre className="whitespace-pre-wrap break-all text-xs">{json(event)}</pre></details></li>)}</ol>
      </details>
      <div className="live-toolbar">
        <div className="flex gap-1">
          <button type="button" className="pg-tool" disabled={!ready || restoring || updating || !history.past} onClick={() => { cancelAI(); void restore('undo'); }}>Undo</button>
          <button type="button" className="pg-tool" disabled={!ready || restoring || updating || !history.future} onClick={() => { cancelAI(); void restore('redo'); }}>Redo</button>
          <button type="button" className="pg-tool" disabled={!ready || restoring || updating} onClick={() => { cancelAI(); void restore('reset'); }}>Reset</button>
        </div>
        <div><h1>Liveshow</h1><p>Think out loud. Change the view.</p></div>
        <label className="live-speed">Example <select aria-label="Example dataset" disabled={!ready || updating || restoring} value={datasetName} onChange={event => void selectDataset(event.target.value as WorkspaceDatasetName)}>{Object.entries(workspaceDatasets).map(([name, data]) => <option key={name} value={name}>{data.label}</option>)}</select></label>
        <span role="status">{ready ? `Ready · revision ${revision}` : 'Preparing chart…'}</span>
        <label className="live-speed">Motion <select aria-label="Transition speed" value={duration} onChange={event => setDuration(Number(event.target.value))}><option value={250}>Quick</option><option value={550}>Natural</option><option value={1000}>Slow</option></select></label>
      </div>

      <div className="live-stage-layout">
        <section className="live-stage" aria-label="Presentation canvas">
          <div className="live-slide-heading"><span className="live-kicker">01 / A live data conversation</span><h2>{activeDataset.title}</h2><p>{activeDataset.description}</p></div>
          <div ref={host} className="liveshow-chart live-canvas" />
          {datasetName === 'survey' && <details className="live-survey-guide">
            <summary>Choose and read a survey layout</summary>
            <p>Diverging bars emphasize disagreement versus agreement around a center line. Neutral stays centered as one category; it is not half a positive vote and half a negative vote.</p>
            <p>Use 100% stacked bars to compare response shares and outer categories. Each question includes all five responses in its denominator; sample sizes here are 100, 200 and 80. These are synthetic counts, not real survey results.</p>
            <div className="flex flex-wrap gap-2"><button type="button" className="pg-tool" disabled={!ready || !aiReady || updating || restoring} onClick={() => void ask('Show a diverging survey chart normalized to percentages, keeping the current orientation. Strongly disagree and Disagree are negative in that order, Neutral is the centered neutral category, Agree and Strongly agree are positive in that order. Preserve the original counts, all questions, series colors and identities.')}>Ask for diverging</button><button type="button" className="pg-tool" disabled={!ready || !aiReady || updating || restoring} onClick={() => void ask('Show a 100% stacked survey chart, keeping the current orientation. Use the response order Strongly disagree, Disagree, Neutral, Agree, Strongly agree. Normalize within each question including Neutral, and preserve original counts, all questions, series colors and identities.')}>Ask for 100% stacked</button></div>
          </details>}
          <div className="live-slide-footer"><span>{activeDataset.source}</span><span>Powered by VisDelta</span></div>
        </section>

        <aside className="live-conversation" aria-label="Chart conversation">
          <div className="live-chat-heading"><div><h2>Talk to the chart</h2><p>{connection}</p></div><span className={`live-dot ${aiReady ? 'is-ready' : ''}`} aria-hidden="true" /></div>
          <div ref={log} className="live-chat-log" role="log" aria-label="Conversation history" aria-live="polite">
            {chat.length === 0 ? <div className="live-chat-empty"><p>What would you like to show?</p><span>{datasetName === 'sales' ? 'Try “Show profit instead of revenue, rank highest first, and use blue bars.”' : 'Try “Group the survey responses side by side” or ask about the available layouts.'}</span></div> : chat.map(item => <div key={item.id} className="live-chat-turn"><p className="live-user-message">{item.prompt}</p><p className="live-assistant-message">{item.reply}</p>{!!item.tools?.length && <p className="live-changes" aria-label="Agent tools">{item.tools.join(' → ')}</p>}{!!item.debug?.length && <details className="live-debug" open><summary>Debug activity</summary><ol aria-label="Realtime debug events">{item.debug.map((event, index) => <li key={index}><span>{event.elapsedMs !== undefined ? `${(event.elapsedMs / 1000).toFixed(1)}s · ` : ''}{event.tool || event.message || event.type}{event.status ? ` · ${event.status}` : ''}{event.revision !== undefined ? ` · revision ${event.revision}` : ''}</span>{event.detail && <details><summary>Details</summary><pre className="whitespace-pre-wrap break-all text-xs">{event.detail}</pre></details>}</li>)}</ol></details>}</div>)}
          </div>
          <form onSubmit={event => { event.preventDefault(); void ask(); }} className="live-composer">
            <label htmlFor="chart-prompt" className="sr-only">Describe a chart change</label>
            <textarea id="chart-prompt" maxLength={2000} rows={3} placeholder={datasetName === 'sales' ? 'Show profit, highlight Beacon…' : 'Compare agreement, highlight Neutral…'} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} />
            <div><span>{thinking ? 'Thinking · send again to change direction' : 'Enter to send · Shift + Enter for a new line'}</span>{thinking && <button type="button" className="pg-tool" onClick={cancelAI}>Cancel</button>}<button className="pg-tool pg-tool-primary" disabled={!ready || !aiReady || !prompt.trim()} type="submit">Send</button></div>
          </form>
          {<VoiceRecorder disabled={!ready || !aiReady} supported={voiceSupported} api={api} onInterrupt={cancelAI} onTranscript={async (text, signal) => {
            let verified = false;
            const response = await ask(text, signal, () => { verified = true; });
            return { text: response || '', verified };
          }} />}
          {!aiReady && <p className="live-local-note">Run this app locally with your OpenAI key to use Realtime AI. Manual JSON edits work everywhere.</p>}
          <p className="live-local-note">MCP: <code>{api}/mcp</code> · <a href={`${process.env.NEXT_PUBLIC_BASE_PATH??''}/docs/guides/mcp/`}>Connect a client</a></p>
        </aside>
      </div>

      <details className="live-inspector">
        <summary>Inspect data &amp; generated edits</summary>
        <div className="live-inspector-content">
          {datasetName === 'survey' && <p className="live-changes">These are synthetic survey counts, not signed scores. Each question has its own sample size (100, 200, 80). Neutral answers remain real data; placing them across a center line does not make half positive or negative. Ask for a layout, then inspect its accepted declaration and receipt.</p>}
          <div className="live-inspector-grid">
            <section><h2>Source data</h2><table className="w-full text-left text-xs"><thead><tr>{Object.keys(activeDataset.rows[0]).map(field => <th key={field}>{field}</th>)}</tr></thead><tbody>{activeDataset.rows.map((row, index) => <tr key={index}>{Object.values(row).map((value, column) => <td key={column}>{String(value)}</td>)}</tr>)}</tbody></table></section>
            <section><h2>Fluent JSON edit</h2><textarea aria-label="Next chart JSON" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} className="live-json" /><div className="live-editor-actions"><span>{draftComplete ? 'Complete chart · update()' : 'Incremental edit · edit()'}</span><button type="button" className="pg-tool pg-tool-primary" disabled={!ready} onClick={() => void submit(draft, 'Custom JSON', draftComplete)}>Send JSON</button></div><p className="live-changes">{changes.join(' · ') || 'Send an instruction to inspect its state changes.'}</p></section>
            <section><h2>Update results</h2><button type="button" className="pg-tool" disabled={!ready || datasetName !== 'sales'} onClick={burst}>Send burst</button><ol aria-label="Update results" className="live-receipts">{receipts.map(item => <li key={item.id}><span>{item.label}</span><code>{item.status}</code></li>)}</ol></section>
          </div>
        </div>
      </details>
      {error && <p role="alert" className="live-error">{error}</p>}
      <footer className="live-footer"><code>await view.edit(message)</code><a href="https://songhaifan.github.io/visdelta/docs/guides/json/">VisDelta API ↗</a></footer>
    </div>
  );
}
