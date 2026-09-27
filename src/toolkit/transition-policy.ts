import type { CanonicalTransitionPair, IntermediateSpec, ViewSpec } from '../types/index.js';
import { cloneState } from '../grammar/view-state.js';

/** null declines; [] explicitly chooses a direct route. */
export type IntermediatePolicy<S extends ViewSpec = ViewSpec> =
  (from: S, to: S) => IntermediateSpec<S>[] | null;

/** Select one complete route. Never concatenate unrelated policies or recurse. */
export function composeIntermediatePolicies<S extends ViewSpec>(
  ...policies: readonly IntermediatePolicy<S>[]
): (from: S, to: S) => IntermediateSpec<S>[] {
  return (from, to) => {
    for (const policy of policies) {
      const result = policy(from, to);
      if (result !== null) return result;
    }
    return [];
  };
}

/** Clone the destination, retaining selected source channels (including absence).
 * The plugin must establish that this mixed state is meaningful for its route. */
export function encodingWaypoint<S extends ViewSpec>(
  from: S,
  to: S,
  retainedChannels: readonly string[]
): S {
  const intermediate = cloneState(to);
  intermediate.encoding = { ...intermediate.encoding };
  for (const channel of retainedChannels) {
    const encoding = from.encoding?.[channel];
    if (encoding === undefined) delete intermediate.encoding[channel];
    else intermediate.encoding[channel] = cloneState(encoding);
  }
  return intermediate;
}

/** null declines; a forward result is a decision, not a request to try again. */
export type CanonicalPairPolicy<S extends ViewSpec = ViewSpec> =
  (from: S, to: S) => CanonicalTransitionPair<S> | null;

/** Plugin-owned rules run in declaration order. No match preserves authored order. */
export function composeCanonicalPolicies<S extends ViewSpec>(
  ...policies: readonly CanonicalPairPolicy<S>[]
): (from: S, to: S) => CanonicalTransitionPair<S> {
  return (from, to) => {
    for (const policy of policies) {
      const result = policy(from, to);
      if (result !== null) return result;
    }
    return { from, to, reverse: false };
  };
}
