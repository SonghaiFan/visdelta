export type DebugEvent = { type: string; tool?: string; status?: string; text?: string; message?: string; detail?: string; elapsedMs?: number; revision?: number };

/** JSON fallback keeps static-host demos and test transports usable. */
export async function readAgentResponse(response: Response, onEvent: (event: DebugEvent) => void) {
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return response.json();
  if (!response.body) throw new Error('The agent stream is missing.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error || 'The agent stream failed.');
    if (event.type === 'result') result = event.result;
    else onEvent(event);
  };
  try {
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = pending.split('\n'); pending = lines.pop()!;
      for (const line of lines) consume(line);
      if (pending.length > 2_000_000) throw new Error('The agent stream is too large.');
      if (chunk.done) break;
    }
    consume(pending);
    if (!result) throw new Error('The agent stream ended before completing.');
    return result;
  } finally { reader.releaseLock(); }
}
