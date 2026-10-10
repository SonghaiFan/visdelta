import { inferTransition } from '../grammar/infer-transition.js';
import { planDeclarationTransition } from '../grammar/declaration-plan.js';
import type { DeclarationPlan } from '../grammar/declaration-plan.js';
import type {
  CanonicalTransitionPair,
  ChartTransitionPolicy,
  IntermediateSpec,
  ViewSpec
} from '../types/index.js';

type DirectionPolicy<S extends ViewSpec> = Pick<ChartTransitionPolicy<S>, 'canonicalTransitionPair'>;

type RoutePolicy<S extends ViewSpec> = Pick<ChartTransitionPolicy<S>,
  'canonicalTransitionPair' | 'intermediateSpecs' | 'declarationPlanning' | 'declarationPlanningOrder' | 'declarationOperations'>;

/** Select once per authored pair. Existing chart routes take precedence;
 * opt-in charts can refine each Core declaration stage once, without recursion. */
export function resolveIntermediateSpecs<S extends ViewSpec>(
  policy: RoutePolicy<S>,
  from: S,
  to: S
): IntermediateSpec<S>[] {
  return selectIntermediateRoute(policy, from, to).waypoints;
}

/** Choose once for an authored pair, retaining why a direct fallback was used. */
export function selectIntermediateRoute<S extends ViewSpec>(
  policy: RoutePolicy<S>, from: S, to: S
): { waypoints: IntermediateSpec<S>[]; planning: 'authored' | 'planned' | 'direct' | 'unsupported' | 'search-limit'; reason: string } {
  if (policy.declarationPlanning && policy.declarationPlanningOrder === 'before-chart') {
    const plan = planDeclarationTransition(from, to, policy.declarationOperations);
    if (plan.status === 'planned') return refineDeclarationPlan(policy, plan);
    if (plan.status === 'direct') return { waypoints: [], planning: 'direct', reason: plan.reason };
    const authored = policy.intermediateSpecs?.(from, to) ?? [];
    if (authored.length) return { waypoints: authored, planning: 'authored', reason: 'chart-authored route fallback' };
    return { waypoints: [], planning: plan.status, reason: plan.reason };
  }
  const authored = policy.intermediateSpecs?.(from, to) ?? [];
  if (authored.length) return { waypoints: authored, planning: 'authored', reason: 'chart-authored route' };
  if (!policy.declarationPlanning) return { waypoints: [], planning: 'direct', reason: 'declaration planning is disabled' };
  const plan = planDeclarationTransition(from, to, policy.declarationOperations);
  if (plan.status !== 'planned') return { waypoints: [], planning: plan.status, reason: plan.reason };
  return refineDeclarationPlan(policy, plan);
}

function refineDeclarationPlan<S extends ViewSpec>(
  policy: RoutePolicy<S>,
  plan: Pick<DeclarationPlan<S>, 'stages' | 'reason'>
): { waypoints: IntermediateSpec<S>[]; planning: 'planned'; reason: string } {
  const waypoints: IntermediateSpec<S>[] = [];
  for (const [index, stage] of plan.stages.entries()) {
    const canonical = canonicalTransitionPair(policy, stage.from, stage.to);
    const local = policy.intermediateSpecs?.(canonical.from, canonical.to) ?? [];
    waypoints.push(...(canonical.reverse ? [...local].reverse().map(({ spec }) => ({ spec })) : local));
    if (index < plan.stages.length - 1) waypoints.push({ spec: stage.to });
  }
  return { waypoints, planning: 'planned', reason: plan.reason };
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
  planning: 'authored' | 'planned' | 'direct' | 'unsupported' | 'search-limit';
  reason: string;
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
  waypoints: readonly IntermediateSpec<S>[] = [],
  planning: TransitionRoute<S>['planning'] = waypoints.length ? 'authored' : 'direct',
  reason = waypoints.length ? 'chart-authored route' : 'direct route'
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
  return { from, to, legs, planning, reason };
}

/** Select declaration stages and build the immutable route in one operation. */
export function selectTransitionRoute<S extends ViewSpec>(
  policy: RoutePolicy<S>, from: S | null, to: S
): TransitionRoute<S> {
  if (!from) return resolveTransitionRoute(policy, null, to);
  const selected = selectIntermediateRoute(policy, from, to);
  return resolveTransitionRoute(policy, from, to, selected.waypoints, selected.planning, selected.reason);
}
