import type { BarLayout, BarOrientation, TransitionPlan, TransitionSpec } from '../../types/index.js';
import type { ChartContext } from '../../types/index.js';

/** Geometry baseline used by Bar's detail enter and exit paths. */
export interface BarTransitionBaseline {
  name: string;
  anchor?: string;
  value?: number;
  meaning: string;
}

/** Bar-only action describing how a detail mark enters or exits. */
export interface BarTransitionItemAction {
  mode: string;
  reason: string;
  from?: string;
  to?: string;
  target?: string;
  source?: string;
  baseline?: BarTransitionBaseline;
  parentKey?: string | null;
  childKey?: Array<string | null>;
  targetLayout?: BarLayout;
  sourceLayout?: BarLayout;
  sourceOrientation?: BarOrientation;
  categoryKey?: string | null;
  segmentKey?: string | null;
  valueKey?: string | null;
}

/** Bar's extension of the Core evidence and generic phase diagnostics. */
export interface BarTransitionPlan extends TransitionPlan {
  source?: { orientation: BarOrientation; layout: BarLayout; renderer: string };
  target?: { orientation: BarOrientation; layout: BarLayout; renderer: string };
  match?: { mode: string; reason: string };
  motion?: { mode: string };
  timing?: TransitionSpec;
  enter?: BarTransitionItemAction;
  exit?: BarTransitionItemAction;
}

/** Convert Core's shared plan at the Bar rendering boundary. */
export function barTransitionPlan(chart: Pick<ChartContext, 'transitionPlan'>): BarTransitionPlan | undefined {
  return chart.transitionPlan as BarTransitionPlan | undefined;
}
