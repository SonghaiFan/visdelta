import { serializeViewSpec } from '../spec-meta.js';
import { ViewState, cloneState } from '../grammar/view-state.js';
import { titleize } from '../labels.js';
import { normalizeFilter } from '../data/filter.js';
import { applyTransforms } from '../data/transforms.js';
import { resolveSpecDataTypes } from '../data/types.js';
import type {
  ChannelSpec,
  ChannelType,
  EncodingSpec,
  FilterSpec,
  SelectionSpec,
  ViewScopes,
  AxisSpec,
  SortOrder,
  TransformSpec,
  TransitionSpec,
  ViewSpec
} from '../types/index.js';

export { titleize };

// ─── Data source normalisation ────────────────────────────────────────────────
//
// Observable-Plot style: pass a URL (string or { url }) directly to bar() etc.
//
//   bar('/data/weather.csv').x('decade').y('count')
//   bar({ url: '/data/weather.csv', type: 'csv' }).x(...).y(...)
//
// A plain non-URL string is treated as a named dataset reference (existing
// behavior). Standalone transition() resolves inline URLs directly; a driver
// may additionally provide named sources through its own data map.

export function normalizeDataSource(data: unknown): unknown {
  if (typeof data === 'string' && isDataUrl(data)) {
    return { url: data };
  }
  return data;
}

function isDataUrl(s: string): boolean {
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('/') ||
    /\.(csv|json|tsv|arrow)(\?.*)?$/i.test(s)
  );
}

// ─── ChartState ───────────────────────────────────────────────────────────────

export class ChartState<S extends ViewSpec = ViewSpec> extends ViewState<S> {
  override toSpec(): Omit<S, '__grammar'> {
    const compiled = this.compileSpec(serializeViewSpec(super.toSpec() as ViewSpec));
    return compileAuthoredView(resolveInlineDataTypes(compiled)) as Omit<S, '__grammar'>;
  }

  /** Chart subclasses override this without importing the global chart manifest. */
  protected compileSpec(spec: ViewSpec): ViewSpec {
    return spec;
  }

  data(data: unknown): this {
    // A data binding replaces the old source (including URL/inline metadata).
    const spec = cloneState(this.state);
    (spec as ViewSpec).data = normalizeDataSource(data) as ViewSpec['data'];
    const Ctor = this.constructor as new (state: S) => this;
    return new Ctor(spec as S);
  }

  /** Materialize the tidy rows represented by this immutable chart state. */
  rows(source?: Record<string, unknown>[]): Record<string, unknown>[] {
    const spec = this.toSpec() as ViewSpec;
    const records = source ?? inlineRows(spec.data);
    if (!records) {
      throw new Error('VisDelta rows() needs inline records or source rows for a named dataset.');
    }
    return applyTransforms(records, spec.transform ?? []);
  }

  x(field: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    return this.channel('x', field, options);
  }

  y(field: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    return this.channel('y', field, options);
  }

  channel(name: string, field: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    return this.with({
      encoding: { [name]: channelFrom(field, options) } as Partial<EncodingSpec>
    } as Partial<S>);
  }

  color(valueOrField: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    return this.with({ encoding: { color: colorFrom(valueOrField, options) } } as Partial<S>);
  }

  size(field: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    return this.channel('size', field, { type: 'quantitative', ...options });
  }

  key(fields: string | string[]): this {
    const value = Array.isArray(fields) && fields.length === 1 ? fields[0] : fields;
    return this.with({ key: value } as Partial<S>);
  }

  /** Declare stable source-row identity independently of the current mark grain. */
  datumKey(fields: string | string[]): this {
    const value = Array.isArray(fields) && fields.length === 1 ? fields[0] : fields;
    return this.with({ datumKey: value } as Partial<S>);
  }

  tooltip(items: string | ChannelSpec | Array<string | ChannelSpec>): this {
    const list = Array.isArray(items) ? items : [items];
    return this.with({
      encoding: {
        tooltip: cloneState(
          list.map((item) =>
            typeof item === 'string' ? { field: item, title: titleize(item) } : item
          )
        )
      }
    } as Partial<S>);
  }

  sort(field: string, order: SortOrder = 'ascending'): this {
    return this.with({
      transform: [
        ...((this.state as ViewSpec).transform ?? []),
        { sort: { field, order } }
      ]
    } as Partial<S>);
  }

  transition(timing: TransitionSpec): this {
    return this.with({ transition: timing } as Partial<S>);
  }

  where(selector: string | Record<string, unknown> | FilterSpec): this {
    return this.with({
      transform: appendConjunctiveFilters(
        (this.state as ViewSpec).transform ?? [],
        selectorsFrom(selector)
      )
    } as Partial<S>, 'selection');
  }

  /** Fit one camera around selected marks without changing rows or mark identity. */
  focus(selector: string | Record<string, unknown> | FilterSpec): this {
    const scopes = ((this.state as ViewSpec).scopes ?? {}) as ViewScopes;
    return this.with({
      scopes: {
        ...scopes,
        focus: appendScopeFilters(scopes.focus, selectorsFrom(selector), 'focus')
      }
    } as Partial<S>, 'selection');
  }

  highlight(
    selector: string | Record<string, unknown> | FilterSpec,
    options: { opacity?: number } = {}
  ): this {
    const scopes = ((this.state as ViewSpec).scopes ?? {}) as ViewScopes;
    return this.with({
      scopes: {
        ...scopes,
        highlight: appendScopeFilters(scopes.highlight, selectorsFrom(selector), 'highlight', options)
      }
    } as Partial<S>, 'selection');
  }

  /** Configure the chart axes, scales, orientation, and transition order. */
  axis(config: Partial<AxisSpec> = {}): this {
    return this.with({ axis: cloneState(config) } as Partial<S>, 'axis');
  }
}

export function resolveInlineDataTypes(spec: ViewSpec): ViewSpec {
  const data = spec.data as { values?: unknown[] } | unknown[] | undefined;
  const rows = Array.isArray(data) ? data : Array.isArray(data?.values) ? data.values : null;
  return rows ? resolveSpecDataTypes(spec, rows) : spec;
}

function inlineRows(data: ViewSpec['data']): Record<string, unknown>[] | null {
  const values = Array.isArray(data)
    ? data
    : Array.isArray((data as { values?: unknown[] } | undefined)?.values)
    ? (data as { values: unknown[] }).values
    : null;
  if (!values) return null;
  return values.map((row) => ({ ...(row as Record<string, unknown>) }));
}

function compileAuthoredView(spec: ViewSpec): ViewSpec {
  return pruneAuthoringSpec(spec) as ViewSpec;
}

// ─── Channel factories ────────────────────────────────────────────────────────

export function channelFrom(
  field: string | ChannelSpec,
  options: Partial<ChannelSpec> = {}
): ChannelSpec {
  if (field && typeof field === 'object') {
    const channel = { ...field, ...options };
    return {
      ...channel,
      ...(channel.field && !channel.title ? { title: titleize(channel.field) } : {})
    };
  }
  return {
    field: field as string,
    title: titleize(field as string),
    ...options
  };
}

export function colorFrom(
  valueOrField: string | ChannelSpec,
  options: Partial<ChannelSpec> = {}
): ChannelSpec {
  if (valueOrField && typeof valueOrField === 'object') return cloneState(valueOrField);
  if (typeof valueOrField === 'string' && valueOrField.startsWith('#')) return { value: valueOrField };
  return options.value
    ? { value: options.value }
    : { field: valueOrField as string, type: 'nominal' as ChannelType, ...options };
}

export function selectorFrom(
  selector: string | Record<string, unknown> | FilterSpec = {}
): SelectionSpec {
  if (typeof selector === 'string') return normalizeFilter(selector);
  const sel = selector as Record<string, unknown>;
  if (sel.field) return cloneState(normalizeFilter(sel));
  const entries = Object.entries(sel);
  if (entries.length === 1) {
    const [field, equal] = entries[0];
    return { field, equal };
  }
  throw new Error('Use a single field comparison for this chart selector.');
}

export function selectorsFrom(
  selector: string | Record<string, unknown> | FilterSpec = {}
): FilterSpec[] {
  if (typeof selector === 'string') return [normalizeFilter(selector)];
  const sel = selector as Record<string, unknown>;
  if (sel.field) return [cloneState(normalizeFilter(sel))];
  const entries = Object.entries(sel);
  if (!entries.length) throw new Error('Chart selectors require at least one field.');
  return entries.map(([field, constraint]) => normalizeFilter(
    Array.isArray(constraint)
      ? { field, oneOf: constraint }
      : constraint && typeof constraint === 'object'
      ? { field, ...(constraint as Record<string, unknown>) }
      : { field, equal: constraint }
  ));
}

function appendScopeFilters(
  current: SelectionSpec | null | undefined,
  filters: FilterSpec[],
  mode: 'focus' | 'highlight',
  options: { opacity?: number } = {}
): SelectionSpec {
  const combined = canonicalFilters([...(current?.filters ?? (current?.filter ? [current.filter] : [])), ...filters]);
  return {
    mode,
    filters: combined,
    filter: combined.length === 1 ? combined[0] : undefined,
    ...(mode === 'highlight' && (options.opacity != null || current?.opacity != null)
      ? { opacity: options.opacity ?? current?.opacity }
      : {})
  };
}

function appendConjunctiveFilters(transforms: TransformSpec[], filters: FilterSpec[]): TransformSpec[] {
  const next = [...transforms];
  const trailing: FilterSpec[] = [];
  while (next.length) {
    const transform = next[next.length - 1] as Record<string, unknown>;
    if (!transform.filter || Object.keys(transform).some((key) => key !== 'filter')) break;
    trailing.unshift(normalizeFilter(transform.filter));
    next.pop();
  }
  return [
    ...next,
    ...canonicalFilters([...trailing, ...filters]).map((filter) => ({ filter }))
  ];
}

function canonicalFilters(filters: FilterSpec[]): FilterSpec[] {
  const entries = new Map(filters.map((filter) => {
    const normalized = normalizeFilter(filter);
    return [stableFilterKey(normalized), normalized];
  }));
  return [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, filter]) => filter);
}

function stableFilterKey(filter: FilterSpec): string {
  const { field, ...operators } = filter;
  return JSON.stringify([field, Object.fromEntries(Object.entries(operators).sort(([a], [b]) => a.localeCompare(b)))]);
}

// ─── Spec pruning ─────────────────────────────────────────────────────────────

function pruneAuthoringSpec(spec: ViewSpec): ViewSpec {
  const next = pruneEmpty(cloneState(spec)) as ViewSpec;
  if (Array.isArray(next.transform) && !next.transform.length) delete next.transform;

  const state = (next.meta as Record<string, unknown> | undefined)?.state as
    | Record<string, unknown>
    | undefined;
  if (!state) return next;

  const sceneState = (state.sceneState ?? {}) as Record<string, unknown>;
  if (!sceneState.axis && shouldPreserveAxisState(state.axis)) {
    sceneState.axis = state.axis;
  }

  delete state.selection;
  delete state.axis;
  delete state.detail;
  state.sceneState = sceneState;
  pruneSceneStateDefaults(state.sceneState as Record<string, unknown>);
  state.sceneState = pruneEmpty(state.sceneState);
  if (!Object.keys(state.sceneState as object).length) delete state.sceneState;
  if (!Object.keys(state).length) delete (next.meta as Record<string, unknown>).state;
  if (next.meta && !Object.keys(next.meta as object).length) delete next.meta;

  return pruneEmpty(next) as ViewSpec;
}

function pruneSceneStateDefaults(sceneState: Record<string, unknown>): void {
  const axis = sceneState.axis as Record<string, unknown> | undefined;
  if (axis) {
    if (axis.xScale === 'linear') delete axis.xScale;
    if (axis.yScale === 'linear') delete axis.yScale;
    if (isDefaultOrder(axis)) delete axis.order;
  }
}

function shouldPreserveAxisState(axis: unknown): boolean {
  if (!axis || typeof axis !== 'object' || Array.isArray(axis)) return false;
  const semanticKeys = ['layout', 'x', 'y', 'group', 'value'];
  return semanticKeys.some((k) => (axis as Record<string, unknown>)[k] != null);
}

function isDefaultOrder(axis: Record<string, unknown>): boolean {
  if (!Array.isArray(axis.order)) return false;
  if (axis.duration != null || axis.stagger != null) return false;
  return (axis.order as string[]).join('|') === 'x|y';
}

function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(pruneEmpty).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return value == null ? undefined : value;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => [k, pruneEmpty(v)] as const)
    .filter(([, v]) => v !== undefined)
    .filter(([, v]) => !isPlainObject(v) || Object.keys(v as object).length > 0);

  return Object.fromEntries(entries);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
