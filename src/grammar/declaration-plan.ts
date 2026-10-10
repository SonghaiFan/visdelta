import { declarationEdits } from './declaration-edits.js';
import { deepEqual, sameProtectedDeclarations, stableValueKey } from './declaration-operations.js';
import type {
  CanonicalDeclarationOperation,
  DeclarationCodecResult,
  DeclarationOperationChange,
  DeclarationOperationCodec
} from '../types/index.js';
import type { ViewSpec } from '../types/index.js';

export interface DeclarationStage<S extends ViewSpec = ViewSpec> {
  from: S;
  to: S;
  edits: ReturnType<typeof declarationEdits>;
  operation: DeclarationOperationChange;
}

export interface DeclarationPlan<S extends ViewSpec = ViewSpec> {
  status: 'direct' | 'planned' | 'unsupported' | 'search-limit';
  stages: DeclarationStage<S>[];
  reason: string;
}

const MAX_SEARCH_STATES = 2048;
export interface DeclarationPlanOptions {
  /** Bound route search by distinct complete declaration states. */
  maxSearchStates?: number;
}

interface OperationState {
  slots: Map<string, CanonicalDeclarationOperation>;
  sequences: Map<string, CanonicalDeclarationOperation[]>;
}

interface SearchNode<S extends ViewSpec> {
  state: OperationState;
  spec: S;
  parent: number | null;
  edit: DeclarationOperationChange | null;
}

/** Bounded breadth-first search over complete states made from endpoint operations. */
export function planDeclarationTransition<S extends ViewSpec>(
  from: S,
  to: S,
  codec?: DeclarationOperationCodec<S>,
  options: DeclarationPlanOptions = {}
): DeclarationPlan<S> {
  const limit = Number.isSafeInteger(options.maxSearchStates) && Number(options.maxSearchStates) > 0
    ? Number(options.maxSearchStates)
    : MAX_SEARCH_STATES;
  const finish = (status: DeclarationPlan<S>['status'], reason: string, stages: DeclarationStage<S>[] = []): DeclarationPlan<S> => ({ status, reason, stages });
  if (!from.mark || from.mark !== to.mark) return finish('unsupported', 'chart identity changes across the authored pair');
  if (!sameProtectedDeclarations(from, to)) return finish('unsupported', 'source data or datum identity changes across the authored pair');
  if (!codec) return finish('unsupported', 'this chart has no canonical declaration operation codec');
  const pairBoundary = codec.supportsTransition?.(from, to);
  if (typeof pairBoundary === 'string') return finish('unsupported', pairBoundary);

  const normalizedFrom = codec.normalize(from);
  if (normalizedFrom.status !== 'ok') return finish('unsupported', normalizedFrom.reason);
  const validFrom = codec.validate(normalizedFrom.value);
  if (validFrom.status !== 'ok') return finish('unsupported', validFrom.reason);
  const normalizedTo = codec.normalize(to);
  if (normalizedTo.status !== 'ok') return finish('unsupported', normalizedTo.reason);
  const validTo = codec.validate(normalizedTo.value);
  if (validTo.status !== 'ok') return finish('unsupported', validTo.reason);
  const sourceOps = codec.decompose(normalizedFrom.value);
  if (sourceOps.status !== 'ok') return finish('unsupported', sourceOps.reason);
  const targetOps = codec.decompose(normalizedTo.value);
  if (targetOps.status !== 'ok') return finish('unsupported', targetOps.reason);
  const sourceState = stateFromOperations(sourceOps.value);
  const targetState = stateFromOperations(targetOps.value);
  if (!sourceState || !targetState) return finish('unsupported', 'canonical operation IDs must be unique within each endpoint');

  if (sameState(sourceState, targetState)) {
    return sameNormalizedSpec(normalizedFrom.value, normalizedTo.value)
      ? finish('direct', 'the canonical declarations are equivalent')
      : finish('unsupported', 'the codec maps distinct declarations to the same operation state');
  }

  const fromKey = stateKey(sourceState);
  const toKey = stateKey(targetState);
  if (fromKey.status !== 'ok') return finish('unsupported', fromKey.reason);
  if (toKey.status !== 'ok') return finish('unsupported', toKey.reason);
  const reverse = fromKey.value > toKey.value;
  const searchFrom = reverse ? targetState : sourceState;
  const searchTo = reverse ? sourceState : targetState;
  const canonicalFrom = reverse ? normalizedTo.value : normalizedFrom.value;
  const canonicalTarget = reverse ? normalizedFrom.value : normalizedTo.value;
  const canonicalEndpoints = { from: canonicalFrom, to: canonicalTarget };
  const sourceSignature = stateKey(searchFrom);
  const targetSignature = stateKey(searchTo);
  if (sourceSignature.status !== 'ok' || targetSignature.status !== 'ok') return finish('unsupported', 'could not encode the canonical operation state');

  const sourceRoundTrip = evaluateCanonical(codec, canonicalFrom, flattenState(searchFrom));
  if (sourceRoundTrip.status !== 'ok' || !sameNormalizedSpec(sourceRoundTrip.value, canonicalFrom)) {
    return finish('unsupported', sourceRoundTrip.status === 'unsupported'
      ? sourceRoundTrip.reason
      : 'codec cannot round-trip the source declaration from a shared endpoint template');
  }
  const targetRoundTrip = evaluateCanonical(codec, canonicalFrom, flattenState(searchTo));
  if (targetRoundTrip.status !== 'ok' || !sameNormalizedSpec(targetRoundTrip.value, canonicalTarget)) {
    return finish('unsupported', targetRoundTrip.status === 'unsupported'
      ? targetRoundTrip.reason
      : 'codec operations do not reconstruct the complete normalized target declaration');
  }

  const queue: SearchNode<S>[] = [{ state: cloneState(searchFrom), spec: canonicalFrom, parent: null, edit: null }];
  const visited = new Map<string, number>([[sourceSignature.value, 0]]);
  let terminalIndex = -1;
  let exceeded = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor]!;
    if (sameState(node.state, searchTo)) {
      if (!sameNormalizedSpec(node.spec, canonicalTarget)) {
        return finish('unsupported', 'the terminal operation state does not equal the complete normalized target declaration');
      }
      terminalIndex = cursor;
      break;
    }
    const candidates = neighbors(node.state, searchFrom, searchTo).sort((a, b) => {
      const aGoal = sameState(a.state, searchTo);
      const bGoal = sameState(b.state, searchTo);
      return Number(bGoal) - Number(aGoal);
    });
    for (const candidate of candidates) {
      const rawSignature = stateKey(candidate.state);
      if (rawSignature.status !== 'ok') return finish('unsupported', rawSignature.reason);
      if (visited.has(rawSignature.value)) continue;
      const operations = flattenState(candidate.state);
      const evaluated = evaluateCanonical(codec, canonicalFrom, operations);
      if (evaluated.status !== 'ok') continue;
      const roundTrip = codec.decompose(evaluated.value);
      if (roundTrip.status !== 'ok') continue;
      const canonicalState = stateFromOperations(roundTrip.value);
      if (!canonicalState) continue;
      if (!sameOperationShapes(canonicalState, candidate.state)) continue;
      const signature = stateKey(canonicalState);
      if (signature.status !== 'ok') return finish('unsupported', signature.reason);
      if (visited.has(signature.value)) continue;
      if (codec.validateStep?.(node.spec, evaluated.value, canonicalEndpoints).status === 'unsupported') continue;
      if (visited.size >= limit) { exceeded = true; continue; }
      const index = queue.length;
      visited.set(signature.value, index);
      queue.push({ state: canonicalState, spec: evaluated.value, parent: cursor, edit: normalizeEdit(candidate.edit, canonicalState) });
    }
  }

  if (terminalIndex < 0) {
    return finish(exceeded ? 'search-limit' : 'unsupported', exceeded
      ? `canonical route search exceeded ${limit} distinct states`
      : 'no sequence of permitted valid one-operation declaration edits connects these endpoints');
  }

  const path: SearchNode<S>[] = [];
  for (let index: number | null = terminalIndex; index !== null; index = queue[index]!.parent) path.push(queue[index]!);
  path.reverse();
  const forwardStages: DeclarationStage<S>[] = [];
  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1]!;
    const current = path[index]!;
    const operation = current.edit!;
    forwardStages.push({
      from: previous.spec,
      to: current.spec,
      edits: declarationEdits(previous.spec, current.spec),
      operation
    });
  }
  if (!reverse) return finish('planned', 'deterministic valid one-operation route', forwardStages);
  const reverseStages = forwardStages.slice().reverse().map(stage => ({
    from: stage.to,
    to: stage.from,
    edits: declarationEdits(stage.to, stage.from),
    operation: invertEdit(stage.operation),
  }));
  return finish('planned', 'deterministic valid one-operation route', reverseStages);
}

function evaluateCanonical<S extends ViewSpec>(
  codec: DeclarationOperationCodec<S>,
  template: S,
  operations: readonly CanonicalDeclarationOperation[]
): DeclarationCodecResult<S> {
  const evaluated = codec.evaluate(template, operations);
  if (evaluated.status !== 'ok') return evaluated;
  const normalized = codec.normalize(evaluated.value);
  if (normalized.status !== 'ok') return normalized;
  const valid = codec.validate(normalized.value);
  if (valid.status !== 'ok') return valid;
  const fixedPoint = codec.normalize(normalized.value);
  if (fixedPoint.status !== 'ok') return fixedPoint;
  if (!sameNormalizedSpec(normalized.value, fixedPoint.value)) {
    return { status: 'unsupported', reason: 'codec normalization is not stable at a complete candidate state' };
  }
  const fixedPointValid = codec.validate(fixedPoint.value);
  return fixedPointValid.status === 'ok' ? fixedPoint : fixedPointValid;
}

function neighbors(
  current: OperationState,
  source: OperationState,
  target: OperationState
): Array<{ state: OperationState; edit: DeclarationOperationChange }> {
  const result: Array<{ state: OperationState; edit: DeclarationOperationChange }> = [];
  const ids = [...new Set([...current.slots.keys(), ...source.slots.keys(), ...target.slots.keys()])].sort();
  for (const id of ids) {
    const now = current.slots.get(id);
    const endpointValues = [source.slots.get(id), target.slots.get(id)].filter(isOperation);
    if (now) {
      const removed = cloneState(current);
      removed.slots.delete(id);
      result.push({ state: removed, edit: { id, action: 'delete', previous: now } });
      for (const candidate of uniqueOperations(endpointValues)) {
        if (sameOperation(now, candidate)) continue;
        const replaced = cloneState(current);
        replaced.slots.set(id, candidate);
        result.push({ state: replaced, edit: { id, action: 'update', previous: now, next: candidate } });
      }
    } else {
      for (const candidate of uniqueOperations(endpointValues)) {
        const inserted = cloneState(current);
        inserted.slots.set(id, candidate);
        result.push({ state: inserted, edit: { id, action: 'insert', next: candidate } });
      }
    }
  }

  const sequenceIds = [...new Set([...current.sequences.keys(), ...source.sequences.keys(), ...target.sequences.keys()])].sort();
  for (const sequenceId of sequenceIds) {
    const now = current.sequences.get(sequenceId) ?? [];
    const from = source.sequences.get(sequenceId) ?? [];
    const to = target.sequences.get(sequenceId) ?? [];
    const sourceTargetOps = uniqueOperations([...from, ...to]);
    // Delete later occurrences first so equal calls retain their earlier stable IDs.
    for (let index = now.length - 1; index >= 0; index--) {
      const operation = now[index]!;
      if (!sourceTargetOps.some(candidate => candidate.id === operation.id)) continue;
      const deleted = cloneState(current);
      setSequence(deleted, sequenceId, now.filter((_, at) => at !== index));
      result.push({ state: deleted, edit: { id: operation.id, action: 'delete', previous: operation, fromIndex: index } });
      for (const candidate of sourceTargetOps) {
        if (sameOperation(operation, candidate) || !compatibleSequenceUpdate(operation, candidate)) continue;
        if (now.some((item, at) => at !== index && item.id === candidate.id)) continue;
        const updated = cloneState(current);
        const values = now.map((item, at) => at === index ? candidate : item);
        setSequence(updated, sequenceId, values);
        result.push({ state: updated, edit: { id: operation.id, action: 'update', previous: operation, next: values[index], fromIndex: index, toIndex: index } });
      }
    }
    for (const operation of sourceTargetOps) {
      if (now.some(currentOperation => currentOperation.id === operation.id)) continue;
      for (let index = 0; index <= now.length; index++) {
        const inserted = cloneState(current);
        const values = [...now];
        values.splice(index, 0, operation);
        setSequence(inserted, sequenceId, values);
        const next = values[index]!;
        result.push({ state: inserted, edit: { id: next.id, action: 'insert', next, toIndex: index } });
      }
    }
  }
  return result;
}

function setSequence(state: OperationState, id: string, values: CanonicalDeclarationOperation[]): void {
  if (values.length) state.sequences.set(id, values);
  else state.sequences.delete(id);
}

function stateFromOperations(operations: readonly CanonicalDeclarationOperation[]): OperationState | null {
  const state: OperationState = { slots: new Map(), sequences: new Map() };
  for (const operation of operations) {
    if (operation.sequence) {
      const values = state.sequences.get(operation.sequence) ?? [];
      if (values.some(value => value.id === operation.id)) return null;
      values.push(operation);
      state.sequences.set(operation.sequence, values);
    } else {
      if (state.slots.has(operation.id)) return null;
      state.slots.set(operation.id, operation);
    }
  }
  return state;
}

function flattenState(state: OperationState): CanonicalDeclarationOperation[] {
  return [
    ...[...state.slots.values()].sort((a, b) => a.id.localeCompare(b.id)),
    ...[...state.sequences.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, values]) => values)
  ];
}

function cloneState(state: OperationState): OperationState {
  return {
    slots: new Map([...state.slots].map(([id, operation]) => [id, cloneOperation(operation)])),
    sequences: new Map([...state.sequences].map(([id, values]) => [id, values.map(cloneOperation)]))
  };
}

function cloneOperation(operation: CanonicalDeclarationOperation): CanonicalDeclarationOperation {
  return {
    ...operation,
    path: [...operation.path],
    value: operation.value.present
      ? { present: true, value: operation.value.value }
      : { present: false }
  };
}

function sameState(a: OperationState | null, b: OperationState): boolean {
  if (!a || a.slots.size !== b.slots.size || a.sequences.size !== b.sequences.size) return false;
  for (const [id, operation] of a.slots) if (!sameOperation(operation, b.slots.get(id))) return false;
  for (const [id, values] of a.sequences) {
    const other = b.sequences.get(id);
    if (!other || values.length !== other.length || values.some((operation, index) => !sameOperation(operation, other[index]))) return false;
  }
  return true;
}

function sameOperationShapes(a: OperationState | null, b: OperationState): boolean {
  if (!a || a.slots.size !== b.slots.size || a.sequences.size !== b.sequences.size) return false;
  for (const [id, operation] of a.slots) if (!sameOperation(operation, b.slots.get(id))) return false;
  for (const [id, values] of a.sequences) {
    const other = b.sequences.get(id);
    if (!other || values.length !== other.length || values.some((operation, index) => {
      const target = other[index];
      return !target || operation.sequence !== target.sequence ||
        operation.path.length !== target.path.length || !operation.path.every((segment, at) => segment === target.path[at]) ||
        operation.value.present !== target.value.present ||
        (operation.value.present && (!target.value.present || !deepEqual(operation.value.value, target.value.value)));
    })) return false;
  }
  return true;
}

function normalizeEdit(edit: DeclarationOperationChange, state: OperationState): DeclarationOperationChange {
  if (edit.action === 'delete' || !edit.next?.sequence) return edit;
  const index = edit.toIndex;
  const next = state.sequences.get(edit.next.sequence)?.[index ?? -1];
  return next ? { ...edit, ...(edit.action === 'insert' ? { id: next.id } : {}), next } : edit;
}

function sameOperation(a: CanonicalDeclarationOperation | undefined, b: CanonicalDeclarationOperation | undefined): boolean {
  return Boolean(a && b && a.id === b.id && a.sequence === b.sequence &&
    a.path.length === b.path.length && a.path.every((segment, index) => segment === b.path[index]) &&
    a.value.present === b.value.present && (!a.value.present || (b.value.present && deepEqual(a.value.value, b.value.value))));
}

function stateKey(state: OperationState): DeclarationCodecResult<string> {
  const slots = [...state.slots.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sequences = [...state.sequences.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, operations]) => [id, operations.map(operation => [operation.id, operation.value])]);
  const result = stableValueKey([slots, sequences]);
  return result.status === 'ok' ? result : result;
}

function uniqueOperations(values: CanonicalDeclarationOperation[]): CanonicalDeclarationOperation[] {
  const result: CanonicalDeclarationOperation[] = [];
  for (const operation of values) if (!result.some(value => value.id === operation.id && sameOperation(value, operation))) result.push(operation);
  return result;
}

function isOperation(value: CanonicalDeclarationOperation | undefined): value is CanonicalDeclarationOperation {
  return value !== undefined;
}

function compatibleSequenceUpdate(a: CanonicalDeclarationOperation, b: CanonicalDeclarationOperation): boolean {
  if (!a.sequence || a.sequence !== b.sequence || a.path.length !== b.path.length ||
    !a.path.every((segment, index) => segment === b.path[index])) return false;
  return a.value.present && b.value.present;
}

function sameNormalizedSpec(a: ViewSpec, b: ViewSpec): boolean {
  const left = { ...a } as Record<string, unknown>;
  const right = { ...b } as Record<string, unknown>;
  const leftData = left['data'];
  const rightData = right['data'];
  delete left['data'];
  delete right['data'];
  return deepEqual(left, right) && sameProtectedDeclarations({ mark: a.mark, data: leftData } as ViewSpec, { mark: b.mark, data: rightData } as ViewSpec);
}

function invertEdit(edit: DeclarationOperationChange): DeclarationOperationChange {
  if (edit.action === 'insert') return {
    id: edit.next?.id ?? edit.id, action: 'delete', previous: edit.next,
    fromIndex: edit.toIndex
  };
  if (edit.action === 'delete') return {
    id: edit.previous?.id ?? edit.id, action: 'insert', next: edit.previous,
    toIndex: edit.fromIndex
  };
  return {
    ...edit,
    id: edit.next?.id ?? edit.id,
    previous: edit.next,
    next: edit.previous
  };
}
