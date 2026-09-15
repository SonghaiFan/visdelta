import { matchesFilter, normalizeFilter } from './filter.js';
import { validateTransforms } from './validate.js';
import type { DataRow, FilterSpec, TransformSpec } from '../types/index.js';

export type DatumKey = string | number;
export type DatumKeySpec = string | string[] | ((datum: DataRow, index: number) => DatumKey);

export interface LineageAtom {
  /** Collision-safe identity for one datum and an optional reshaping branch. */
  id: string;
  datumKey: DatumKey;
  branch: string[];
}

export interface LineageContribution {
  atom: LineageAtom;
  value: number;
}

export interface LineageRow {
  datum: DataRow;
  /** Local identity at this view's current grouping grain. */
  markKey: string;
  grain: string[];
  lineage: LineageAtom[];
  contributions: Record<string, LineageContribution[]>;
}

export interface LineageCapability {
  splittable: boolean;
  reasons: string[];
}

export interface LineageTable {
  rows: LineageRow[];
  grain: string[];
  identity: {
    key: DatumKeySpec;
    mode: 'explicit' | 'inferred-id' | 'index';
    stable: boolean;
  };
  capability: LineageCapability;
}

export interface LineageCompileOptions {
  /** Stable identity of source data records. */
  key?: DatumKeySpec;
  /** Local mark grouping before transforms; deliberately distinct from key. */
  grain?: string[];
}

export interface LineageEdge {
  /** Direction-independent identity of one non-empty joint-grain cell. */
  key: string;
  from: string;
  to: string;
  atoms: LineageAtom[];
  sourceValue: number | null;
  targetValue: number | null;
}

export type LineageOperation = 'update' | 'split' | 'merge' | 'reaggregate' | 'exit' | 'enter';

export interface LineageComponent {
  operation: LineageOperation;
  from: string[];
  to: string[];
  edges: LineageEdge[];
}

export interface LineageCorrespondence {
  /** Homogeneous operation, or `mixed` when components have different operations. */
  mode: LineageOperation | 'mixed' | 'none';
  commonRefinement: string[];
  fromGrain: string[];
  toGrain: string[];
  /** Connected components of the bipartite endpoint correspondence graph. */
  components: LineageComponent[];
  /** Non-empty intersections of the two endpoint partitions. */
  edges: LineageEdge[];
  enter: string[];
  exit: string[];
  splittable: boolean;
  reasons: string[];
}

export interface CorrespondenceOptions {
  fromField?: string;
  toField?: string;
}

export interface GroupingTreeNode {
  key: string;
  field: string | null;
  value: unknown;
  children: GroupingTreeNode[];
  markKeys: string[];
  lineage: LineageAtom[];
}

type TrackedRow = LineageRow;
type AnyRecord = Record<string, unknown>;

/**
 * Execute a supported transform pipeline while retaining datum provenance.
 * This is deliberately separate from rendering: motion planning consumes the
 * result, while chart renderers remain free to transform ordinary rows.
 */
export function compileLineage(
  source: DataRow[],
  transforms: TransformSpec[] = [],
  options: LineageCompileOptions = {}
): LineageTable {
  validateTransforms(transforms);
  const identity = resolveIdentity(source, options.key);
  const seen = new Set<string>();
  let grain = options.grain ? [...options.grain] : keyFields(identity.key);
  let capability: LineageCapability = identity.mode === 'index'
    ? { splittable: false, reasons: ['datum identity fell back to row index'] }
    : { splittable: true, reasons: [] };
  let rows = source.map((datum, index): TrackedRow => {
    const datumKey = identity.accessor(datum, index);
    const encoded = canonicalKey(datumKey);
    if (seen.has(encoded)) throw new Error(`Duplicate datum key: ${String(datumKey)}`);
    seen.add(encoded);
    const atom = createAtom(datumKey, []);
    return {
      datum: { ...datum },
      markKey: markKey(datum, grain, datumKey),
      grain: [...grain],
      lineage: [atom],
      contributions: numericContributions(datum, atom)
    };
  });

  for (const transform of transforms) {
    const operation = transform as AnyRecord;
    if (operation.filter != null) {
      const filter = normalizeFilter(operation.filter);
      rows = rows.filter((row) => matchesFilter(row.datum, filter));
    } else if (operation.timeUnit) {
      rows = timeUnitRows(rows, operation.timeUnit as AnyRecord);
    } else if (operation.fold) {
      const fold = operation.fold as AnyRecord;
      rows = foldRows(rows, fold);
      const [keyAs = 'key'] = fold.as as string[] | undefined ?? [];
      const foldDimension = String(fold.labelAs ?? keyAs);
      if (!grain.includes(foldDimension)) grain = [...grain, foldDimension];
    } else if (operation.bin) {
      rows = binRows(rows, operation.bin as AnyRecord);
    } else if (operation.aggregate) {
      const result = aggregateRows(rows, operation.aggregate as AnyRecord);
      rows = result.rows;
      grain = result.grain;
      capability = combineCapabilities(capability, result.capability);
    } else if (operation.sort) {
      rows = sortRows(rows, operation.sort as AnyRecord);
    } else if ('limit' in operation) {
      rows = rows.slice(0, Number(operation.limit));
    }
    rows = rows.map((row) => ({
      ...row,
      grain: [...grain],
      markKey: markKey(row.datum, grain, row.lineage[0]?.datumKey ?? '')
    }));
  }

  return {
    rows,
    grain,
    identity: {
      key: identity.key,
      mode: identity.mode,
      stable: identity.mode !== 'index'
    },
    capability
  };
}

/** Build the AniVis-style dimension tree for one compiled endpoint. */
export function buildGroupingTree(table: LineageTable): GroupingTreeNode {
  const root: GroupingTreeNode = {
    key: 'root', field: null, value: null, children: [], markKeys: [], lineage: []
  };
  for (const row of table.rows) {
    mergeAtoms(root.lineage, row.lineage);
    let node = root;
    table.grain.forEach((field, depth) => {
      const value = row.datum[field];
      const key = canonicalKey([depth, field, value]);
      let child = node.children.find((candidate) => candidate.key === key);
      if (!child) {
        child = { key, field, value, children: [], markKeys: [], lineage: [] };
        node.children.push(child);
      }
      mergeAtoms(child.lineage, row.lineage);
      node = child;
    });
    if (!node.markKeys.includes(row.markKey)) node.markKeys.push(row.markKey);
  }
  return root;
}

/**
 * Match compiled marks through shared lineage atoms. Unlike a D3 join key,
 * this relation may be one-to-many, many-to-one, or many-to-many.
 */
export function correspondLineage(
  from: LineageTable,
  to: LineageTable,
  options: CorrespondenceOptions = {}
): LineageCorrespondence {
  const sourcesByAtom = rowsByAtom(from.rows);
  const targetsByAtom = rowsByAtom(to.rows);
  const pairs = new Map<string, { source: LineageRow; target: LineageRow; atoms: LineageAtom[] }>();

  for (const [atomId, sources] of sourcesByAtom) {
    const targets = targetsByAtom.get(atomId) ?? [];
    for (const source of sources) {
      for (const target of targets) {
        const key = canonicalKey([source.markKey, target.markKey]);
        const pair = pairs.get(key) ?? { source, target, atoms: [] };
        const atom = source.lineage.find((candidate) => candidate.id === atomId)!;
        if (!pair.atoms.some((candidate) => candidate.id === atom.id)) pair.atoms.push(atom);
        pairs.set(key, pair);
      }
    }
  }

  const edges = [...pairs.values()].map(({ source, target, atoms }): LineageEdge => ({
    key: canonicalKey(atoms.map((atom) => atom.id).sort()),
    from: source.markKey,
    to: target.markKey,
    atoms,
    sourceValue: contributionValue(source, options.fromField, atoms),
    targetValue: contributionValue(target, options.toField, atoms)
  }));
  const components = correspondenceComponents(from.rows, to.rows, edges);
  const exit = components.filter(({ operation }) => operation === 'exit').flatMap(({ from }) => from);
  const enter = components.filter(({ operation }) => operation === 'enter').flatMap(({ to }) => to);
  const reasons = [...new Set([...from.capability.reasons, ...to.capability.reasons])];

  return {
    mode: correspondenceMode(components),
    commonRefinement: [...new Set([...from.grain, ...to.grain])].sort(),
    fromGrain: [...from.grain],
    toGrain: [...to.grain],
    components,
    edges,
    enter,
    exit,
    splittable: from.capability.splittable && to.capability.splittable,
    reasons
  };
}

/** Canonical local mark identity used by lineage tables and motion plans. */
export function lineageMarkKey(datum: DataRow, grain: string[]): string {
  return markKey(datum, grain, '');
}

function resolveIdentity(source: DataRow[], requested?: DatumKeySpec) {
  const inferredIds = source.map((row) => row.id);
  const hasUniqueIds = source.length > 0 &&
    inferredIds.every((value) => value != null) &&
    new Set(inferredIds.map(canonicalKey)).size === source.length;
  const mode = requested != null
    ? 'explicit' as const
    : hasUniqueIds
      ? 'inferred-id' as const
      : 'index' as const;
  const key: DatumKeySpec = requested ?? (mode === 'inferred-id' ? 'id' : (_row: DataRow, index: number) => index);
  const accessor = typeof key === 'function'
    ? key
    : Array.isArray(key)
      ? (row: DataRow) => canonicalKey(key.map((field) => row[field]))
      : (row: DataRow) => row[key] as DatumKey;
  return { key, mode, accessor };
}

function keyFields(key: DatumKeySpec): string[] {
  return typeof key === 'string' ? [key] : Array.isArray(key) ? [...key] : [];
}

function createAtom(datumKey: DatumKey, branch: string[]): LineageAtom {
  return { id: canonicalKey([datumKey, branch]), datumKey, branch };
}

function numericContributions(datum: DataRow, atom: LineageAtom): Record<string, LineageContribution[]> {
  return Object.fromEntries(Object.entries(datum).flatMap(([field, value]) =>
    aggregateNumber(value) != null
      ? [[field, [{ atom, value: aggregateNumber(value)! }]]]
      : []
  ));
}

function timeUnitRows(rows: TrackedRow[], config: AnyRecord): TrackedRow[] {
  const field = String(config.field);
  const as = String(config.as ?? `${field}_${config.unit}`);
  return rows.map((row) => {
    const date = row.datum[field] instanceof Date ? row.datum[field] as Date : new Date(row.datum[field] as string);
    const value = Number.isNaN(date.getTime()) ? String(row.datum[field] ?? '') : date.toLocaleString('en', { month: 'short' });
    return { ...row, datum: { ...row.datum, [as]: value } };
  });
}

function foldRows(rows: TrackedRow[], config: AnyRecord): TrackedRow[] {
  const fields = config.fields as string[];
  const [keyAs = 'key', valueAs = 'value'] = config.as as string[] | undefined ?? [];
  const sourceAs = String(config.sourceAs ?? '__foldField');
  const labelAs = String(config.labelAs ?? keyAs);
  const labels = config.labels as Record<string, string> | undefined ?? {};
  return rows.flatMap((row) => fields.map((field) => {
    const atoms = row.lineage.map((atom) => createAtom(atom.datumKey, [...atom.branch, `fold:${field}`]));
    const atomByOldId = new Map(row.lineage.map((atom, index) => [atom.id, atoms[index]! ]));
    const contributions = Object.fromEntries(Object.entries(row.contributions).map(([name, values]) => [
      name,
      values.map((entry) => ({ atom: atomByOldId.get(entry.atom.id)!, value: entry.value }))
    ]));
    contributions[valueAs] = (row.contributions[field] ?? []).map((entry) => ({
      atom: atomByOldId.get(entry.atom.id)!, value: entry.value
    }));
    return {
      ...row,
      datum: {
        ...row.datum,
        [sourceAs]: field,
        [valueAs]: row.datum[field],
        [labelAs]: labels[field] ?? field
      },
      lineage: atoms,
      contributions
    };
  }));
}

function binRows(rows: TrackedRow[], config: AnyRecord): TrackedRow[] {
  const field = String(config.field);
  const as = String(config.as ?? `${field}_bin`);
  const values = rows.map((row) => binNumber(row.datum[field])).filter((value): value is number => value != null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const step = Number(config.step ?? Math.max(1, Math.ceil((max - min) / Number(config.maxbins ?? 10))));
  return rows.map((row) => {
    const value = binNumber(row.datum[field]);
    if (value == null) return { ...row, datum: { ...row.datum, [as]: null, [`${as}_start`]: null, [`${as}_end`]: null } };
    const start = Math.floor((value - min) / step) * step + min;
    return { ...row, datum: { ...row.datum, [as]: `${start}-${start + step}`, [`${as}_start`]: start, [`${as}_end`]: start + step } };
  });
}

function aggregateRows(rows: TrackedRow[], config: AnyRecord): {
  rows: TrackedRow[];
  grain: string[];
  capability: LineageCapability;
} {
  const grain = (config.groupby as string[] | undefined) ?? [];
  const fields = (config.fields as AnyRecord[] | undefined) ?? [{ op: 'count', as: 'count' }];
  const groups = new Map<string, TrackedRow[]>();
  for (const row of rows) {
    const key = canonicalKey(grain.map((field) => row.datum[field]));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const reasons: string[] = [];
  const output = [...groups.values()].map((group): TrackedRow => {
    const datum: DataRow = Object.fromEntries(grain.map((field) => [field, group[0]?.datum[field]]));
    const lineage = uniqueAtoms(group.flatMap((row) => row.lineage));
    const contributions: Record<string, LineageContribution[]> = {};
    for (const metric of fields) {
      const op = String(metric.op ?? 'count');
      const field = metric.field == null ? '' : String(metric.field);
      const as = String(metric.as ?? `${op}_${field || 'rows'}`);
      const numeric = group.map((row) => aggregateNumber(row.datum[field])).filter((value): value is number => value != null);
      if (op === 'sum') {
        datum[as] = numeric.reduce((sum, value) => sum + value, 0);
        contributions[as] = mergeContributions(group.flatMap((row) => row.contributions[field] ?? []));
      } else if (op === 'count') {
        datum[as] = group.length;
        contributions[as] = group.flatMap((row) => {
          const share = row.lineage.length ? 1 / row.lineage.length : 0;
          return row.lineage.map((atom) => ({ atom, value: share }));
        });
      } else if (op === 'mean') {
        datum[as] = numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : undefined;
        contributions[as] = mergeContributions(group.flatMap((row) => row.contributions[field] ?? []))
          .map((entry) => ({ ...entry, value: entry.value / Math.max(1, numeric.length) }));
        reasons.push(`${op}(${field}) is not additively splittable`);
      } else {
        datum[as] = aggregateNonAdditive(numeric, op);
        reasons.push(`${op}(${field}) is not additively splittable`);
      }
    }
    return { datum, markKey: markKey(datum, grain, ''), grain: [...grain], lineage, contributions };
  });
  return {
    rows: output,
    grain,
    capability: { splittable: reasons.length === 0, reasons: [...new Set(reasons)] }
  };
}

function aggregateNumber(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function binNumber(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function aggregateNonAdditive(values: number[], op: string): number | undefined {
  if (!values.length) return undefined;
  if (op === 'min') return Math.min(...values);
  if (op === 'max') return Math.max(...values);
  if (op === 'median') {
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1]! + ordered[middle]!) / 2;
  }
  return undefined;
}

function sortRows(rows: TrackedRow[], config: AnyRecord): TrackedRow[] {
  const fields = Array.isArray(config.fields) ? config.fields : [config];
  return [...rows].sort((a, b) => {
    for (const entry of fields) {
      const sort = typeof entry === 'string' ? { field: entry } : entry as AnyRecord;
      const av = a.datum[String(sort.field)];
      const bv = b.datum[String(sort.field)];
      const comparison = av === bv ? 0 : av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
      if (comparison) return sort.order === 'descending' ? -comparison : comparison;
    }
    return 0;
  });
}

function rowsByAtom(rows: LineageRow[]): Map<string, LineageRow[]> {
  const result = new Map<string, LineageRow[]>();
  for (const row of rows) for (const atom of row.lineage) result.set(atom.id, [...(result.get(atom.id) ?? []), row]);
  return result;
}

function contributionValue(row: LineageRow, field: string | undefined, atoms: LineageAtom[]): number | null {
  if (!field) return null;
  const ids = new Set(atoms.map((atom) => atom.id));
  const contributions = row.contributions[field];
  if (!contributions) return null;
  return contributions.filter((entry) => ids.has(entry.atom.id)).reduce((sum, entry) => sum + entry.value, 0);
}

function correspondenceComponents(
  fromRows: LineageRow[],
  toRows: LineageRow[],
  edges: LineageEdge[]
): LineageComponent[] {
  const byFrom = edgeIndexesBy(edges, 'from');
  const byTo = edgeIndexesBy(edges, 'to');
  const visitedFrom = new Set<string>();
  const visitedTo = new Set<string>();
  const components: LineageComponent[] = [];

  edges.forEach((startEdge) => {
    if (visitedFrom.has(startEdge.from)) return;
    const pending: Array<['from' | 'to', string]> = [['from', startEdge.from]];
    const from = new Set<string>();
    const to = new Set<string>();
    const edgeIndexes = new Set<number>();
    while (pending.length) {
      const [side, key] = pending.pop()!;
      const visited = side === 'from' ? visitedFrom : visitedTo;
      if (visited.has(key)) continue;
      visited.add(key);
      (side === 'from' ? from : to).add(key);
      const indexes = (side === 'from' ? byFrom : byTo).get(key) ?? [];
      for (const index of indexes) {
        edgeIndexes.add(index);
        const edge = edges[index];
        pending.push(side === 'from' ? ['to', edge.to] : ['from', edge.from]);
      }
    }
    components.push({
      operation: componentOperation(from.size, to.size),
      from: [...from],
      to: [...to],
      edges: [...edgeIndexes].map((index) => edges[index])
    });
  });

  const matchedFrom = new Set(edges.map(({ from }) => from));
  const matchedTo = new Set(edges.map(({ to }) => to));
  uniqueMarkKeys(fromRows).filter((key) => !matchedFrom.has(key)).forEach((key) => {
    components.push({ operation: 'exit', from: [key], to: [], edges: [] });
  });
  uniqueMarkKeys(toRows).filter((key) => !matchedTo.has(key)).forEach((key) => {
    components.push({ operation: 'enter', from: [], to: [key], edges: [] });
  });
  return components;
}

function edgeIndexesBy(edges: LineageEdge[], side: 'from' | 'to'): Map<string, number[]> {
  const result = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const indexes = result.get(edge[side]);
    if (indexes) indexes.push(index);
    else result.set(edge[side], [index]);
  });
  return result;
}

function uniqueMarkKeys(rows: LineageRow[]): string[] {
  return [...new Set(rows.map(({ markKey }) => markKey))];
}

function componentOperation(fromCount: number, toCount: number): LineageOperation {
  if (fromCount === 1 && toCount === 1) return 'update';
  if (fromCount === 1) return 'split';
  if (toCount === 1) return 'merge';
  return 'reaggregate';
}

function correspondenceMode(components: LineageComponent[]): LineageCorrespondence['mode'] {
  const operations = [...new Set(components.map(({ operation }) => operation))];
  return operations.length === 0 ? 'none' : operations.length === 1 ? operations[0] : 'mixed';
}

function combineCapabilities(a: LineageCapability, b: LineageCapability): LineageCapability {
  return { splittable: a.splittable && b.splittable, reasons: [...new Set([...a.reasons, ...b.reasons])] };
}

function mergeContributions(values: LineageContribution[]): LineageContribution[] {
  const merged = new Map<string, LineageContribution>();
  for (const entry of values) {
    const current = merged.get(entry.atom.id);
    merged.set(entry.atom.id, current
      ? { atom: current.atom, value: current.value + entry.value }
      : { atom: entry.atom, value: entry.value });
  }
  return [...merged.values()];
}

function uniqueAtoms(atoms: LineageAtom[]): LineageAtom[] {
  return [...new Map(atoms.map((atom) => [atom.id, atom])).values()];
}

function mergeAtoms(target: LineageAtom[], atoms: LineageAtom[]): void {
  const existing = new Set(target.map((atom) => atom.id));
  for (const atom of atoms) if (!existing.has(atom.id)) { target.push(atom); existing.add(atom.id); }
}

function markKey(datum: DataRow, grain: string[], fallback: DatumKey): string {
  return canonicalKey(grain.length ? grain.map((field) => datum[field]) : fallback);
}

function canonicalKey(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return { date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as AnyRecord).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonicalValue(item)]));
}
