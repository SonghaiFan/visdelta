import type { ViewSpec } from '../types/index.js';
import { cloneState } from '../grammar/view-state.js';
import { normalizeDataSource } from '../charts/authoring.js';
import { loadData } from './data.js';
import { resolveSpecDataTypes } from '../data/types.js';

export function createSpecDataResolver(dataBindings?: Record<string, unknown>) {
  const declared = cloneState(dataBindings ?? {});
  const sourceCache = new Map<string, Promise<unknown[]>>();
  const resolveData = async (spec: ViewSpec): Promise<ViewSpec> => {
    let data = normalizeDataSource(spec.data);
    if (data && typeof data === 'object' && 'name' in data && !('url' in data)) {
      const name = String((data as { name: string }).name);
      if (!(name in declared)) throw new Error(`transition(): missing dataset "${name}". Pass options.data or bind inline data.`);
      data = normalizeDataSource(declared[name]);
    }
    if (!data || typeof data !== 'object') throw new Error('transition(): each visualization needs a data source.');
    if (!Array.isArray(data) && !Array.isArray((data as { values?: unknown }).values) && !('url' in data)) {
      throw new Error('transition(): expected rows, { values }, or { url }.');
    }
    if (!Array.isArray(data) && 'url' in data) {
      const urlSource = data as { url: string; type?: string; format?: { type?: string } };
      data = { ...urlSource, type: urlSource.type ?? urlSource.format?.type ?? (/\.json(?:[?#]|$)/i.test(urlSource.url) ? 'json' : 'csv') };
    }
    const cacheKey = JSON.stringify(data);
    let pending = sourceCache.get(cacheKey);
    if (!pending) {
      pending = loadData({ rows: data }).then(result => cloneState(result.rows));
      sourceCache.set(cacheKey, pending);
    }
    const rows = await pending;
    return resolveSpecDataTypes({ ...spec, data: { values: rows } }, rows);
  };

  return resolveData;
}
