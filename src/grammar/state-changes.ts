import { specState, specUnit } from '../spec-meta.js';
import { canonicalDatumKey } from '../data/lineage.js';
import type { ViewLineageAnalysis } from '../data/view-lineage.js';
import type { LineageTable } from '../data/lineage.js';
import type {
  AggregateFieldSpec,
  AggregateTransform,
  GrainDescription,
  SemanticDiffResult,
  StateChange,
  TransformSpec,
  ViewSpec
} from '../types/index.js';

type AnyRecord = Record<string, unknown>;

/**
 * Normalize endpoint facts into the seven state-change categories.
 * The returned order is categorical and must not be interpreted as playback order.
 */
export function classifyStateChanges(
  previous: ViewSpec,
  next: ViewSpec,
  semantic: SemanticDiffResult,
  lineage: ViewLineageAnalysis | null = null
): StateChange[] {
  const changes: StateChange[] = [];
  changes.push(...dataChanges(previous, next, semantic, lineage));

  const previousGrain = grainDescription(previous, lineage?.from);
  const nextGrain = grainDescription(next, lineage?.to);
  changes.push(...grainChanges(previousGrain, nextGrain, lineage));

  const swapped = xyFieldsSwapped(previous, next);
  changes.push(...encodingChanges(previous, next, swapped));
  changes.push(...coordinateChanges(previous, next, swapped));
  changes.push(...layoutChanges(previous, next));
  changes.push(...attentionChanges(semantic));
  changes.push(...appearanceChanges(previous, next));
  return dedupe(changes);
}

function dataChanges(
  previous: ViewSpec,
  next: ViewSpec,
  semantic: SemanticDiffResult,
  lineage: ViewLineageAnalysis | null
): StateChange[] {
  if (lineage && lineage.from.identity.stable && lineage.to.identity.stable &&
      sameValue(lineage.from.identity.key, lineage.to.identity.key)) {
    const fromParticipants = participantKeys(lineage.from);
    const toParticipants = participantKeys(lineage.to);
    const actions: StateChange[] = [];
    if ([...fromParticipants].some((key) => !toParticipants.has(key))) {
      actions.push({ category: 'data', action: 'remove' });
    }
    if (sourceRowsChanged(previous, next, lineage.from.identity.key, fromParticipants, toParticipants)) {
      actions.push({ category: 'data', action: 'update' });
    }
    if ([...toParticipants].some((key) => !fromParticipants.has(key))) {
      actions.push({ category: 'data', action: 'add' });
    }
    return actions;
  }

  const filter = semantic.get('filter');
  if (filter?.action === 'add') return [{ category: 'data', action: 'remove' }];
  if (filter?.action === 'remove') return [{ category: 'data', action: 'add' }];
  // A changed selector or data source does not reveal record direction without
  // stable endpoint identity. Keep the raw delta rather than inventing a fact.
  return [];
}

function participantKeys(table: LineageTable): Set<string> {
  return new Set(table.rows.flatMap((row) => row.lineage.map((atom) => canonical(atom.datumKey))));
}

function sourceRowsChanged(
  previous: ViewSpec,
  next: ViewSpec,
  key: LineageTable['identity']['key'],
  previousParticipants: Set<string>,
  nextParticipants: Set<string>
): boolean {
  const previousRows = inlineRows(previous.data);
  const nextRows = inlineRows(next.data);
  if (!previousRows || !nextRows) return false;
  const previousByKey = rowsByKey(previousRows, key);
  const nextByKey = rowsByKey(nextRows, key);
  for (const datumKey of previousParticipants) {
    if (!nextParticipants.has(datumKey)) continue;
    if (!sameValue(previousByKey.get(datumKey), nextByKey.get(datumKey))) return true;
  }
  return false;
}

function rowsByKey(rows: AnyRecord[], key: LineageTable['identity']['key']): Map<string, AnyRecord> {
  return new Map(rows.map((row, index) => {
    const identity = Array.isArray(key)
      ? canonical(canonicalDatumKey(key.map(field => row[field])))
      : canonical(datumKey(row, index, key));
    return [identity, row];
  }));
}

function datumKey(row: AnyRecord, index: number, key: LineageTable['identity']['key']): unknown {
  if (typeof key === 'function') return key(row, index);
  if (Array.isArray(key)) return key.map((field) => row[field]);
  return row[key];
}

function grainDescription(spec: ViewSpec, table?: LineageTable): GrainDescription {
  const aggregate = lastAggregate(spec.transform ?? []);
  const unit = specUnit(spec) ?? spec.unit ?? {};
  const measures = aggregate?.fields?.map((measure: AggregateFieldSpec) => ({
    op: String(measure.op ?? 'count'),
    field: measure.field == null ? null : String(measure.field),
    as: measure.as == null ? null : String(measure.as)
  })) ?? (unit.value ? [{ op: 'unit', field: String(unit.value), as: null }] : []);
  return {
    groupby: [...(aggregate?.groupby ?? table?.grain ?? [])].sort(),
    measures: measures.sort((a, b) => canonical(a).localeCompare(canonical(b))),
    ...(unit.value ? { unitValue: Number(unit.unitValue ?? 1) } : {})
  };
}

function lastAggregate(transforms: TransformSpec[]): AggregateTransform | null {
  for (let index = transforms.length - 1; index >= 0; index -= 1) {
    const aggregate = (transforms[index] as { aggregate?: AggregateTransform }).aggregate;
    if (aggregate) return aggregate;
  }
  return null;
}

function grainChanges(
  previous: GrainDescription,
  next: GrainDescription,
  lineage: ViewLineageAnalysis | null
): StateChange[] {
  const changes: StateChange[] = [];
  if (previous.unitValue !== next.unitValue && previous.unitValue != null && next.unitValue != null) {
    changes.push({
      category: 'grain',
      action: previous.unitValue < next.unitValue ? 'merge' : 'split',
      previous,
      next
    });
  }

  if (!sameValue(previous.groupby, next.groupby)) {
    const operations = new Set(lineage?.correspondence.components
      .map(component => component.operation)
      .filter(operation => operation === 'split' || operation === 'merge' || operation === 'reaggregate'));
    if (operations.size) {
      for (const action of operations) changes.push({ category: 'grain', action, previous, next });
    } else {
      const previousSet = new Set(previous.groupby);
      const nextSet = new Set(next.groupby);
      const previousWithinNext = [...previousSet].every((field) => nextSet.has(field));
      const nextWithinPrevious = [...nextSet].every((field) => previousSet.has(field));
      const action = previousWithinNext && !nextWithinPrevious
        ? 'split'
        : nextWithinPrevious && !previousWithinNext
          ? 'merge'
          : 'reaggregate';
      changes.push({ category: 'grain', action, previous, next });
    }
  }

  if (!sameValue(reducerSignature(previous), reducerSignature(next))) {
    const previousFields = previous.measures.map(({ field, as }) => [field, as]);
    const nextFields = next.measures.map(({ field, as }) => [field, as]);
    changes.push({
      category: 'grain',
      action: sameValue(previousFields, nextFields) ? 'change-reducer' : 'reaggregate',
      previous,
      next
    });
  }
  return changes;
}

function reducerSignature(grain: GrainDescription): unknown {
  return grain.measures.map(({ op, field, as }) => ({ op, field, as }));
}

function encodingChanges(previous: ViewSpec, next: ViewSpec, swapped: boolean): StateChange[] {
  const channels = new Set([...Object.keys(previous.encoding ?? {}), ...Object.keys(next.encoding ?? {})]);
  const ignored = new Set(['detail', 'key', 'tooltip', 'xOffset', 'yOffset']);
  const changes: StateChange[] = [];
  for (const channel of channels) {
    if (ignored.has(channel) || (swapped && (channel === 'x' || channel === 'y'))) continue;
    const from = fieldBinding(previous.encoding?.[channel]);
    const to = fieldBinding(next.encoding?.[channel]);
    if (sameValue(from, to)) continue;
    changes.push({
      category: 'encoding',
      action: from == null ? 'bind' : to == null ? 'unbind' : 'remap',
      channel
    });
  }
  return changes;
}

function fieldBinding(channel: unknown): unknown {
  if (Array.isArray(channel)) {
    const fields = channel.map(fieldBinding).filter((value) => value != null);
    return fields.length ? fields : null;
  }
  const value = channel as AnyRecord | undefined;
  if (!value?.field) return null;
  return {
    field: value.field,
    type: value.type ?? null,
    aggregate: value.aggregate ?? null,
    timeUnit: value.timeUnit ?? null,
    bin: value.bin ?? null
  };
}

function coordinateChanges(previous: ViewSpec, next: ViewSpec, swapped: boolean): StateChange[] {
  const changes: StateChange[] = [];
  if (swapped || orientation(previous) !== orientation(next)) {
    changes.push({ category: 'coordinate', action: 'reorient' });
  }
  for (const channel of ['x', 'y'] as const) {
    const from = coordinateSignature(previous.encoding?.[swapped ? (channel === 'x' ? 'y' : 'x') : channel]);
    const to = coordinateSignature(next.encoding?.[channel]);
    if (!sameValue(from, to)) {
      changes.push({ category: 'coordinate', action: 'rescale', channel });
    }
  }
  return changes;
}

function coordinateSignature(channel: unknown): unknown {
  const value = channel as AnyRecord | undefined;
  if (!value) return null;
  return { domain: value.domain ?? null, scale: value.scale ?? null };
}

function orientation(spec: ViewSpec): unknown {
  const state = specState(spec);
  return state.sceneState.axis?.orientation ?? state.axis?.orientation ?? null;
}

function layoutChanges(previous: ViewSpec, next: ViewSpec): StateChange[] {
  const changes: StateChange[] = [];
  const previousState = specState(previous);
  const nextState = specState(next);
  const previousLayout = layoutSignature(previous, previousState);
  const nextLayout = layoutSignature(next, nextState);
  if (!sameValue(previousLayout, nextLayout)) {
    changes.push({ category: 'layout', action: 'rearrange' });
  }
  if (!sameValue(sortSignature(previous), sortSignature(next))) {
    changes.push({ category: 'layout', action: 'reorder' });
  }
  if (!sameValue(previous.connector ?? null, next.connector ?? null) ||
      !sameValue(previous.connect ?? null, next.connect ?? null)) {
    changes.push({ category: 'layout', action: 'reconnect' });
  }
  return changes;
}

function layoutSignature(spec: ViewSpec, state: ReturnType<typeof specState>): unknown {
  const unit = specUnit(spec) ?? spec.unit ?? {};
  const detail = state.sceneState.detail ?? state.detail ?? {};
  const axis = state.sceneState.axis ?? state.axis ?? {};
  return {
    layout: detail.layout ?? axis.layout ?? unit.layout ?? null,
    xOffset: spec.encoding?.xOffset ?? null,
    yOffset: spec.encoding?.yOffset ?? null,
    offset: detail.offset ?? null,
    order: detail.order ?? null,
    columns: unit.columns ?? null,
    group: unit.group ?? null
  };
}

function sortSignature(spec: ViewSpec): unknown {
  const transforms = (spec.transform ?? []).filter((transform) => 'sort' in transform);
  return {
    transforms,
    x: (spec.encoding?.x as AnyRecord | undefined)?.sort ?? null,
    y: (spec.encoding?.y as AnyRecord | undefined)?.sort ?? null
  };
}

function attentionChanges(semantic: SemanticDiffResult): StateChange[] {
  return (['focus', 'highlight'] as const).flatMap((target): StateChange[] => {
    const delta = semantic.get(target);
    if (!delta) return [];
    return [{
      category: 'attention',
      target,
      action: delta.action === 'add' ? 'enter' : delta.action === 'remove' ? 'exit' : 'shift'
    }];
  });
}

function appearanceChanges(previous: ViewSpec, next: ViewSpec): StateChange[] {
  const changes: StateChange[] = [];
  const previousColor = appearanceChannel(previous.encoding?.color);
  const nextColor = appearanceChannel(next.encoding?.color);
  if (!sameValue(previousColor, nextColor)) {
    changes.push({ category: 'appearance', action: 'restyle', property: 'color' });
  }
  const previousSize = appearanceChannel(previous.encoding?.size);
  const nextSize = appearanceChannel(next.encoding?.size);
  if (!sameValue(previousSize, nextSize)) {
    changes.push({ category: 'appearance', action: 'reshape', property: 'size' });
  }
  for (const property of ['strokeWidth'] as const) {
    if (!sameValue(previous[property] ?? null, next[property] ?? null)) {
      changes.push({ category: 'appearance', action: 'restyle', property });
    }
  }
  for (const property of ['curve', 'pointSize', 'size', 'baseline'] as const) {
    if (!sameValue(previous[property] ?? null, next[property] ?? null)) {
      changes.push({ category: 'appearance', action: 'reshape', property });
    }
  }
  const previousUnit = specUnit(previous) ?? previous.unit ?? {};
  const nextUnit = specUnit(next) ?? next.unit ?? {};
  if (!sameValue(previousUnit.radius ?? null, nextUnit.radius ?? null)) {
    changes.push({ category: 'appearance', action: 'reshape', property: 'radius' });
  }
  return changes;
}

function appearanceChannel(channel: unknown): unknown {
  if (Array.isArray(channel)) return channel.map(appearanceChannel);
  const value = channel as AnyRecord | undefined;
  if (!value) return null;
  const { field: _field, type: _type, aggregate: _aggregate, timeUnit: _timeUnit,
    bin: _bin, domain: _domain, scale: scaleValue, ...appearance } = value;
  const scale = scaleValue as AnyRecord | undefined;
  const { domain: _scaleDomain, ...scaleAppearance } = scale ?? {};
  return {
    ...appearance,
    ...(Object.keys(scaleAppearance).length ? { scale: scaleAppearance } : {})
  };
}

function xyFieldsSwapped(previous: ViewSpec, next: ViewSpec): boolean {
  const previousX = (previous.encoding?.x as AnyRecord | undefined)?.field;
  const previousY = (previous.encoding?.y as AnyRecord | undefined)?.field;
  const nextX = (next.encoding?.x as AnyRecord | undefined)?.field;
  const nextY = (next.encoding?.y as AnyRecord | undefined)?.field;
  return previousX != null && previousY != null && previousX !== previousY &&
    previousX === nextY && previousY === nextX;
}

function inlineRows(data: ViewSpec['data']): AnyRecord[] | null {
  if (Array.isArray(data)) return data as AnyRecord[];
  const values = data && typeof data === 'object' ? (data as { values?: unknown }).values : null;
  return Array.isArray(values) ? values as AnyRecord[] : null;
}

function dedupe(changes: StateChange[]): StateChange[] {
  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = canonical(change);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as AnyRecord)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonicalValue(item)]));
}
