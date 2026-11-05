import { chartError } from '../../edit-errors.js';
import { distributionOptions, validateDistributionOptions } from './layout/distribution.js';
import { validateFacetLayout } from '../facet-layout.js';
import type { FacetLayout } from '../../facet.js';
import { serializeViewSpec, specScopes, specState } from '../../spec-meta.js';
import { cloneState } from '../../grammar/view-state.js';
import { aggregateTitle, titleize } from '../../labels.js';
import { ChartState, channelFrom, colorFrom, normalizeDataSource, resolveInlineDataTypes } from '../authoring.js';
import { compileViewWithCompiler } from '../compile-view.js';
import { createBarSpecCompiler } from './compile.js';
import { chartModule as barModule } from './module.js';
import type {
  BarLayout,
  BarLayoutOptions,
  ChannelSpec,
  FilterSpec,
  DetailSpec,
  AxisSpec,
  SemanticKey,
  TransitionOrder,
  ViewSpec
} from '../../types/index.js';

export interface BarViewState extends ViewSpec {
  facetLayout?: FacetLayout;
  mark: 'bar';
  detail?: DetailSpec | null;
  axis?: AxisSpec | null;
  aggregate?: unknown;
  semanticKey?: SemanticKey | null;
}

export function bar(data?: unknown): BarState {
  return new BarState({ data: normalizeDataSource(data), mark: 'bar', encoding: {} } as BarViewState);
}

const BAR_SPEC_COMPILER = createBarSpecCompiler();

export class BarState extends ChartState<BarViewState> {
  override repeat(field: string, layout: FacetLayout = {}): this {
    if (!field.trim()) throw new Error('Repeat requires a grouping field.');
    validateFacetLayout(layout);
    return this.with({ encoding: { facet: { field, type: 'nominal' } }, facetLayout: layout } as Partial<BarViewState>);
  }

  chartModule() {
    return barModule;
  }

  override toSpec(): BarViewState {
    const spec = cloneState(this.state) as BarViewState;

    const filters: FilterSpec[] = spec.filter ? [spec.filter as FilterSpec] : [];
    if (filters.length) {
      spec.transform = [
        ...filters.map((filter) => ({ filter })),
        ...(spec.transform ?? [])
      ];
    }
    delete spec.filter;
    if (spec.detail == null) delete spec.detail;
    if (spec.axis == null) delete spec.axis;
    delete spec.aggregate;
    if (spec.semanticKey == null) delete spec.semanticKey;

    return resolveInlineDataTypes(pruneAuthoringState(
      compileViewWithCompiler(serializeViewSpec(spec as ViewSpec), { scene: [] }, BAR_SPEC_COMPILER)
    )) as BarViewState;
  }

  override x(field: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    const channel = channelFrom(field, { type: 'nominal', ...options });
    return this.with({
      key: (this.state as BarViewState).key ?? channel.field,
      encoding: { x: channel }
    } as Partial<BarViewState>);
  }

  override y(field: string | ChannelSpec, options: Partial<ChannelSpec> | string = {}): this {
    if (typeof options === 'string') options = { label: options };
    const { color, tooltip, ...channelOptions } = options as Partial<ChannelSpec> & {
      color?: unknown;
      tooltip?: unknown;
    };
    const channel = channelFrom(field, { type: 'quantitative', ...channelOptions });
    return this.with({
      encoding: {
        y: channel,
        ...(color ? { color: colorFrom(color as string | ChannelSpec) } : {}),
        ...(tooltip ? { tooltip: cloneState(tooltip) } : {})
      }
    } as Partial<BarViewState>);
  }

  override where(selector: Record<string, unknown> | FilterSpec): this {
    return super.where(selector);
  }

  /** Clear highlight explicitly without changing filters, rows or focus. */
  override highlight(selector: Record<string, unknown> | FilterSpec | null,
    options: { opacity?: number } = {}): this {
    const scopes = { ...specState(this.state).scopes,
      ...Object.fromEntries(Object.entries(specScopes(this.state)).filter(([, value]) => value != null)),
      ...this.state.scopes };
    const hydrated = Object.keys(scopes).length ? this.with({ scopes } as Partial<BarViewState>) : this;
    if (selector === null) return hydrated.with({ scopes: { ...scopes, highlight: null } } as Partial<BarViewState>);
    return super.highlight.call(hydrated, selector, options);
  }

  flip(options: TransitionOrder & {
    domain?: unknown[];
    scale?: Record<string, unknown>;
  } = {}): this {
    const domain = options.domain ?? (options.scale as Record<string, unknown> | undefined)?.domain;
    const scale = domain || options.scale
      ? { ...(options.scale ?? {}), ...(domain ? { domain } : {}) }
      : undefined;
    return this.axis({
      flip: true,
      ...(scale ? { scale } : {}),
      ...(options.order ? { order: options.order } : {}),
      ...(options.duration != null ? { duration: options.duration } : {}),
      ...(options.stagger ? { stagger: options.stagger } : {})
    });
  }

  breakdown(
    segment = 'type',
    options: {
      category?: string;
      value?: string;
      by?: string | string[];
      layout?: BarLayout;
      op?: string;
      label?: string | false;
      color?: unknown;
      tooltip?: unknown;
      [key: string]: unknown;
    } = {}
  ): this {
    const category = options.category ?? (this.state as BarViewState).encoding?.x?.field;
    const value = options.value ?? (this.state as BarViewState).encoding?.y?.field ?? 'count';
    const op = options.op ?? 'sum';
    const currentY = (this.state as BarViewState).encoding?.y;
    const nextTitle = options.label === false
      ? currentY?.label ?? titleize(value)
      : options.label ?? currentY?.label ?? titleize(value);
    const { by, category: _cat, value: _val, ...rest } = options;
    const next = aggregateBarState(this, {
      ...rest,
      by: by ?? ([category, segment].filter(Boolean) as string[]),
      segment,
      value,
      valueTitle: nextTitle,
      layout: options.layout ?? 'stacked',
      op
    });
    return options.label === false
      ? next
      : next.y(value, {
          ...currentY,
          field: value,
          label: nextTitle
        });
  }

  rollup(
    groupbyOrOptions:
      | string
      | string[]
      | {
          groupby?: string | string[];
          by?: string | string[];
          value?: string;
          as?: string;
          op?: string;
          color?: unknown;
          label?: string;
          [key: string]: unknown;
        }
      | null = null,
    options: {
      groupby?: string | string[];
      by?: string | string[];
      value?: string;
      as?: string;
      op?: string;
      color?: unknown;
      label?: string;
      [key: string]: unknown;
    } = {}
  ): this {
    if (groupbyOrOptions && typeof groupbyOrOptions === 'object' && !Array.isArray(groupbyOrOptions)) {
      options = groupbyOrOptions;
      groupbyOrOptions = options.groupby ?? options.by ?? null;
    }
    const parent = groupbyOrOptions ?? options.groupby ?? options.by
      ?? (this.state as BarViewState).encoding?.x?.field;
    const fields = (asArray(parent as string | string[] | null).filter(Boolean) as string[]);
    const value = options.value ?? (this.state as BarViewState).encoding?.y?.field ?? 'count';
    const op = options.op ?? 'sum';
    const { color, label, by: _by, groupby: _groupby, value: _value, ...rest } = options;

    // A wide-data segment creates its measure field through a fold. Preserve
    // that preparation when rolling the detail back into category totals.
    // Otherwise rollup would aggregate a field that does not exist in the
    // original CSV rows.
    const detail = (this.state as BarViewState).detail;
    const rollupSource = detail?.fields?.length
      ? this.with({
          transform: [
            ...((this.state as BarViewState).transform ?? []),
            {
              fold: {
                fields: detail.fields,
                as: [detail.segment ?? 'segment', detail.value ?? value],
                sourceAs: detail.source ?? '__measure',
                labels: detail.labels ?? {}
              }
            }
          ]
        } as Partial<BarViewState>)
      : this;

    let nextState = aggregateBarState(rollupSource, {
      ...rest,
      groupby: fields,
      value,
      as: options.as ?? value,
      op
    });
    if (!color) {
      const next = cloneState(nextState.state) as BarViewState;
      const colorFields = channelFields(next.encoding?.color);
      if (colorFields.some((field) => !fields.includes(field))) {
        delete next.encoding?.color;
        nextState = nextState.derive(next);
      }
    }
    const currentY = (this.state as BarViewState).encoding?.y;
    nextState = nextState.y(value, {
      label: label ?? aggregateTitle(op, currentY?.label ?? value),
      format: currentY?.format
    });
    if (color) nextState = nextState.color(color as string | ChannelSpec);
    return nextState;
  }

  layout(layout: BarLayout, options: BarLayoutOptions = {}): this {
    if (Object.keys(options).some(key => !['normalize', 'segments', 'negative', 'neutral', 'positive', 'order', 'duration', 'stagger'].includes(key))) {
      throw chartError('INVALID_EDIT_ARGUMENTS', 'Unknown Bar layout option.', 'Use normalize, segments, negative, neutral, positive or transition timing; separate neutral is unsupported.', {chartType:'bar',method:'layout'});
    }
    const { normalize, segments, negative, neutral, positive } = options;
    const stack = layout === 'diverging' || [normalize, segments, negative, neutral, positive].some(value => value !== undefined)
      ? Object.fromEntries(Object.entries({ normalize, segments, negative, neutral, positive }).filter(([, value]) => value !== undefined)) : null;
    validateDistributionOptions(layout, stack);
    const state = this.state as BarViewState;
    return this.derive({
      ...cloneState(state),
      detail: state.detail
        ? { ...state.detail, layout }
        : undefined,
      axis: {
        ...(state.axis ?? {}),
        layout,
        ...(stack || distributionOptions(state) || state.axis?.stack ? { stack } : {}),
        ...(options.order ? { order: options.order } : {}),
        ...(options.duration != null ? { duration: options.duration } : {}),
        ...(options.stagger ? { stagger: options.stagger } : {})
      } as AxisSpec
    } as BarViewState, { captureResetBaseline: true });
  }

}

function channelFields(channel: ChannelSpec | undefined): string[] {
  if (!channel) return [];
  return [
    channel.field,
    (channel.hue as ChannelSpec | undefined)?.field,
    (channel.luminance as ChannelSpec | undefined)?.field
  ].filter((field): field is string => typeof field === 'string' && field.length > 0);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function aggregateBarState<T extends BarState>(
  view: T,
  config: {
    by?: string | string[];
    groupby?: string | string[];
    segment?: string;
    category?: string;
    categoryTitle?: string;
    value?: string;
    as?: string;
    valueTitle?: string;
    layout?: BarLayout;
    op?: string;
    color?: unknown;
    domain?: unknown[];
    range?: unknown[];
    tooltip?: unknown;
    key?: string | string[];
    semanticKey?: SemanticKey;
    [key: string]: unknown;
  }
): T {
  const normalized = normalizeAggregation(config, view.state as BarViewState);
  const { groupby, segment } = normalized;

  if (segment) {
    return view.with({
      key: normalized.key ?? [normalized.category, segment],
      detail: {
        category: normalized.category,
        categoryTitle: normalized.categoryTitle,
        fields: [],
        labels: {},
        segment,
        value: normalized.value,
        valueTitle: normalized.valueTitle,
        layout: normalized.layout ?? 'stacked',
        color: cloneState(normalized.color) as ChannelSpec | undefined,
        domain: normalized.domain as unknown[] | undefined,
        source: segment,
        groupby,
        op: normalized.op
      } as DetailSpec,
      ...(normalized.tooltip ? { encoding: { tooltip: cloneState(normalized.tooltip) } } : {})
    } as Partial<BarViewState>, { captureResetBaseline: true });
  }

  return view.with({
    key: normalized.key ?? (groupby.length === 1 ? groupby[0] : groupby),
    detail: null,
    axis: null,
    semanticKey: normalized.semanticKey ?? null,
    transform: [
      ...((view.state as BarViewState).transform ?? []),
      {
        aggregate: {
          groupby,
          fields: [{ op: normalized.op, field: normalized.value, as: normalized.as }]
        }
      }
    ]
  } as Partial<BarViewState>, { captureResetBaseline: true });
}

function normalizeAggregation(
  config: Record<string, unknown>,
  state: BarViewState
): {
  groupby: string[];
  category: string | null;
  categoryTitle: string;
  segment: string | undefined;
  value: string;
  as: string;
  valueTitle: string;
  op: string;
  layout?: BarLayout;
  color?: unknown;
  domain?: unknown;
  range?: unknown;
  tooltip?: unknown;
  key?: string | string[];
  semanticKey?: SemanticKey;
} {
  const xField = state.encoding?.x?.field;
  const yField = state.encoding?.y?.field;
  const groupby = asArray((config.by ?? config.groupby ?? xField) as string | string[] | null).filter(Boolean) as string[];
  const value = (config.value ?? config.field ?? yField ?? 'value') as string;
  const as = (config.as ?? value) as string;
  const op = (config.op ?? config.use ?? 'sum') as string;
  const segment = (config.segment ?? groupby.find((f) => f !== xField)) as string | undefined;
  const category = (config.category ?? xField ?? groupby.find((f) => f !== segment)) as string | null;

  return {
    ...config,
    groupby,
    category,
    categoryTitle: (config.categoryTitle ?? state.encoding?.x?.label ?? titleize(category ?? '')) as string,
    segment,
    value,
    as,
    valueTitle: (config.valueTitle ?? aggregateTitle(
      op,
      state.encoding?.y?.label ?? titleize(segment ? value : as)
    )) as string,
    op
  };
}

function asArray<T>(value: T | T[] | null | undefined): (T | undefined)[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function pruneAuthoringState(spec: ViewSpec): ViewSpec {
  const next = cloneState(spec) as ViewSpec;
  delete next.margin;
  const state = (next.meta as Record<string, unknown> | undefined)?.state as
    | Record<string, unknown>
    | undefined;
  if (!state) return next;

  const sceneState = (state.sceneState ?? {}) as Record<string, unknown>;
  const preservedSceneState: Record<string, unknown> = {};

  const axis = sceneState.axis ?? state.axis;

  if (hasCustomAxisOrder(axis as Record<string, unknown> | null) || (sceneState.detail as Record<string, unknown> | null)?.offset) {
    const g = (axis ?? {}) as Record<string, unknown>;
    preservedSceneState.axis = {
      ...(g.layout ? { layout: g.layout } : {}),
      ...(g.orientation ? { orientation: g.orientation } : {}),
      ...(g.order ? { order: g.order } : {}),
      ...(g.duration != null ? { duration: g.duration } : {}),
      ...(g.stagger ? { stagger: g.stagger } : {})
    };
  }

  const offset = (sceneState.detail as Record<string, unknown> | undefined)?.offset;
  if (offset) preservedSceneState.detail = { offset };

  delete state.axis;
  delete state.detail;
  state.sceneState = preservedSceneState;
  if (!Object.keys(state.sceneState as object).length) delete state.sceneState;
  if (!Object.keys(state).length) delete (next.meta as Record<string, unknown>).state;
  if (next.meta && !Object.keys(next.meta as object).length) delete next.meta;
  return next;
}

function hasCustomAxisOrder(axis: Record<string, unknown> | null): boolean {
  if (!axis) return false;
  if (axis.duration != null || axis.stagger != null) return true;
  if (!Array.isArray(axis.order)) return false;
  return (axis.order as string[]).join('|') !== defaultAxisOrder(axis).join('|');
}

function defaultAxisOrder(axis: Record<string, unknown>): string[] {
  return axis.orientation === 'horizontal' ? ['y', 'x'] : ['x', 'y'];
}
