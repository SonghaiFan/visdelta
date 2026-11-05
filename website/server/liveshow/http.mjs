import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createChartMcpServer} from '@visdelta/mcp';
import {createBrowserBridge} from './browser-bridge.mjs';
import {readFileSync} from 'node:fs';
const docsBuild=JSON.parse(readFileSync(new URL(import.meta.resolve('visdelta/docs/index.json')),'utf8'));
import { transcribeSpeech, synthesizeSpeech } from './speech.mjs';
import { createAgentRunner } from './agent.mjs';
import { createRealtimeCompletion } from './realtime.mjs';
import { AIError } from './ai.mjs';

// Never log or return provider bodies, request headers or credentials.
export function createAIHandler({key=process.env.OPENAI_API_KEY,model=process.env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',
  transcribe=transcribeSpeech,synthesize=synthesizeSpeech,complete=createRealtimeCompletion(),allowedOrigin,browser=createBrowserBridge()}={}) {
  let active = 0;
  const requests = new Set();
  const runAgent = createAgentRunner({complete});
  const handleAI = async function(request, response, pathname) {
    if (!pathname.startsWith('/api/liveshow/')) return false;
    const send = (status, body) => { if (!response.destroyed) response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); };
    const origin = request.headers.origin;
    const hostname = new URL(`http://${request.headers.host}`).hostname;
    if (!['localhost', '127.0.0.1'].includes(hostname)) { send(403, { error: 'Use the local loopback address.' }); return true; }
    const ownOrigin = `http://${request.headers.host}`;
    if (origin && origin!==ownOrigin && origin!==allowedOrigin && origin!==allowedOrigin?.replace('127.0.0.1','localhost')) {send(403,{error:'Only the local Studio may call this service.'});return true;}
    const route=pathname.replace(/\/$/,'');
    if(route==='/api/liveshow/mcp') {
      const server=createChartMcpServer(browser);
      const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      response.on('close',()=>{void transport.close();void server.close();});
      try{await server.connect(transport);await transport.handleRequest(request,response);}
      catch{if(!response.headersSent)send(500,{error:'MCP request failed.'});}
      return true;
    }
    if(route==='/api/liveshow/browser/next'&&request.method==='GET'){send(200,browser.next(new URL(request.url,'http://localhost').searchParams.get('clientId')));return true;}
    if (pathname.replace(/\/$/, '') === '/api/liveshow/status' && request.method === 'GET') {
      send(200,{visdeltaBuild:{version:docsBuild.packageVersion,buildSha256:docsBuild.buildSha256},configured:Boolean(key?.trim()),provider:'openai-realtime',streaming:true,voiceInput:Boolean(key?.trim()),model}); return true;
    }
    if (!['/api/liveshow/agent', '/api/liveshow/transcribe', '/api/liveshow/speech', '/api/liveshow/browser/state', '/api/liveshow/browser/receipt'].includes(pathname.replace(/\/$/, '')) || request.method !== 'POST') {
      send(405, { error: 'Unsupported API request.' }); return true;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'Use application/json.' }); return true; }
    if (active >= 2) { send(429, { error: 'Two AI requests are already running. Please wait.' }); return true; }
    active++;
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', disconnected);
    let streaming = false; const started = Date.now();
    const emit = event => { if (!response.destroyed && !response.writableEnded) response.write(JSON.stringify({ ...event, elapsedMs: Date.now() - started }) + '\n'); };
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > (pathname.includes('/agent') || pathname.includes('/transcribe') || pathname.includes('/browser/') ? 4_000_000 : 64_000)) throw new AIError(413, 'The chart request is too large.');
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AIError(400, 'Invalid JSON request.'); }
      const route = pathname.replace(/\/$/, '');
      if(route==='/api/liveshow/browser/state'){browser.publish(input);send(200,{ok:true});return true;}
      if(route==='/api/liveshow/browser/receipt'){browser.finish(input);send(200,{ok:true});return true;}
      if (route === '/api/liveshow/transcribe') { send(200, await transcribe(input, { key, signal: controller.signal })); return true; }
      if (route === '/api/liveshow/speech') {
        const bytes = await synthesize(input, { key, signal: controller.signal });
        if (!response.destroyed) response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).end(bytes);
        return true;
      }
      streaming = pathname.includes('/agent') && request.headers.accept?.includes('application/x-ndjson');
      if (streaming) { response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }); response.flushHeaders(); }
      const result = await runAgent(input, { key, model, signal: controller.signal, ...(streaming ? { onEvent: emit } : {}) });
      if (streaming) { emit({ type: 'result', result }); response.end(); } else send(200, result);
    } catch (error) {
      const status = error instanceof AIError ? error.status : controller.signal.aborted ? 504 : 502;
      const message = error instanceof AIError ? error.message : controller.signal.aborted ? 'AI request timed out. Please try again.' : 'Unable to reach OpenAI Realtime. Please try again.';
      if (streaming) { emit({ type: 'error', error: message }); response.end(); } else send(status, { error: message });
    } finally { clearTimeout(timeout); response.off('close', disconnected); requests.delete(controller); active--; }
    return true;
  };
  handleAI.close = () => { for (const controller of requests) controller.abort(); runAgent.close(); browser.close(); };
  return handleAI;
}
