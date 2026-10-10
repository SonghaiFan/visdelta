import { specState } from '../../spec-meta.js';
import type {
  AggregateTransform,
  BarGeometryState,
  BarLayout,
  BarOrientation,
  BarSemanticState,
  ChannelSignature,
  ChannelSpec,
  FilterSpec,
  DetailSpec,
  AxisSpec,
  ChartChangeState,
  ResolvedChartState,
  ViewSpec
} from '../../types/index.js';
import {
  barCategoryChannel,
  barMeasureChannel,
  barOrientationFromEncoding,
  isSegmentLayout
} from './layout/index.js';

export function semanticBarState(
  spec: ViewSpec,
  semanticStateArg: Partial<ResolvedChartState> | null = null
): BarSemanticState {
  const enc = (spec.encoding ?? {}) as Record<string, ChannelSpec | undefined>;
  const state = semanticStateArg ?? semanticStateFromSpec(spec);
  const aggregate = barAggregateState(spec);
  const layout = barLayoutState(spec, state, aggregate);
  const orientation = barOrientationFromEncoding(enc);
  const categoryField = barCategoryChannel(enc).field ?? null;
  const measureField = barMeasureChannel(enc).field ?? null;
  const segmentField = barSegmentField(spec, state);
  const axis = barAxisState({ orientation, layout, state });
  const detail = barDetailState({ layout, categoryField, measureField, segmentField, state });
  const geometry = barGeometryState({ enc, filters: resolveFilters(spec), layout, orientation, categoryField, measureField, segmentField });

  return {
    orientation,
    layout,
    categoryField,
    measureField,
    axis,
    detail,
    aggregate,
    segmentField,
    xGeometry: geometry.x,
    yGeometry: geometry.y
  };
}

export function barLayoutState(
  spec: ViewSpec,
  state: Partial<ResolvedChartState> = semanticStateFromSpec(spec),
  aggregate: AggregateTransform | AggregateTransform[] | null = barAggregateState(spec)
): BarLayout {
  const enc = (spec.encoding ?? {}) as Record<string, ChannelSpec | undefined>;
  const sceneState = (state as { sceneState?: ChartChangeState }).sceneState ?? {};
  const stateLayout =
    sceneState.axis?.layout ??
    sceneState.detail?.layout ??
    (state as { axis?: { layout?: BarLayout } }).axis?.layout ??
    (state as { detail?: { layout?: BarLayout } }).detail?.layout;

  if (stateLayout) return stateLayout;
  if (enc.xOffset?.field || enc.yOffset?.field) return 'grouped';
  // Color is an encoding, not grain. Only an explicit detail channel can turn
  // aggregate rows into stacked segments; a field color on one row per
  // category must remain a simple Bar.
  if (enc.detail?.field && aggregate) return 'stacked';
  return 'simple';
}

export function barAxisState({
  orientation,
  layout,
  state = {}
}: {
  orientation: BarOrientation;
  layout: BarLayout;
  state?: Partial<ResolvedChartState>;
}): AxisSpec | null {
  const sceneState = (state as { sceneState?: ChartChangeState }).sceneState ?? {};
  const explicit = sceneState.axis ?? (state as { axis?: AxisSpec }).axis;
  if (explicit) return explicit;
  if (orientation === 'horizontal') {
    return { orientation, order: ['y', 'x'] };
  }
  if (layout === 'grouped') {
    return { layout, order: ['x', 'y'] };
  }
  return null;
}

export function barDetailState({
  layout,
  categoryField,
  measureField,
  segmentField,
  state = {}
}: {
  layout: BarLayout;
  categoryField: string | null;
  measureField: string | null;
  segmentField: string | null;
  state?: Partial<ResolvedChartState>;
}): DetailSpec | null {
  const sceneState = (state as { sceneState?: ChartChangeState }).sceneState ?? {};
  const explicit =
    sceneState.detail ?? (state as { detail?: DetailSpec }).detail;
  if (explicit) return explicit;
  if (!isSegmentLayout(layout) || !segmentField) return null;
  return {
    layout,
    categoryField: categoryField ?? null,
    segmentField,
    valueField: measureField ?? null
  };
}

export function barAggregateState(
  spec: ViewSpec
): AggregateTransform | AggregateTransform[] | null {
  const transforms = (spec.transform ?? []) as Array<Record<string, unknown>>;
  const aggregates = transforms
    .filter((t) => t.aggregate)
    .map((t) => t.aggregate as AggregateTransform);
  if (!aggregates.length) return null;
  return aggregates.length === 1 ? aggregates[0] : aggregates;
}

export function barSegmentField(
  spec: ViewSpec,
  state: Partial<ResolvedChartState> = semanticStateFromSpec(spec)
): string | null {
  const sceneState = (state as { sceneState?: ChartChangeState }).sceneState ?? {};
  return (
    sceneState.detail?.segmentField ??
    (state as { detail?: DetailSpec }).detail?.segmentField ??
    (spec.encoding as Record<string, ChannelSpec | undefined>)?.detail?.field ??
    (spec.encoding as Record<string, ChannelSpec | undefined>)?.xOffset?.field ??
    (spec.encoding as Record<string, ChannelSpec | undefined>)?.yOffset?.field ??
    null
  );
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function semanticStateFromSpec(spec: ViewSpec): ResolvedChartState & { filters: FilterSpec[] } {
  const state = specState(spec);
  const transforms = (spec.transform ?? []) as Array<Record<string, unknown>>;
  return {
    ...state,
    filters: [
      ...(spec.filter ? [spec.filter as FilterSpec] : []),
      ...transforms.filter((t) => t.filter).map((t) => t.filter as FilterSpec)
    ]
  };
}

function resolveFilters(spec: ViewSpec): FilterSpec[] {
  const transforms = (spec.transform ?? []) as Array<Record<string, unknown>>;
  return [
    ...(spec.filter ? [spec.filter as FilterSpec] : []),
    ...transforms.filter((t) => t.filter).map((t) => t.filter as FilterSpec)
  ];
}

function barGeometryState({
  enc,
  filters,
  layout,
  orientation,
  categoryField,
  measureField,
  segmentField
}: {
  enc: Record<string, ChannelSpec | undefined>;
  filters: FilterSpec[];
  layout: BarLayout;
  orientation: BarOrientation;
  categoryField: string | null;
  measureField: string | null;
  segmentField: string | null;
}): { x: BarGeometryState; y: BarGeometryState } {
  const category = { role: 'category' as const, field: categoryField, filters };
  // A filter can replace the observation behind a persistent mark key (for
  // example another age cohort for the same state). Its measure must animate
  // too, even in simple/grouped layouts; stacks also recompute their intervals.
  const measure = {
    role: 'measure' as const,
    field: measureField,
    filters
  };
  const segment = segmentField
    ? { field: segmentField, color: channelSignature(enc.color) }
    : null;

  if (orientation === 'horizontal') {
    return {
      x: {
        orientation,
        layout,
        measure,
        segment: layout === 'stacked' ? segment : null,
        channel: channelSignature(enc.x)
      },
      y: {
        orientation,
        layout,
        category,
        segment: layout === 'grouped' ? segment : null,
        channel: channelSignature(enc.y)
      }
    };
  }

  return {
    x: {
      orientation,
      layout,
      category,
      segment: layout === 'grouped' ? segment : null,
      channel: channelSignature(enc.x)
    },
    y: {
      orientation,
      layout,
      measure,
      segment: layout === 'stacked' ? segment : null,
      channel: channelSignature(enc.y)
    }
  };
}

function channelSignature(channel: ChannelSpec | undefined = {}): ChannelSignature {
  return {
    field: channel.field ?? null,
    title: channel.title ?? null,
    type: channel.type ?? null,
    aggregate: typeof channel.aggregate === 'string' ? channel.aggregate : null,
    domain: (channel.domain as unknown[] | undefined) ?? null,
    scale: (channel.scale as Record<string, unknown> | undefined) ?? null,
    sort: channel.sort ?? null,
    bin: channel.bin ?? null
  };
}
