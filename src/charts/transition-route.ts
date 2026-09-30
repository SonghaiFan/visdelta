import { inferTransition } from '../grammar/infer-transition.js';
import { planDeclarationTransition } from '../grammar/declaration-plan.js';
import type {
  CanonicalTransitionPair,
  ChartTransitionPolicy,
  IntermediateSpec,
  ViewSpec
} from '../types/index.js';

type DirectionPolicy<S extends ViewSpec> = Pick<ChartTransitionPolicy<S>, 'canonicalTransitionPair'>;

/** Select once per authored pair. Existing chart routes take precedence;
 * opt-in charts can refine each Core declaration stage once, without recursion. */
export function resolveIntermediateSpecs<S extends ViewSpec>(
  policy: Pick<ChartTransitionPolicy<S>, 'canonicalTransitionPair' | 'intermediateSpecs' | 'declarationPlanning'>,
  from: S,
  to: S
): IntermediateSpec<S>[] {
  const authored = policy.intermediateSpecs?.(from, to) ?? [];
  if (authored.length || !policy.declarationPlanning) return authored;
  const plan = planDeclarationTransition(from, to);
  if (plan.stages.length < 2) return [];
  const waypoints: IntermediateSpec<S>[] = [];
  for (const [index, stage] of plan.stages.entries()) {
    const a = stage.from as S;
    const b = stage.to as S;
    const canonical = canonicalTransitionPair(policy, a, b);
    const local = policy.intermediateSpecs?.(canonical.from, canonical.to) ?? [];
    waypoints.push(...(canonical.reverse ? [...local].reverse().map(({ spec }) => ({ spec })) : local));
    if (index < plan.stages.length - 1) waypoints.push({ spec: b });
  }
  return waypoints;
}

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
