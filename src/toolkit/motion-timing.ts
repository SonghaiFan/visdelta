import { specTransition } from '../spec-meta.js';
import { DEFAULT_MARK_DELAY, defaultTransition } from '../timing.js';
import { easeBackOut, easeCubic, easeCubicInOut, easeElasticOut, easeExp, easeExpInOut, easeLinear } from 'd3-ease';
import type { ViewSpec, TransitionSpec, StaggerSpec } from '../types/index.js';
import type { RenderTransition, RenderDatum } from '../runtime/render-types.js';
import type { MotionTiming } from '../runtime/recorder.js';
export function transitionSpec(
  spec: ViewSpec,
  previousSpec: ViewSpec | null | undefined,
): RenderTransition {
  const local = specTransition(spec);
  const previous = previousSpec ? specTransition(previousSpec) : {};
  const transition = { ...defaultTransition(), ...previous, ...local };
  const base: MotionTiming = { delay: 0, duration: transition.duration, ease: easeFor(transition.ease) };
  return { ...transition, base };
}

export function effectiveTransitionSpec(spec: ViewSpec = {}): Required<TransitionSpec> {
  return defaultTransition(specTransition(spec));
}

export function easeFor(name: string | undefined): (progress: number) => number {
  const eases = {
    linear: easeLinear, cubic: easeCubic, cubicInOut: easeCubicInOut,
    exp: easeExp, expInOut: easeExpInOut, elastic: easeElasticOut, back: easeBackOut
  };
  return (name ? eases[name as keyof typeof eases] : undefined) || easeCubicInOut;
}

export function staggerDelay(
  spec: ViewSpec,
  datum: RenderDatum,
  index: number,
  override?: StaggerSpec | number
): number {
  const stagger = override === undefined ? effectiveTransitionSpec(spec).stagger : override;
  if (!stagger) return 0;
  if (typeof stagger === 'number') return index * stagger;
  const step = stagger.step ?? (stagger as StaggerSpec & { ms?: number }).ms ?? DEFAULT_MARK_DELAY.step;
  const max = stagger.max ?? DEFAULT_MARK_DELAY.max;
  if (stagger.by) {
    const value = Number(datum[stagger.by] ?? datum.__row?.[stagger.by] ?? index);
    if (Number.isFinite(value)) return Math.min(value * step, max);
  }
  return Math.min(index * step, max);
}
