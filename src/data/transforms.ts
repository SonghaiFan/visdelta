import type { FilterSpec, TransformSpec } from '../types/index.js';
import { filterPredicate } from './filter.js';
import { validateTransforms } from './validate.js';
import { runtimeAq } from '../runtime/dependencies.js';

interface ArqueroTable {
  objects(): Record<string, unknown>[];
  filter(fn: unknown): ArqueroTable;
  derive(spec: Record<string, unknown>): ArqueroTable;
  fold(fields: string[], options: Record<string, unknown>): ArqueroTable;
  orderby(...fields: unknown[]): ArqueroTable;
  slice(start: number, end?: number): ArqueroTable;
  groupby(...fields: string[]): ArqueroTable;
  rollup(spec: Record<string, unknown>): ArqueroTable;
}

interface Arquero {
  from(data: Record<string, unknown>[]): ArqueroTable;
  escape<T>(fn: (row: T) => unknown): unknown;
  desc(field: string): unknown;
  op: {
    count(): unknown;
    mean(field: string): unknown;
    min(field: string): unknown;
    max(field: string): unknown;
    median(field: string): unknown;
    sum(field: string): unknown;
  };
}

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

export function applyTransforms(
  source: Record<string, unknown>[],
  transforms: TransformSpec[] = [],
  aq: Arquero = runtimeAq as unknown as Arquero
): Record<string, unknown>[] {
  validateTransforms(transforms);
  if (!transforms.length) return source.map((row) => ({ ...row }));
  const fields = [...new Set(source.flatMap(row => Object.keys(row)))];
  let table = aq.from(source.map(row => Object.fromEntries(fields.map(field => [field, row[field]]))));

  transforms.forEach((transform) => {
    const t = transform as Record<string, unknown>;
    if (t['filter']) table = filterRows(table, t['filter'] as FilterSpec, aq);
    if (t['timeUnit']) table = timeUnitRows(table, t['timeUnit'] as TimeUnitTransform, aq);
    if (t['fold']) table = foldRows(table, t['fold'] as FoldTransform, aq);
    if (t['bin']) table = binRows(table, t['bin'] as BinTransform, aq);
    if (t['aggregate']) table = aggregateRows(table, t['aggregate'] as AggregateTransform, aq);
    if (t['sort']) table = sortRows(table, t['sort'] as SortTransformSpec, aq);
    if ('limit' in t) table = table.slice(0, t['limit'] as number);
  });

  return table.objects();
}

function timeUnitRows(table: ArqueroTable, timeUnit: TimeUnitTransform, aq: Arquero): ArqueroTable {
  const as = timeUnit.as || `${timeUnit.field}_${timeUnit.unit}`;
  return table.derive({
    [as]: aq.escape((row: Record<string, unknown>) => monthLabel(row[timeUnit.field]))
  });
}

function monthLabel(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('en', { month: 'short' });
}

function filterRows(table: ArqueroTable, filter: FilterSpec, aq: Arquero): ArqueroTable {
  return table.filter(aq.escape(filterPredicate(filter)));
}

function foldRows(table: ArqueroTable, fold: FoldTransform, aq: Arquero): ArqueroTable {
  const fields = fold.fields || [];
  const [keyAs = 'key', valueAs = 'value'] = fold.as || [];
  const sourceAs = fold.sourceAs || '__foldField';
  const labelAs = fold.labelAs || keyAs;

  let folded = table.fold(fields, { as: [sourceAs, valueAs] });

  if (sourceAs !== keyAs || fold.labels) {
    const labels = fold.labels || {};
    folded = folded.derive({
      [labelAs]: aq.escape((row: Record<string, unknown>) => labels[row[sourceAs] as string] ?? row[sourceAs])
    });
  }

  return folded;
}

function binRows(table: ArqueroTable, bin: BinTransform, aq: Arquero): ArqueroTable {
  const as = bin.as || `${bin.field}_bin`;
  const startAs = `${as}_start`;
  const endAs = `${as}_end`;
  const rows = table.objects();
  const numeric = (value: unknown) => value == null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
  const values = rows.map((row) => numeric(row[bin.field])).filter(Number.isFinite);
  const min = values.length ? values.reduce((a, b) => Math.min(a, b)) : 0;
  const max = values.length ? values.reduce((a, b) => Math.max(a, b)) : 0;
  const step = bin.step ?? Math.max(1, Math.ceil((max - min) / (bin.maxbins ?? 10)));

  return table.derive({
    [startAs]: aq.escape((row: Record<string, unknown>) => {
      const value = numeric(row[bin.field]);
      if (!Number.isFinite(value)) return null;
      return Math.floor((value - min) / step) * step + min;
    }),
    [endAs]: aq.escape((row: Record<string, unknown>) => {
      const value = numeric(row[bin.field]);
      if (!Number.isFinite(value)) return null;
      return Math.floor((value - min) / step) * step + min + step;
    }),
    [as]: aq.escape((row: Record<string, unknown>) => {
      const value = numeric(row[bin.field]);
      if (!Number.isFinite(value)) return null;
      const start = Math.floor((value - min) / step) * step + min;
      return `${start}-${start + step}`;
    })
  });
}

function aggregateRows(table: ArqueroTable, aggregate: AggregateTransform, aq: Arquero): ArqueroTable {
  const groupby = aggregate.groupby || [];
  const fields = aggregate.fields || [{ op: 'count', as: 'count' }];
  const values = Object.fromEntries(
    fields.map((fieldSpec) => [
      fieldSpec.as || `${fieldSpec.op || 'count'}_${fieldSpec.field || 'rows'}`,
      aggregateExpression(fieldSpec, aq)
    ])
  );
  return table.groupby(...groupby).rollup(values);
}

function aggregateExpression(fieldSpec: AggregateFieldSpec, aq: Arquero): unknown {
  const op = fieldSpec.op || 'count';
  const field = fieldSpec.field || '';
  if (op === 'count') return aq.op.count();
  if (op === 'mean') return aq.op.mean(field);
  if (op === 'min') return aq.op.min(field);
  if (op === 'max') return aq.op.max(field);
  if (op === 'median') return aq.op.median(field);
  if (op === 'sum') return aq.op.sum(field);
  throw new Error(`Unsupported aggregate operator: ${op}`);
}

function sortRows(table: ArqueroTable, sort: SortTransformSpec, aq: Arquero): ArqueroTable {
  if (Array.isArray(sort.fields)) {
    return table.orderby(...sort.fields.map((field) => sortField(field, aq)));
  }
  return table.orderby(sortField(sort, aq));
}

function sortField(sort: string | { field?: string; order?: string }, aq: Arquero): unknown {
  if (typeof sort === 'string') return sort;
  if (sort.order === 'descending') return aq.desc(sort.field || '');
  return sort.field;
}
