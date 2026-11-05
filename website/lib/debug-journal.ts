/** Local, bounded public execution history. Never includes private reasoning or media. */
export const debugLogKey = 'visdelta-liveshow.debug.v1';
export type DebugRecord = { time: string; turn: string; type: string; [key: string]: unknown };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const secretField = /authorization|api.?key|password|secret|access.?token|reasoning|audio|dataurl/i;
export function safeDebugValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDebugValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretField.test(key) ? '[redacted]' : safeDebugValue(item)]));
  if (typeof value === 'string') return value.replace(/\bsk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 64000);
  return value;
}
export function readDebugLog(storage: Pick<Storage, 'getItem'>): DebugRecord[] {
  try { const value = JSON.parse(storage.getItem(debugLogKey) ?? '[]'); return Array.isArray(value) ? value.slice(-500) : []; } catch { return []; }
}
export function appendDebugRecord(storage: Storage, record: DebugRecord, fallback: DebugRecord[] = []) {
  const stored = readDebugLog(storage);
  const previous = fallback.length && (!stored.length || fallback.at(-1)!.time >= stored.at(-1)!.time) ? fallback : stored;
  const records = [...previous, safeDebugValue(record) as DebugRecord].slice(-500);
  // Browser quota or disabled storage must never stop chart interaction.
  let persisted = false;
  try { storage.setItem(debugLogKey, JSON.stringify(records)); persisted = true; } catch { /* UI reports unavailable persistence. */ }
  return { records, persisted };
}
