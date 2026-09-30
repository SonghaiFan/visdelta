import { diffViewStates, sameValue } from './diff.js';
import { applyDeclarationEdits } from './declaration-edits.js';
import type { DeclarationEdit } from './declaration-edits.js';
import { serializeViewSpec, specDatumKey } from '../spec-meta.js';
import { viewHighlight, viewSelection } from '../focus.js';
import type { ViewSpec } from '../types/index.js';

export interface DeclarationStage {
  from: ViewSpec;
  to: ViewSpec;
  edits: DeclarationEdit[];
  reason: 'release-attention' | 'remove-output-sort' | 'change-state' | 'apply-output-sort' | 'apply-attention';
}

export interface DeclarationPlan {
  stages: DeclarationStage[];
  reason: string;
}

/** Plan complete states from endpoint differences, never fluent call history.
 * Only attention and a terminal sort suffix can be factored out generically.
 * Data, grain, bindings, and chart-specific declarations travel together. */
export function planDeclarationTransition(from: ViewSpec, to: ViewSpec): DeclarationPlan {
  const source = serializeViewSpec(from);
  const target = serializeViewSpec(to);
  const direct = (reason: string): DeclarationPlan => ({
    reason, stages: [stage(source, target, 'change-state')]
  });
  if (!source.mark || source.mark !== target.mark || !sameValue(source.data, target.data) ||
      !sameValue(specDatumKey(source), specDatumKey(target))) {
    return direct('requires the same chart, source data, and datum identity declaration');
  }

  const focusChanged = !sameValue(viewSelection(source), viewSelection(target));
  const highlightChanged = !sameValue(viewHighlight(source), viewHighlight(target));
  const sourceAttention = withoutAttention(source, focusChanged, highlightChanged);
  const targetAttention = withoutAttention(target, focusChanged, highlightChanged);
  const sortChanged = !sameValue(sortSuffix(source), sortSuffix(target));
  const sourceBase = sortChanged ? withoutSort(sourceAttention) : sourceAttention;
  const targetBase = sortChanged ? withoutSort(targetAttention) : targetAttention;
  // One ordinary difference needs no detour. Only composite changes benefit
  // from factoring presentation away from the central state change.
  if (!diffViewStates(sourceBase, targetBase).edits.length) return direct('presentation-only change');

  const stages: DeclarationStage[] = [];
  let current = source;
  const append = (next: ViewSpec, reason: DeclarationStage['reason']) => {
    const candidate = stage(current, next, reason);
    if (!candidate.edits.length) return;
    stages.push(candidate);
    current = next;
  };
  append(sourceAttention, 'release-attention');
  append(sourceBase, 'remove-output-sort');
  append(targetBase, 'change-state');
  append(targetAttention, 'apply-output-sort');
  append(target, 'apply-attention');
  return { stages, reason: stages.length > 1 ? 'factor endpoint presentation around the state change' : 'direct' };
}

function stage(from: ViewSpec, to: ViewSpec, reason: DeclarationStage['reason']): DeclarationStage {
  const edits = diffViewStates(from, to).edits;
  // All waypoints must be reconstructible from the same edits exposed by delta.
  return { from, to: applyDeclarationEdits(from, edits), edits, reason };
}

function withoutAttention(spec: ViewSpec, focus: boolean, highlight: boolean): ViewSpec {
  const next = serializeViewSpec(spec);
  if (!focus && !highlight) return next;
  const state = next.meta?.state;
  if (!state) return next;
  if (focus && state.scopes) delete state.scopes.focus;
  if (highlight && state.scopes) delete state.scopes.highlight;
  const removed = (mode: unknown) => (focus && mode === 'focus') || (highlight && mode === 'highlight');
  if (removed(state.selection?.mode)) delete state.selection;
  if (removed(state.sceneState?.selection?.mode)) delete state.sceneState!.selection;
  if (state.scopes && !Object.keys(state.scopes).length) delete state.scopes;
  if (state.sceneState && !Object.keys(state.sceneState).length) delete state.sceneState;
  if (!Object.keys(state).length) delete next.meta!.state;
  if (next.meta && !Object.keys(next.meta).length) delete next.meta;
  return next;
}

function sortSuffix(spec: ViewSpec) {
  const transforms = spec.transform ?? [];
  let start = transforms.length;
  while (start > 0) {
    const transform = transforms[start - 1];
    if (!transform.sort || Object.keys(transform).length !== 1) break;
    start--;
  }
  return transforms.slice(start);
}

function withoutSort(spec: ViewSpec): ViewSpec {
  const next = serializeViewSpec(spec);
  const count = sortSuffix(next).length;
  if (count) {
    next.transform = next.transform!.slice(0, -count);
    if (!next.transform.length) delete next.transform;
  }
  return next;
}
