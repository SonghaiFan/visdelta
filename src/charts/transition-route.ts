import { inferTransition } from '../grammar/infer-transition.js';
import type {
  CanonicalTransitionPair,
  ChartTransitionPolicy,
  IntermediateSpec,
  ViewSpec
} from '../types/index.js';

type DirectionPolicy<S extends ViewSpec> = Pick<ChartTransitionPolicy<S>, 'canonicalTransitionPair'>;

/** One authored leg and the canonical pair used to evaluate its frames. */
export interface TransitionRouteLeg<S extends ViewSpec = ViewSpec> {
  from: S | null;
  to: S;
  canonical: CanonicalTransitionPair<S>;
  scenes: string[];
}

/** Internal route representation. No DOM, timers, or builder history. */
export interface TransitionRoute<S extends ViewSpec = ViewSpec> {
  from: S | null;
  to: S;
  legs: TransitionRouteLeg<S>[];
}

export function canonicalTransitionPair<S extends ViewSpec>(
  policy: DirectionPolicy<S> | undefined,
  from: S | null,
  to: S
): CanonicalTransitionPair<S> {
  return from
    ? policy?.canonicalTransitionPair?.(from, to) ?? { from, to, reverse: false }
    : { from: to, to, reverse: false };
}

/** Assemble a chosen path, without choosing additional waypoints or mistaking
 * scene labels for a global phase order. Call once per authored pair; explicit
 * sequence boundaries are owned by sequence(), not flattened away here. */
export function resolveTransitionRoute<S extends ViewSpec>(
  policy: DirectionPolicy<S> | undefined,
  from: S | null,
  to: S,
  waypoints: readonly IntermediateSpec<S>[] = []
): TransitionRoute<S> {
  let previous = from;
  const legs = [...waypoints, { spec: to }].map(({ spec, scene }) => {
    const canonical = canonicalTransitionPair(policy, previous, spec);
    const scenes = inferTransition(canonical.from, canonical.to);
    if (scene && !scenes.includes(scene)) scenes.push(scene);
    const leg = { from: previous, to: spec, canonical, scenes };
    previous = spec;
    return leg;
  });
  return { from, to, legs };
}
