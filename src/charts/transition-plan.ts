import type { TransitionPlan, ViewSpec } from '../types/index.js';

interface TransitionPlanOptions {
  reason?: string;
}

export function createDefaultTransitionPlan(
  previousSpec: ViewSpec | null | undefined,
  nextSpec: ViewSpec | null | undefined,
  options: TransitionPlanOptions = {}
): TransitionPlan {
  if (!previousSpec || !nextSpec) return {};

  const reason = options.reason || 'default-chart-transition';

  return {
    reason,
    steps: [{ changes: ['scale', 'axis', 'marks', 'exit', 'enter'] }]
  };
}
