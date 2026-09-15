// Declared transforms.
//
// A chart state carries its transforms as data — `{ aggregate: { groupby,
// fields } }` and friends — so specs stay serializable and diffable. This file
// is the executor for that grammar: six row operations plus `limit`, run in
// declaration order over plain records. It has no dependencies; the operations
// are small enough that a table library would cost more than it saves.

import type { FilterSpec, TransformSpec } from '../types/index.js';
import { filterPredicate } from './filter.js';
import { validateTransforms } from './validate.js';

type Row = Record<string, unknown>;

interface FoldTransform {
  fields?: string[];
  as?: [string?, string?];
  labels?: Record<string, string>;
  sourceAs?: string;
  labelAs?: string;
}

interface BinTransform {
  field: string;
  as?: string;
  step?: number;
  maxbins?: number;
}

interface SortTransformSpec {
  fields?: Array<string | { field: string; order?: string }>;
  field?: string;
  order?: string;
}

interface TimeUnitTransform {
  field: string;
  unit: string;
  as?: string;
}

interface AggregateFieldSpec {
  op?: string;
  field?: string;
  as?: string;
}

interface AggregateTransform {
  groupby?: string[];
  fields?: AggregateFieldSpec[];
}

export function applyTransforms(source: Row[], transforms: TransformSpec[] = []): Row[] {
  validateTransforms(transforms);
  if (!transforms.length) return source.map((row) => ({ ...row }));
  // Every row carries every field, so later steps see one consistent shape.
  const fields = [...new Set(source.flatMap((row) => Object.keys(row)))];
  let rows = source.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));

  for (const transform of transforms) {
    const t = transform as Record<string, unknown>;
    if (t['filter']) rows = filterRows(rows, t['filter'] as FilterSpec);
    if (t['timeUnit']) rows = timeUnitRows(rows, t['timeUnit'] as TimeUnitTransform);
    if (t['fold']) rows = foldRows(rows, t['fold'] as FoldTransform);
    if (t['bin']) rows = binRows(rows, t['bin'] as BinTransform);
    if (t['aggregate']) rows = aggregateRows(rows, t['aggregate'] as AggregateTransform);
    if (t['sort']) rows = sortRows(rows, t['sort'] as SortTransformSpec);
    if ('limit' in t) rows = rows.slice(0, t['limit'] as number);
  }
  return rows;
}

function filterRows(rows: Row[], filter: FilterSpec): Row[] {
  return rows.filter(filterPredicate(filter));
}

function timeUnitRows(rows: Row[], timeUnit: TimeUnitTransform): Row[] {
  const as = timeUnit.as || `${timeUnit.field}_${timeUnit.unit}`;
  return rows.map((row) => ({ ...row, [as]: monthLabel(row[timeUnit.field]) }));
}

function monthLabel(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('en', { month: 'short' });
}

/** One output row per folded field, keeping the other columns; folded columns are dropped. */
function foldRows(rows: Row[], fold: FoldTransform): Row[] {
  const fields = fold.fields || [];
  const [keyAs = 'key', valueAs = 'value'] = fold.as || [];
  const sourceAs = fold.sourceAs || '__foldField';
  const labelAs = fold.labelAs || keyAs;
  const relabel = sourceAs !== keyAs || fold.labels;
  const labels = fold.labels || {};
  const folded: Row[] = [];
  for (const row of rows) {
    const kept: Row = {};
    for (const [field, value] of Object.entries(row)) if (!fields.includes(field)) kept[field] = value;
    for (const field of fields) {
      const out: Row = { ...kept, [sourceAs]: field, [valueAs]: row[field] };
      if (relabel) out[labelAs] = labels[field] ?? field;
      folded.push(out);
    }
  }
  return folded;
}

function binRows(rows: Row[], bin: BinTransform): Row[] {
  const as = bin.as || `${bin.field}_bin`;
  const startAs = `${as}_start`;
  const endAs = `${as}_end`;
  const values = rows.map((row) => numeric(row[bin.field])).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const step = bin.step ?? Math.max(1, Math.ceil((max - min) / (bin.maxbins ?? 10)));
  return rows.map((row) => {
    const value = numeric(row[bin.field]);
    if (!Number.isFinite(value)) return { ...row, [startAs]: null, [endAs]: null, [as]: null };
    const start = Math.floor((value - min) / step) * step + min;
    return { ...row, [startAs]: start, [endAs]: start + step, [as]: `${start}-${start + step}` };
  });
}

function numeric(value: unknown): number {
  return value == null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
}

/** Groups keep first-appearance order; output columns are the group keys then the aggregates. */
function aggregateRows(rows: Row[], aggregate: AggregateTransform): Row[] {
  const groupby = aggregate.groupby || [];
  const fields = aggregate.fields || [{ op: 'count', as: 'count' }];
  const groups = new Map<string, { keys: Row; rows: Row[] }>();
  for (const row of rows) {
    const keys = Object.fromEntries(groupby.map((field) => [field, row[field]]));
    const id = JSON.stringify(groupby.map((field) => keyToken(row[field])));
    let group = groups.get(id);
    if (!group) { group = { keys, rows: [] }; groups.set(id, group); }
    group.rows.push(row);
  }
  return [...groups.values()].map(({ keys, rows: members }) => {
    const out: Row = { ...keys };
    for (const fieldSpec of fields) {
      const name = fieldSpec.as || `${fieldSpec.op || 'count'}_${fieldSpec.field || 'rows'}`;
      out[name] = aggregateValue(members, fieldSpec);
    }
    return out;
  });
}

function keyToken(value: unknown): unknown {
  return value instanceof Date ? `date:${value.getTime()}` : value === undefined ? '__undefined' : value;
}

/** Missing values (null, undefined, NaN) are skipped by every operator except count, which counts rows. */
function aggregateValue(rows: Row[], fieldSpec: AggregateFieldSpec): number | null {
  const op = fieldSpec.op || 'count';
  if (op === 'count') return rows.length;
  const values = rows
    .map((row) => row[fieldSpec.field || ''])
    .filter((value) => value != null && !Number.isNaN(value as number))
    .map((value) => Number(value));
  if (!values.length) return op === 'sum' ? 0 : null;
  if (op === 'sum') return values.reduce((a, b) => a + b, 0);
  if (op === 'mean') return values.reduce((a, b) => a + b, 0) / values.length;
  if (op === 'min') return Math.min(...values);
  if (op === 'max') return Math.max(...values);
  if (op === 'median') {
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) / 2;
    const lower = sorted[Math.floor(position)];
    const upper = sorted[Math.ceil(position)];
    return lower + (upper - lower) * (position - Math.floor(position));
  }
  throw new Error(`Unsupported aggregate operator: ${op}`);
}

function sortRows(rows: Row[], sort: SortTransformSpec): Row[] {
  const keys = (Array.isArray(sort.fields) ? sort.fields : [sort]).map(sortKey);
  // Stable sort: rows that compare equal keep their declaration order.
  return [...rows].sort((a, b) => {
    for (const { field, direction } of keys) {
      const order = compareValues(a[field], b[field]) * direction;
      if (order) return order;
    }
    return 0;
  });
}

function sortKey(sort: string | { field?: string; order?: string }): { field: string; direction: 1 | -1 } {
  if (typeof sort === 'string') return { field: sort, direction: 1 };
  if (!sort.field) throw new Error('Sort transform needs a field.');
  return { field: sort.field, direction: sort.order === 'descending' ? -1 : 1 };
}

/** Missing values sort first ascending; otherwise the language's own `<` ordering. */
function compareValues(a: unknown, b: unknown): number {
  const missingA = a == null || (typeof a === 'number' && Number.isNaN(a));
  const missingB = b == null || (typeof b === 'number' && Number.isNaN(b));
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? -1 : 1;
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}
