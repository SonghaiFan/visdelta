import { specTransition } from '../../spec-meta.js';
import { viewLineageCorrespondence } from '../../data/view-lineage.js';
import { diffBarViewStates } from './diff.js';
import { defaultTransition, stepDuration } from '../../timing.js';
import { normalizeMarkRendererKey } from '../index.js';
import type {
  BarLayout,
  BarOrientation,
  CanonicalTransitionPair,
  DetailSpec,
  IntermediateSpec,
  TransitionItemAction,
  TransitionPlan,
  ViewSpec
} from '../../types/index.js';
import {
  barCategoryChannel,
  barMeasureChannel,
  barOffsetChannelName,
  barRendererKey,
  isSegmentLayout
} from './layout/index.js';
import { semanticBarState } from './semantic.js';

export function resolveBarTransitionPlan(
  previousSpec: ViewSpec | null,
  nextSpec: ViewSpec | null
): TransitionPlan {
  if (!previousSpec || !nextSpec) return {};
  const previous = barState(previousSpec);
  const next = barState(nextSpec);
  if (!previous || !next) return {};

  const diff = diffBarViewStates(previousSpec, nextSpec);
  const plan: TransitionPlan = {
    source: {
      orientation: previous.orientation,
      layout: previous.barLayout,
      renderer: barRendererKey(previous.barLayout, previous.orientation)
    },
    target: {
      orientation: next.orientation,
      layout: next.barLayout,
      renderer: barRendererKey(next.barLayout, next.orientation)
    },
    diff: diff.deltas.map(({ type, action, previous: p, next: n }) => ({
      type, action, previous: p, next: n
    }))
  };

  const crossesDetail =
    diff.hasDelta('bar.detail') || previous.hasDetail || next.hasDetail;
  if (crossesDetail) {
    plan.match = { mode: 'semantic', reason: 'detail-item-consistency' };
  }

  // Collapse: child → parent
  if (
    diff.hasDelta('bar.detail', 'remove') &&
    previous.hasDetail && next.hasAggregate && !next.hasDetail
  ) {
    plan.enter = {
      mode: 'parent-child-lineage',
      from: 'child-bounds',
      target: 'parent',
      reason: 'detail-parent-child-lineage',
      parentKey: next.categoryField,
      childKey: [previous.categoryField, previous.segmentField].filter(Boolean) as string[],
      sourceLayout: previous.barLayout
    };
  }

  if (diff.hasDelta('bar.detail', 'remove') && previous.hasDetail) {
    const baseline = barBaselinePlan(previous.barLayout);
    plan.exit = {
      mode: 'baseline',
      to: baseline.name,
      baseline,
      source: 'child',
      reason: 'detail-exit-baseline',
      sourceOrientation: previous.orientation,
      sourceLayout: previous.barLayout,
      categoryKey: previous.categoryField,
      segmentKey: previous.segmentField,
      valueKey: previous.measureField
    } as TransitionItemAction;
  }

  // Split: parent → child
  if (
    diff.hasDelta('bar.detail', 'add') &&
    previous.hasAggregate && next.hasDetail && !previous.hasDetail
  ) {
    plan.enter = {
      mode: 'parent-child-lineage',
      from: 'parent-bounds',
      target: 'child',
      reason: 'detail-parent-child-lineage',
      parentKey: previous.categoryField,
      childKey: [next.categoryField, next.segmentField].filter(Boolean) as string[],
      targetLayout: next.barLayout
    };
  }

  if (diff.hasDelta('bar.detail', 'add') && next.hasDetail && !plan.enter) {
    const baseline = barBaselinePlan(next.barLayout);
    plan.enter = {
      mode: 'baseline',
      from: baseline.name,
      baseline,
      target: 'child',
      reason: 'detail-enter-baseline',
      targetLayout: next.barLayout,
      categoryKey: next.categoryField,
      segmentKey: next.segmentField,
      valueKey: next.measureField
    } as TransitionItemAction;
  }

  const layoutChanged = diff.hasDelta('bar.layout');
  const changesSegmentLayout =
    layoutChanged &&
    isSegmentLayout(previous.barLayout) &&
    isSegmentLayout(next.barLayout);
  const crossesAxis = diff.hasDelta('bar.axis') || previous.hasAxis || next.hasAxis;
  const orientationChanged = diff.hasDelta('bar.orientation');
  const changedDimensions = changedBarDimensions(diff);
  if (!changedDimensions.length) return plan;

  const orderOptions = (next.axisOrder ?? previous.axisOrder ?? {}) as Record<string, unknown>;
  const reason = stepReason({ changesSegmentLayout, crossesAxis, orientationChanged });
  const timing = defaultTransition({
    ...specTransition(previousSpec ?? {}),
    ...specTransition(nextSpec ?? {}),
    ...(orderOptions as object)
  });
  const orderedParts = coordinateStepOrder({
    orderOptions,
    target: next,
    changesSegmentLayout,
    reverse: crossesAxis && !next.hasAxis,
    dimensions: changedDimensions
  });

  if (!orderedParts.length) return plan;

  const stepTiming = {
    duration: (orderOptions.duration as number | undefined) ?? stepDuration(timing.duration, orderedParts.length),
    ease: timing.ease,
    stagger: timing.stagger
  };
  const staggerMaxVal = staggerMax(stepTiming.stagger);
  const totalDuration = stepTiming.duration * orderedParts.length + staggerMaxVal;

  plan.reason = reason;
  plan.steps = orderedParts.map((part) => ({
    part,
    changes: ['scale', 'axis', 'marks']
  }));
  plan.timing = stepTiming;
  plan.totalDuration = totalDuration;

  return plan;
}

interface BarInternalState {
  orientation: BarOrientation;
  barLayout: BarLayout;
  categoryField: string | null;
  measureField: string | null;
  hasAxis: boolean;
  hasDetail: boolean;
  hasAggregate: boolean;
  segmentField: string | null;
  axisOrder: Record<string, unknown> | null;
}

export function barState(spec: ViewSpec | null | undefined): BarInternalState | null {
  if (!spec || normalizeMarkRendererKey(spec.mark) !== 'bar') return null;
  const semantic = semanticBarState(spec);
  return {
    orientation: semantic.orientation,
    barLayout: semantic.layout,
    categoryField: semantic.categoryField,
    measureField: semantic.measureField,
    hasAxis: Boolean(semantic.axis),
    hasDetail: Boolean(semantic.detail),
    hasAggregate: Boolean(semantic.aggregate),
    segmentField: semantic.segmentField,
    axisOrder: semantic.axis as Record<string, unknown> | null
  };
}

/**
 * Parent -> child is the canonical detail path. A child -> parent pair
 * reuses that exact path with inverted progress so split and merge cannot
 * acquire different seams, opacity changes, staggering, or step order.
 */
export function canonicalBarTransitionPair<S extends ViewSpec>(
  previousSpec: S,
  nextSpec: S
): CanonicalTransitionPair<S> {
  const previous = barState(previousSpec);
  const next = barState(nextSpec);
  const isCollapse = Boolean(
    previous?.hasDetail &&
    next?.hasAggregate &&
    !next.hasDetail
  );
  const isReaggregate = Boolean(
    previous?.hasAggregate &&
    next?.hasAggregate &&
    previous.categoryField !== next.categoryField
  );
  if (isReaggregate) {
    const previousKey = canonicalGroupingKey(previous!);
    const nextKey = canonicalGroupingKey(next!);
    return previousKey.localeCompare(nextKey) <= 0
      ? { from: previousSpec, to: nextSpec, reverse: false }
      : { from: nextSpec, to: previousSpec, reverse: true };
  }
  return isCollapse
    ? { from: nextSpec, to: previousSpec, reverse: true }
    : { from: previousSpec, to: nextSpec, reverse: false };
}

function canonicalGroupingKey(state: BarInternalState): string {
  return JSON.stringify([
    state.categoryField,
    state.segmentField,
    state.measureField,
    state.barLayout,
    state.orientation
  ]);
}

export function barIntermediateSpecs(
  previousSpec: ViewSpec,
  nextSpec: ViewSpec
): IntermediateSpec[] {
  return barReaggregationIntermediateSpecs(previousSpec, nextSpec);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function barBaselinePlan(layout: BarLayout): {
  name: string;
  anchor?: string;
  value?: number;
  meaning: string;
} {
  if (layout === 'stacked') {
    return { name: 'stack-base', anchor: '__stack0', meaning: 'segment-stack-base' };
  }
  return { name: 'zero-baseline', value: 0, meaning: 'measure-zero' };
}

function staggerMax(stagger: unknown): number {
  if (stagger == null || typeof stagger !== 'object') return 0;
  const max = Number((stagger as Record<string, unknown>).max);
  return Number.isFinite(max) ? max : 0;
}

/**
 * Reaggregation composes the bar chart's existing motion primitives:
 *
 *   aggregate A -> stacked(A x B) -> grouped(A x B)
 *               -> grouped(B x A) -> stacked(B x A) -> aggregate B
 *
 * Every detail view uses the same common-refinement key. Stacking preserves
 * additive endpoint value while grouped marks make the joint grain readable.
 */
export function barReaggregationIntermediateSpecs(
  previousSpec: ViewSpec,
  nextSpec: ViewSpec
): IntermediateSpec[] {
  const previous = barState(previousSpec);
  const next = barState(nextSpec);
  if (
    !previous || !next ||
    previous.orientation !== next.orientation ||
    previous.barLayout !== 'simple' || next.barLayout !== 'simple' ||
    !previous.hasAggregate || !next.hasAggregate ||
    previous.hasDetail || next.hasDetail ||
    !previous.categoryField || !next.categoryField ||
    previous.categoryField === next.categoryField ||
    previous.measureField !== next.measureField
  ) return [];

  const lineage = viewLineageCorrespondence(previousSpec, nextSpec);
  if (lineage?.mode !== 'reaggregate' || !lineage.splittable) return [];

  const refinement = lineage.commonRefinement;
  if (
    !refinement.includes(previous.categoryField) ||
    !refinement.includes(next.categoryField)
  ) return [];

  const previousAggregate = singleAggregate(previousSpec);
  const nextAggregate = singleAggregate(nextSpec);
  if (!compatibleAggregate(previousAggregate, nextAggregate)) return [];

  const detailSpec = (
    spec: ViewSpec,
    categoryField: string,
    segmentField: string,
    aggregate: SingleAggregate,
    layout: Extract<BarLayout, 'stacked' | 'grouped'>
  ) => reaggregationDetailSpec({
    spec, categoryField, segmentField, refinement, aggregate, layout
  });

  return [
    {
      spec: detailSpec(
        previousSpec, previous.categoryField, next.categoryField,
        previousAggregate!, 'stacked'
      ),
      scene: 'detail'
    },
    {
      spec: detailSpec(
        previousSpec, previous.categoryField, next.categoryField,
        previousAggregate!, 'grouped'
      ),
      scene: 'axis'
    },
    {
      spec: detailSpec(
        nextSpec, next.categoryField, previous.categoryField,
        nextAggregate!, 'grouped'
      ),
      scene: 'axis'
    },
    {
      spec: detailSpec(
        nextSpec, next.categoryField, previous.categoryField,
        nextAggregate!, 'stacked'
      ),
      scene: 'axis'
    }
  ];
}

type SingleAggregate = {
  groupby: string[];
  fields: Array<{ op: string; field?: string; as: string }>;
};

function singleAggregate(spec: ViewSpec): SingleAggregate | null {
  const aggregates = (spec.transform ?? [])
    .map((transform) => (transform as { aggregate?: {
      groupby?: string[];
      fields?: Array<{ op?: string; field?: string; as?: string }>;
    } }).aggregate)
    .filter((aggregate): aggregate is NonNullable<typeof aggregate> => Boolean(aggregate));
  if (aggregates.length !== 1 || aggregates[0].fields?.length !== 1) return null;
  const metric = aggregates[0].fields[0];
  const op = metric.op ?? 'count';
  const field = metric.field;
  return {
    groupby: [...(aggregates[0].groupby ?? [])],
    fields: [{ op, ...(field ? { field } : {}), as: metric.as ?? `${op}_${field || 'rows'}` }]
  };
}

function compatibleAggregate(
  previous: SingleAggregate | null,
  next: SingleAggregate | null
): boolean {
  if (!previous || !next) return false;
  const a = previous.fields[0];
  const b = next.fields[0];
  return (a.op === 'sum' || a.op === 'count') &&
    a.op === b.op && a.field === b.field && a.as === b.as;
}

function reaggregationDetailSpec({
  spec,
  categoryField,
  segmentField,
  refinement,
  aggregate,
  layout
}: {
  spec: ViewSpec;
  categoryField: string;
  segmentField: string;
  refinement: string[];
  aggregate: SingleAggregate;
  layout: Extract<BarLayout, 'stacked' | 'grouped'>;
}): ViewSpec {
  const next = cloneSpec(spec) as ViewSpec;
  const encoding = { ...(next.encoding ?? {}) } as Record<string, any>;
  const categoryChannel = barCategoryChannel(encoding);
  const measureChannel = barMeasureChannel(encoding);
  const orientation = barState(spec)!.orientation;

  if (orientation === 'horizontal') {
    encoding.y = { ...categoryChannel, field: categoryField, type: 'nominal' };
    encoding.x = { ...measureChannel, field: aggregate.fields[0].as, type: 'quantitative' };
  } else {
    encoding.x = { ...categoryChannel, field: categoryField, type: 'nominal' };
    encoding.y = { ...measureChannel, field: aggregate.fields[0].as, type: 'quantitative' };
  }
  encoding.detail = { field: segmentField, type: 'nominal' };
  encoding.color = { field: segmentField, type: 'nominal' };
  delete encoding.xOffset;
  delete encoding.yOffset;
  if (layout === 'grouped') {
    encoding[barOffsetChannelName(orientation)] = { field: segmentField, type: 'nominal' };
  }

  const transforms = (next.transform ?? [])
    .filter((transform) => !(transform as { aggregate?: unknown }).aggregate);
  transforms.push({
    aggregate: {
      groupby: refinement,
      fields: cloneSpec(aggregate.fields)
    }
  });

  const meta = { ...(next.meta ?? {}) } as Record<string, any>;
  meta.object = {
    ...(meta.object ?? {}),
    key: refinement,
    semantic: {
      entity: refinement.map((field) => ({ field })),
      measure: { value: aggregate.fields[0].as }
    }
  };
  const state = { ...(meta.state ?? {}) };
  const sceneState = { ...(state.sceneState ?? {}) };
  sceneState.detail = {
    layout,
    fields: [],
    segmentField,
    sourceField: segmentField,
    segments: null,
    valueField: aggregate.fields[0].as
  };
  sceneState.axis = {
    ...(sceneState.axis ?? {}),
    layout,
    orientation
  };
  state.sceneState = sceneState;
  meta.state = state;

  return {
    ...next,
    encoding: encoding as ViewSpec['encoding'],
    transform: transforms,
    meta: meta as ViewSpec['meta']
  };
}

function stepOrder(options: Record<string, unknown>, orientation: BarOrientation): Array<'x' | 'y'> {
  const order = options.order as Array<'x' | 'y'> | undefined;
  if (Array.isArray(order) && order.length) return order.filter((a) => a === 'x' || a === 'y');
  return orientation === 'horizontal' ? ['y', 'x'] : ['x', 'y'];
}

function segmentLayoutStepOrder(options: Record<string, unknown>, layout: BarLayout): Array<'x' | 'y'> {
  const order = options.order as Array<'x' | 'y'> | undefined;
  if (Array.isArray(order) && order.length) return order.filter((a) => a === 'x' || a === 'y');
  return layout === 'stacked' ? ['y', 'x'] : ['x', 'y'];
}

function changedBarDimensions(diff: ReturnType<typeof diffBarViewStates>): Array<'x' | 'y'> {
  return (
    [
      diff.hasDelta('bar.x-geometry') ? 'x' : null,
      diff.hasDelta('bar.y-geometry') ? 'y' : null
    ] as Array<'x' | 'y' | null>
  ).filter((v): v is 'x' | 'y' => v !== null);
}

function coordinateStepOrder({
  orderOptions,
  target,
  changesSegmentLayout,
  reverse,
  dimensions
}: {
  orderOptions: Record<string, unknown>;
  target: BarInternalState;
  changesSegmentLayout: boolean;
  reverse: boolean;
  dimensions: Array<'x' | 'y'>;
}): Array<'x' | 'y'> {
  const baseOrder = changesSegmentLayout
    ? segmentLayoutStepOrder(orderOptions, target.barLayout)
    : stepOrder(orderOptions, target.orientation);
  const ordered = reverse ? [...baseOrder].reverse() : [...baseOrder];
  const dimensionSet = new Set(dimensions);
  const steps = ordered.filter((dimension) => dimensionSet.has(dimension));
  for (const dimension of dimensions) {
    if (!steps.includes(dimension)) steps.push(dimension);
  }
  return steps;
}

function stepReason({
  changesSegmentLayout,
  crossesAxis,
  orientationChanged
}: {
  changesSegmentLayout: boolean;
  crossesAxis: boolean;
  orientationChanged: boolean;
}): string {
  if (changesSegmentLayout && crossesAxis) return 'axis-segment-layout';
  if (orientationChanged && crossesAxis) return 'axis-orientation';
  return 'bar-geometry';
}

function cloneSpec<T>(spec: T): T {
  if (spec == null) return spec;
  return JSON.parse(JSON.stringify(spec)) as T;
}
