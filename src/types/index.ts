// ─── Channel & Encoding ──────────────────────────────────────────────────────

export type ChannelType = 'quantitative' | 'temporal' | 'nominal' | 'ordinal';
export type SortOrder = 'ascending' | 'descending';

export interface SortSpec {
  field?: string;
  order?: SortOrder;
  op?: string;
}

export interface ChannelSpec {
  field?: string;
  type?: ChannelType;
  title?: string;
  /** D3 format specifier used by a quantitative axis, for example "~s". */
  format?: string;
  aggregate?: string | boolean;
  timeUnit?: string;
  value?: string;
  sort?: SortOrder | SortSpec;
  domain?: unknown[];
  scale?: Record<string, unknown>;
  bin?: boolean | Record<string, unknown>;
  [key: string]: unknown;
}

export interface EncodingSpec {
  x?: ChannelSpec;
  y?: ChannelSpec;
  color?: ChannelSpec;
  /** Declares grouping/detail identity without assigning a visual property. */
  detail?: ChannelSpec;
  size?: ChannelSpec;
  xOffset?: ChannelSpec;
  yOffset?: ChannelSpec;
  tooltip?: ChannelSpec | ChannelSpec[];
  key?: ChannelSpec;
  [channel: string]: ChannelSpec | ChannelSpec[] | undefined;
}

// ─── Transforms & Filters ────────────────────────────────────────────────────

export interface FilterSpec {
  field: string;
  equal?: unknown;
  notEqual?: unknown;
  gt?: number | string | Date;
  lt?: number | string | Date;
  gte?: number | string | Date;
  lte?: number | string | Date;
  oneOf?: unknown[];
  [key: string]: unknown;
}

export interface AggregateFieldSpec {
  op?: string;
  field?: string;
  as?: string;
}

export interface AggregateTransform {
  groupby?: string[];
  fields?: AggregateFieldSpec[];
}

export interface TimeUnitTransform {
  field: string;
  unit: string;
  as?: string;
}

export type TransformSpec =
  | { filter: FilterSpec | string; [key: string]: unknown }
  | { aggregate: AggregateTransform; [key: string]: unknown }
  | { sort: SortSpec & { field: string }; [key: string]: unknown }
  | { timeUnit: TimeUnitTransform; [key: string]: unknown }
  | Record<string, unknown>;

// ─── Timing ──────────────────────────────────────────────────────────────────

export interface StaggerSpec {
  step?: number;
  max?: number;
  by?: string;
}

export interface TransitionSpec {
  duration?: number;
  ease?: string;
  stagger?: StaggerSpec | number;
}

export interface TransitionOrder {
  order?: Array<'x' | 'y'>;
  duration?: number;
  stagger?: StaggerSpec;
}

export interface TimingDefaults {
  transition: Required<TransitionSpec>;
  step: { minDuration: number };
  unit: {
    axisDurationMultiplier: number;
    xRatio: number;
  };
}

// ─── Layout & Margin ─────────────────────────────────────────────────────────

export interface MarginSpec {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ─── Selection / Axis / Detail ─────────────────────────────────────────────

export interface SelectionSpec {
  field?: string;
  equal?: unknown;
  mode?: 'highlight' | 'filter' | 'focus';
  filter?: FilterSpec;
  /** Conjunctive selector chain. Every filter must match. */
  filters?: FilterSpec[];
  opacity?: number;
  [key: string]: unknown;
}

export interface ViewScopes {
  focus?: SelectionSpec | null;
  highlight?: SelectionSpec | null;
}

export interface AxisSpec {
  flip?: boolean;
  layout?: BarLayout;
  orientation?: BarOrientation;
  xScale?: string;
  yScale?: string;
  order?: Array<'x' | 'y'>;
  duration?: number;
  stagger?: StaggerSpec;
  scale?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DetailSpec {
  category?: string | null;
  categoryTitle?: string;
  categoryField?: string | null;
  fields?: string[];
  labels?: Record<string, string>;
  segment?: string;
  segmentField?: string | null;
  value?: string;
  valueTitle?: string;
  valueField?: string | null;
  layout?: BarLayout;
  color?: ChannelSpec;
  domain?: unknown[];
  range?: unknown[];
  source?: string;
  groupby?: string[];
  op?: string;
  [key: string]: unknown;
}

// ─── Semantic Key ─────────────────────────────────────────────────────────────

export interface SemanticKeyPart {
  field?: string;
  value?: unknown;
}

export type SemanticKeyPartInput = string | SemanticKeyPart | Array<string | SemanticKeyPart>;

export interface SemanticKey {
  entity?: SemanticKeyPartInput;
  entities?: SemanticKeyPartInput;
  measure?: SemanticKeyPartInput;
  measures?: SemanticKeyPartInput;
}

// ─── Spec metadata ───────────────────────────────────────────────────────────

export interface ObjectMeta {
  key?: string | string[] | null;
  semantic?: Record<string, unknown>;
}

export interface ChartChangeState {
  selection?: SelectionSpec;
  focus?: SelectionSpec | null;
  highlight?: SelectionSpec | null;
  axis?: AxisSpec;
  detail?: DetailSpec;
  [key: string]: unknown;
}

export interface ChartStateMeta {
  selection?: SelectionSpec | null;
  axis?: AxisSpec | null;
  detail?: DetailSpec | null;
  sceneState?: ChartChangeState;
  scopes?: ViewScopes;
}

export interface SpecMeta {
  object?: ObjectMeta;
  lineage?: { key?: string | string[] };
  state?: ChartStateMeta;
  transition?: TransitionSpec;
  transform?: TransformSpec[];
  unit?: Record<string, unknown>;
  annotation?: { title?: string; description?: string };
  [key: string]: unknown;
}

export interface ResolvedChartState {
  selection: SelectionSpec | null;
  axis: AxisSpec | null;
  detail: DetailSpec | null;
  sceneState: ChartChangeState;
  scopes: ViewScopes;
}

// ─── View Spec ────────────────────────────────────────────────────────────────

export type Mark = 'area' | 'bar' | 'line' | 'point' | 'unit' | (string & {});

export interface ViewSpec {
  mark?: Mark;
  data?: string | { name: string } | Record<string, unknown>;
  encoding?: EncodingSpec;
  transform?: TransformSpec[];
  filter?: FilterSpec;
  key?: string | string[] | null;
  /** Stable identity of source data records; distinct from the current mark key. */
  datumKey?: string | string[] | null;
  semanticKey?: SemanticKey | null;
  transition?: TransitionSpec;
  axis?: AxisSpec | null;
  detail?: DetailSpec | null;
  selection?: SelectionSpec | null;
  scopes?: ViewScopes;
  unit?: Record<string, unknown> | null;
  meta?: SpecMeta;
  margin?: Partial<MarginSpec>;
  [field: string]: unknown;
}

// ─── Bar-specific ─────────────────────────────────────────────────────────────

export type BarLayout = 'simple' | 'grouped' | 'stacked';
export type BarOrientation = 'vertical' | 'horizontal';

export interface ChannelSignature {
  field: string | null;
  title: string | null;
  type: string | null;
  aggregate: string | null;
  domain: unknown[] | null;
  scale: Record<string, unknown> | null;
  sort: unknown | null;
  bin: unknown | null;
}

export interface BarGeometryRole {
  role: 'category' | 'measure';
  field: string | null;
  filters?: FilterSpec[];
}

export interface BarGeometrySegment {
  field: string;
  color: ChannelSignature;
}

export interface BarGeometryState {
  orientation: BarOrientation;
  layout: BarLayout;
  category?: BarGeometryRole;
  measure?: BarGeometryRole;
  segment?: BarGeometrySegment | null;
  channel: ChannelSignature;
}

export interface BarSemanticState {
  orientation: BarOrientation;
  layout: BarLayout;
  categoryField: string | null;
  measureField: string | null;
  axis: AxisSpec | null;
  detail: DetailSpec | null;
  aggregate: AggregateTransform | AggregateTransform[] | null;
  segmentField: string | null;
  xGeometry: BarGeometryState;
  yGeometry: BarGeometryState;
}

// ─── Grammar internal ─────────────────────────────────────────────────────────

export interface GrammarMeta {
  operations?: string[];
  /** Per-chart-type scene capabilities (e.g. bar opts out of `mapping`). */
  capabilities?: Record<string, boolean>;
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export type DeltaAction = 'add' | 'remove' | 'change';

export interface Delta<T = unknown> {
  type: string;
  action: DeltaAction;
  previous: T | null;
  next: T | null;
}

export interface SemanticViewState {
  mark: string | null;
  key: string | string[] | null;
  semanticKey: SemanticKey | null;
  encoding: EncodingSpec;
  filters: FilterSpec[];
  nonFilterTransforms: TransformSpec[];
  selection: SelectionSpec | null;
  scopes: ViewScopes;
  axis: AxisSpec | null;
  detail: DetailSpec | null;
}

export interface SemanticDiffResult {
  previous: SemanticViewState;
  next: SemanticViewState;
  deltas: Delta[];
  has(type: string, action?: DeltaAction | null): boolean;
  get<T = unknown>(type: string): Delta<T> | null;
}

export interface DiffResult {
  changed: string[];
  has(key: string): boolean;
  deltas: Delta[];
  delta<T = unknown>(type: string): Delta<T> | null;
  hasDelta(type: string, action?: DeltaAction | null): boolean;
  semantic: SemanticDiffResult;
  previous: SemanticViewState;
  next: SemanticViewState;
  /** Data-level mark correspondence when both endpoints have inline data. */
  lineage?: import('../data/lineage.js').LineageCorrespondence;
}

// ─── Transition planning ──────────────────────────────────────────────────────

export type ChartPart = 'x' | 'y' | 'view' | 'marks';
export type TransitionChange = 'scale' | 'axis' | 'marks' | 'enter' | 'exit';

export interface TransitionMatch {
  mode: string;
  reason: string;
}

export interface TransitionStep {
  /** Built-in Core part, or a plain chart-plugin part such as "fall". */
  part?: ChartPart | (string & {});
  changes: Array<TransitionChange | (string & {})>;
}

export interface TransitionMotion {
  mode: string;
}

export interface TransitionPlanBaseline {
  name: string;
  anchor?: string;
  value?: number;
  meaning: string;
}

export interface TransitionItemAction {
  mode: string;
  reason: string;
  from?: string;
  to?: string;
  target?: string;
  source?: string;
  baseline?: TransitionPlanBaseline;
  parentKey?: string | null;
  childKey?: Array<string | null>;
  targetLayout?: BarLayout;
  sourceLayout?: BarLayout;
  sourceOrientation?: BarOrientation;
  categoryKey?: string | null;
  segmentKey?: string | null;
  valueKey?: string | null;
}

export interface TransitionPlanDiffEntry {
  type: string;
  action: DeltaAction;
  previous: unknown;
  next: unknown;
}

export interface TransitionPlan {
  diff?: TransitionPlanDiffEntry[];
  reason?: string;
  source?: { orientation: BarOrientation; layout: BarLayout; renderer: string };
  target?: { orientation: BarOrientation; layout: BarLayout; renderer: string };
  match?: TransitionMatch;
  motion?: TransitionMotion;
  enter?: TransitionItemAction;
  exit?: TransitionItemAction;
  steps?: TransitionStep[];
  timing?: TransitionSpec;
  totalDuration?: number;
  /** Datum-provenance correspondence shared by planning and rendering. */
  lineage?: import('../data/lineage.js').LineageCorrespondence;
}

// ─── Chart type ───────────────────────────────────────────────────────────────

export type DataRow = Record<string, unknown>;

export interface ChartContext {
  g: unknown;
  scene: unknown;
  transition: unknown;
  transitionPlan?: TransitionPlan;
  scales?: unknown;
  channels?: EncodingSpec;
  position?: unknown;
  [key: string]: unknown;
}

export interface TooltipContext {
  show(content: string | HTMLElement, options?: Record<string, unknown>): void;
  hide(): void;
  [key: string]: unknown;
}

export type D3Lib = Record<string, unknown>;

export type Renderer<S extends ViewSpec = ViewSpec> = (
  chart: ChartContext,
  rows: DataRow[],
  spec: S,
  tooltip: TooltipContext,
  d3: D3Lib
) => void;

export type StateOperations = Record<string, string>;

export interface IntermediateSpec<S extends ViewSpec = ViewSpec> {
  spec: S;
  scene: string;
}

export interface CanonicalTransitionPair<S extends ViewSpec = ViewSpec> {
  from: S;
  to: S;
  /** Map authored progress p to canonical progress 1 - p. */
  reverse: boolean;
}

export interface CompilerContext {
  [key: string]: unknown;
}

export interface SpecCompiler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base(spec: ViewSpec, context: Record<string, unknown>): ViewSpec;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operations: Record<string, (spec: ViewSpec, operationSpec: any, context: Record<string, unknown>) => ViewSpec>;
}

export interface ChartDeps {
  chartStyle?: import('../charts/style.js').ChartStyleModule;
  drawGrid?: (chart: ChartContext, scale: unknown, d3: D3Lib, transition?: unknown, options?: Record<string, unknown>) => void;
  drawXAxis?: (chart: ChartContext, scale: unknown, title: string | undefined, d3: D3Lib, transition?: unknown, options?: Record<string, unknown>) => void;
  drawYAxis?: (chart: ChartContext, scale: unknown, title: string | undefined, d3: D3Lib, transition?: unknown, options?: Record<string, unknown>) => void;
  drawLegend?: (chart: ChartContext, rows: DataRow[], colorSpec: ChannelSpec | undefined, d3: D3Lib) => void;
  fadeNonBarShapes?: (chart: ChartContext) => void;
  [key: string]: unknown;
}

export interface ChartType<S extends ViewSpec = ViewSpec> {
  key: string;
  /** Opt in only when all animated SVG properties can be captured and sought. */
  transitionEvaluation?: 'cached' | 'reconstruct';
  renderer: Renderer<S>;
  prepareSpec(spec: S): S;
  resolveTransitionPlan(prev: S | null, next: S | null): TransitionPlan;
  /**
   * Optionally compile opposite authored directions as one reversible path.
   * The public transition still exposes the endpoints in authored order.
   */
  canonicalTransitionPair?(prev: S, next: S): CanonicalTransitionPair<S>;
  intermediateSpecs?(prev: S, next: S): IntermediateSpec<S>[];
  defaultMargin(spec: S): Partial<MarginSpec>;
  readonly scenes: readonly string[];
  readonly stateOperations: StateOperations;
  inspect?: Record<string, unknown>;
  createSpecCompiler?: (context: CompilerContext) => SpecCompiler;
}

export interface ChartPlugin<S extends ViewSpec = ViewSpec> {
  key: string;
  readonly scenes: readonly string[];
  readonly stateOperations: StateOperations;
  createChartType(deps: ChartDeps): ChartType<S>;
  createSpecCompiler?: (context: CompilerContext) => SpecCompiler;
}

// ─── Actions & Events ─────────────────────────────────────────────────────────

// ─── Runtime ─────────────────────────────────────────────────────────────────

export type Target = string | Element;
export type AnyRecord = Record<string, any>;

export interface RuntimeOptions {
  target?: Target;
  /** Uses VisDelta's bundled runtime unless an embedding host overrides it. */
  d3?: D3Lib;
  aq?: Record<string, unknown>;
  debug?: boolean;
  /** Structural chart presentation; CSS can target its generated style class. */
  chartStyle?: import('../charts/style.js').ChartStyleModule;
}
