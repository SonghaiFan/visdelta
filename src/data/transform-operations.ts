import { filterPredicate } from './filter.js';
import type { FilterSpec, TransformSpec } from '../types/index.js';

export type TransformRow = Record<string, unknown>;

interface FoldTransform {
  fields?: string[];
  as?: [string?, string?];
  labels?: Record<string, string>;
  sourceAs?: string;
  labelAs?: string;
}

interface BinTransform { field: string; as?: string; step?: number; maxbins?: number; }
interface TimeUnitTransform { field: string; unit: string; as?: string; }
interface AggregateFieldSpec { op?: string; field?: string; as?: string; }
interface AggregateTransform { groupby?: string[]; fields?: AggregateFieldSpec[]; }
interface SortKey { field: string; order?: string; }
interface SortTransform { fields?: Array<string | SortKey>; field?: string; order?: string; }

/** Apply one declared operation to ordinary rows. Lineage uses these same row operations. */
export function applyTransformOperation(rows: TransformRow[], transform: TransformSpec): TransformRow[] {
  const operation = transform as Record<string, unknown>;
  if (operation.filter) return rows.filter(filterPredicate(operation.filter as FilterSpec));
  if (operation.timeUnit) return timeUnitRows(rows, operation.timeUnit as TimeUnitTransform);
  if (operation.fold) return foldRows(rows, operation.fold as FoldTransform);
  if (operation.bin) return binRows(rows, operation.bin as BinTransform);
  if (operation.aggregate) return aggregateRows(rows, operation.aggregate as AggregateTransform);
  if (operation.sort) return sortRows(rows, operation.sort as SortTransform);
  if ('limit' in operation) return rows.slice(0, Number(operation.limit));
  return rows;
}

export function groupRowsByFields<T>(rows: T[], fields: string[], value: (row: T, field: string) => unknown): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = canonicalKey(fields.map(field => value(row, field)));
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()];
}

export function sortRowsBy<T>(rows: T[], sort: SortTransform, value: (row: T, field: string) => unknown): T[] {
  const keys = (Array.isArray(sort.fields) ? sort.fields : [sort]).map(entry =>
    typeof entry === 'string' ? { field: entry } : entry
  );
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      if (!key.field) continue;
      const comparison = compareValues(value(a, key.field), value(b, key.field));
      if (comparison) return key.order === 'descending' ? -comparison : comparison;
    }
    return 0;
  });
}

function timeUnitRows(rows: TransformRow[], config: TimeUnitTransform): TransformRow[] {
  const as = config.as || `${config.field}_${config.unit}`;
  return rows.map(row => ({ ...row, [as]: monthLabel(row[config.field]) }));
}

function monthLabel(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('en', { month: 'short' });
}

function foldRows(rows: TransformRow[], fold: FoldTransform): TransformRow[] {
  const fields = fold.fields || [];
  const [keyAs = 'key', valueAs = 'value'] = fold.as || [];
  const sourceAs = fold.sourceAs || '__foldField';
  const labelAs = fold.labelAs || keyAs;
  const relabel = sourceAs !== keyAs || fold.labels;
  const labels = fold.labels || {};
  const folded: TransformRow[] = [];
  for (const row of rows) {
    const kept = Object.fromEntries(Object.entries(row).filter(([field]) => !fields.includes(field)));
    for (const field of fields) {
      const out = { ...kept, [sourceAs]: field, [valueAs]: row[field] };
      if (relabel) out[labelAs] = labels[field] ?? field;
      folded.push(out);
    }
  }
  return folded;
}

function binRows(rows: TransformRow[], bin: BinTransform): TransformRow[] {
  const as = bin.as || `${bin.field}_bin`;
  const values = rows.map(row => numeric(row[bin.field])).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const step = bin.step ?? Math.max(1, Math.ceil((max - min) / (bin.maxbins ?? 10)));
  return rows.map(row => {
    const value = numeric(row[bin.field]);
    if (!Number.isFinite(value)) return { ...row, [`${as}_start`]: null, [`${as}_end`]: null, [as]: null };
    const start = Math.floor((value - min) / step) * step + min;
    return { ...row, [`${as}_start`]: start, [`${as}_end`]: start + step, [as]: `${start}-${start + step}` };
  });
}

function numeric(value: unknown): number {
  return value == null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
}

function aggregateRows(rows: TransformRow[], aggregate: AggregateTransform): TransformRow[] {
  const groupby = aggregate.groupby || [];
  const fields = aggregate.fields || [{ op: 'count', as: 'count' }];
  return groupRowsByFields(rows, groupby, (row, field) => row[field]).map(members => {
    const output = Object.fromEntries(groupby.map(field => [field, members[0]?.[field]]));
    for (const metric of fields) {
      const name = metric.as || `${metric.op || 'count'}_${metric.field || 'rows'}`;
      output[name] = aggregateValue(members, metric);
    }
    return output;
  });
}

function aggregateValue(rows: TransformRow[], metric: AggregateFieldSpec): number | null {
  const op = metric.op || 'count';
  if (op === 'count') return rows.length;
  const values = rows.map(row => row[metric.field || ''])
    .filter(value => value != null && value !== '' && typeof value !== 'boolean')
    .map(Number).filter(Number.isFinite);
  if (!values.length) return op === 'sum' ? 0 : null;
  if (op === 'sum') return values.reduce((a, b) => a + b, 0);
  if (op === 'mean') return values.reduce((a, b) => a + b, 0) / values.length;
  if (op === 'min') return Math.min(...values);
  if (op === 'max') return Math.max(...values);
  if (op === 'median') {
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) / 2;
    const lower = sorted[Math.floor(position)]!;
    const upper = sorted[Math.ceil(position)]!;
    return lower + (upper - lower) * (position - Math.floor(position));
  }
  throw new Error(`Unsupported aggregate operator: ${op}`);
}

function sortRows(rows: TransformRow[], sort: SortTransform): TransformRow[] {
  return sortRowsBy(rows, sort, (row, field) => row[field]);
}

function compareValues(a: unknown, b: unknown): number {
  const missingA = a == null || (typeof a === 'number' && Number.isNaN(a));
  const missingB = b == null || (typeof b === 'number' && Number.isNaN(b));
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? -1 : 1;
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}

function canonicalKey(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return { date: value.toISOString() };
  if (value === undefined) return { undefined: true };
  if (typeof value === 'number' && Number.isNaN(value)) return { number: 'NaN' };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonicalValue(item)]));
}
