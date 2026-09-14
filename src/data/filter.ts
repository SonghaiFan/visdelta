import type { FilterSpec } from '../types/index.js';
import { comparableValue, temporalDate } from './types.js';

const operators = ['equal', 'notEqual', 'oneOf', 'gt', 'gte', 'lt', 'lte'];

/** A small comparison grammar, deliberately not JavaScript evaluation. */
export function normalizeFilter(value: unknown): FilterSpec {
  if (typeof value === 'string') {
    const match = value.trim().match(/^datum\.([A-Za-z_$][\w$]*)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!match) throw new Error('Invalid filter expression. Use datum.field <operator> literal.');
    const [, field, operator, text] = match;
    let literal: unknown;
    const raw = text.trim();
    if (/^'(?:[^'\\]|\\['\\])*'$/.test(raw)) literal = raw.slice(1, -1).replace(/\\(['\\])/g, '$1');
    else {
      try { literal = JSON.parse(raw); }
      catch { throw new Error('Invalid filter literal: quote strings; use finite numbers, booleans, or null.'); }
    }
    if (literal !== null && !['string', 'number', 'boolean'].includes(typeof literal)) {
      throw new Error('Filter expressions accept scalar literals only.');
    }
    const key = ({ '===': 'equal', '==': 'equal', '!==': 'notEqual', '!=': 'notEqual',
      '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' } as Record<string, string>)[operator]!;
    return normalizeFilter({ field, [key]: literal });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Filter must be an object or comparison expression.');
  const filter = value as FilterSpec;
  if (typeof filter.field !== 'string' || !filter.field.trim()) throw new Error('Filter requires a non-empty field.');
  if (Object.keys(filter).some(key => key !== 'field' && !operators.includes(key))) throw new Error('Unsupported filter operator.');
  if (!operators.some(key => key in filter)) throw new Error('Filter requires a comparison operator.');
  if ('oneOf' in filter && !Array.isArray(filter.oneOf)) throw new Error('Filter oneOf must be an array.');
  for (const key of ['gt', 'gte', 'lt', 'lte']) {
    const bound = filter[key];
    if (key in filter && !isRangeBound(bound)) {
      throw new Error(`Filter ${key} must be a finite number or valid ISO date.`);
    }
  }
  return filter;
}

export function filterPredicate(input: unknown): (row: Record<string, unknown>) => boolean {
  const filter = normalizeFilter(input);
  return row => matchesFilter(row, filter);
}

/** Evaluate a normalized predicate; shared by filtering, highlighting and crop. */
export function matchesFilter(row: Record<string, unknown>, filter: FilterSpec): boolean {
    const value = row[filter.field];
    const comparable = comparableValue(value);
    if ('equal' in filter && comparable !== comparableValue(filter.equal)) return false;
    if ('notEqual' in filter && comparable === comparableValue(filter['notEqual'])) return false;
    if ('oneOf' in filter && !filter.oneOf!.some(item => comparableValue(item) === comparable)) return false;
    const hasRange = ['gt', 'gte', 'lt', 'lte'].some(key => key in filter);
    if (hasRange && (value == null || value === '' || typeof value === 'boolean')) return false;
    const rangeValue = typeof comparable === 'number' ? comparable : Number(comparable);
    if (hasRange && !Number.isFinite(rangeValue)) return false;
    // Positive comparisons exclude missing/NaN values instead of letting them
    // pass through the inverse comparisons previously used here.
    if ('gte' in filter && !(rangeValue >= Number(comparableValue(filter.gte)))) return false;
    if ('gt' in filter && !(rangeValue > Number(comparableValue(filter.gt)))) return false;
    if ('lte' in filter && !(rangeValue <= Number(comparableValue(filter.lte)))) return false;
    if ('lt' in filter && !(rangeValue < Number(comparableValue(filter.lt)))) return false;
    return true;
}

/** Whether a view changes row membership through its data pipeline. */
export function hasRowFilter(spec: { filter?: unknown; transform?: unknown[] }): boolean {
  return spec.filter != null || (spec.transform ?? []).some((transform) =>
    Boolean(transform && typeof transform === 'object' && 'filter' in transform)
  );
}

function isRangeBound(value: unknown): boolean {
  return (typeof value === 'number' && Number.isFinite(value)) || Boolean(temporalDate(value));
}
