import type { ViewSpec } from './types/index.js';
import { validateTransforms } from './data/validate.js';
import { normalizeFilter } from './data/filter.js';

/** Check transport values before the existing serializer can discard them. */
export function assertSpecValues(value: unknown, path = '$', ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (value instanceof Date && Number.isFinite(value.getTime())) return;
  if (typeof value !== 'object' || value === null) throw new Error(`${path}: expected a JSON value.`);
  if (ancestors.has(value)) throw new Error(`${path}: circular reference.`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error(`${path}: expected a plain object or array.`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertSpecValues(value[index], `${path}[${index}]`, ancestors);
  } else {
    for (const [key, child] of Object.entries(value)) {
      // Optional object properties follow JSON.stringify; array holes do not.
      if (child !== undefined) assertSpecValues(child, `${path}[${JSON.stringify(key)}]`, ancestors);
    }
    if (Object.getOwnPropertySymbols(value).length) throw new Error(`${path}: symbol keys cannot be serialized.`);
  }
  ancestors.delete(value);
}

function object(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object.`);
}

/** Shared ViewSpec structure only; chart validity belongs to chart plugins. */
export function assertSpecShape(value: unknown): asserts value is ViewSpec {
  object(value, '$');
  if (typeof value.mark !== 'string' || !value.mark.trim()) throw new Error('$.mark: expected a non-empty chart type.');
  if (value.data !== undefined && typeof value.data !== 'string') {
    const data = value.data;
    if (!Array.isArray(data)) object(data, '$.data');
    const rows = Array.isArray(data) ? data : data.values;
    if (rows !== undefined) {
      if (!Array.isArray(rows)) throw new Error('$.data.values: expected an array.');
      rows.forEach((row, index) => object(row, `$.data[${index}]`));
    }
    if (!Array.isArray(data)) {
      for (const key of ['name', 'url']) {
        if (data[key] !== undefined && (typeof data[key] !== 'string' || !data[key].trim())) {
          throw new Error(`$.data.${key}: expected a non-empty string.`);
        }
      }
    }
  }
  if (value.encoding !== undefined) {
    object(value.encoding, '$.encoding');
    for (const [channel, definition] of Object.entries(value.encoding)) {
      if (definition === undefined) continue;
      const definitions = Array.isArray(definition) ? definition : [definition];
      for (const entry of definitions) object(entry, `$.encoding.${channel}`);
    }
  }
  if (value.meta !== undefined) object(value.meta, '$.meta');
  if (value.transform !== undefined) validateTransforms(value.transform);
  if (value.filter !== undefined) normalizeFilter(value.filter);
}
