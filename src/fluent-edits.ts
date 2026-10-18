/** A chart-owned, allowlisted fluent call. A batch produces one destination. */
export interface FluentEdit { method: string; args: unknown[] }
export interface EditMessage {
  requestId: string;
  baseRevision: number;
  edits: FluentEdit[];
}

/** Canonical JSON also rejects values that cannot safely cross a tool boundary. */
export function editJSON(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(editJSON).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${editJSON((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  throw new Error('Edits must contain only JSON values.');
}
export function parseEdit(input: EditMessage | string): EditMessage {
  const value = JSON.parse(editJSON(typeof input === 'string' ? JSON.parse(input) : input));
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['requestId', 'baseRevision', 'edits'].includes(key))
    || typeof value.requestId !== 'string' || !value.requestId.trim() || value.requestId.length > 128
    || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0
    || !Array.isArray(value.edits) || !value.edits.length || value.edits.length > 32) {
    throw new Error('edit() requires requestId (1–128 characters), baseRevision, and 1–32 edits.');
  }
  for (const call of value.edits) {
    if (!call || typeof call !== 'object' || Array.isArray(call)
      || Object.keys(call).some(key => !['method', 'args'].includes(key))
      || typeof call.method !== 'string' || !Array.isArray(call.args)) {
      throw new Error('Each edit requires method and args.');
    }
  }
  return value;
}
