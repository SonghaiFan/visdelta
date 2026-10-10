import { UNIT_DEFAULTS } from './defaults.js';
import { bandOrLinear, position } from '../../toolkit/scales.js';
import { keyFirstTravelMatching } from '../../toolkit/matching.js';
import { matchesSelection, viewHighlight } from '../../focus.js';
import { diffViewStates } from '../../grammar/diff.js';
import { specObjectKey, specUnit } from '../../spec-meta.js';
import type { RenderChannel, RenderDatum, RuntimeScale } from '../../runtime/render-types.js';
import { max } from 'd3-array';
import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';
import { scaleBand } from 'd3-scale';
import type {
  CanonicalTransitionPair,
  ChannelSpec,
  ChartContext,
  TransitionPlan,
  ViewSpec
} from '../../types/index.js';

const UNIT_LAYOUT_ORDER = ['grid', 'force', 'bar', 'beeswarm'];
const VIEW_STAGE_RATIO = 0.28;
const TRAVEL_STAGE_RATIO = 0.18;
const MOVE_ACROSS_STAGE_RATIO = 0.24;
const FALL_STAGGER_RATIO = 0.10;
const FALL_STAGE_RATIO = 0.38;
const FORCE_TICK_COUNT = 180;
const FORCE_ALPHA_START = 0.4;
const FORCE_ALPHA_MIN = 0.1;
interface ForceEndpointCache {
  radius: number;
  endpoints: Map<string, Point>;
}
const forceLayoutCache = new WeakMap<SVGGElement, Map<string, ForceEndpointCache>>();
const FORCE_ENDPOINT_EPSILON = 1e-5;


// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** One countable circle expanded from a source row. */
export interface UnitDatum extends RenderDatum {
  __row: RenderDatum;
  __unitIndex: number;
  __rowIndex: number;
  __parentKey: string;
  __unitValue: number;
  __valueStart: number;
  __valueEnd: number;
  __unitKey: string;
  /** Filled in by matching. */
  __semanticUnitKey?: string;
  __joinKey?: string;
  __sourceUnitKey?: string | null;
  __travelDistance?: number;
  __matchedBy?: string;
  /** Filled in by a unit-value split. */
  __targetIndex?: number;
  __lineageSourceKey?: string;
  __lineageAnchor?: Point;
}

export interface UnitAxis {
  scale: RuntimeScale;
  channel: ChannelSpec;
}

export type UnitLayoutName = 'grid' | 'bar' | 'beeswarm' | 'force';

/** Where every unit sits, plus the axes the layout owns. */
export interface UnitLayoutResult {
  name: UnitLayoutName;
  /** Force layouts expose both anchor axes; others expose at most one. */
  axes: boolean | { x: UnitAxis | null; y: UnitAxis | null };
  axis: UnitAxis | null;
  r: number;
  groupField?: string | null;
  x(unit: UnitDatum, index: number): number;
  y(unit: UnitDatum, index: number): number;
  /** Force layouts record the simulated path of each unit. */
  trajectory?(unit: UnitDatum): Point[] | undefined;
  trajectoryTimeline?: number[];
}



export interface UnitMatchResult {
  units: UnitDatum[];
  maxDistance: number;
  totalDistance: number;
}

export interface UnitStageTiming {
  viewDuration: number;
  travelDelay: number;
  markDuration: number;
  moveAcrossDuration?: number;
}

/** Unit-specific plan fields read by the renderer. */
export interface UnitTransitionPlanExtension {
  match?: { mode: string; reason: string };
  motion?: { mode: string };
  detailChange?: {
    mode: 'split';
    parent: string;
    summaryUnitValue: number;
    detailUnitValue: number;
  };
}

export type UnitTransitionPlan = TransitionPlan & UnitTransitionPlanExtension;

function unitTransitionPlan(chart: Pick<ChartContext, 'transitionPlan'>): UnitTransitionPlan | undefined {
  return chart.transitionPlan as UnitTransitionPlan | undefined;
}

interface UnitSpecMeta {
  value?: string;
  key?: string;
  unitValue?: number;
  maxUnits?: number;
  layout?: string;
  columns?: number;
  radius?: number;
  group?: string;
}

interface UnitNode extends Element {
  __data__?: Partial<UnitDatum>;
  dataset: DOMStringMap;
}

interface ForceNode extends Point {
  unit: UnitDatum;
  vx: number;
  vy: number;
}

interface ForceResolution {
  nodes: ForceNode[];
  trajectories: Map<string, Point[]>;
  cumulativeMotion: number[];
}

interface DodgeCircle {
  x: number;
  y: number;
  data: UnitDatum;
  next: DodgeCircle | null;
}

// ─── Units and layouts ───────────────────────────────────────────────────────

function unitMeta(spec: ViewSpec): UnitSpecMeta {
  return (specUnit(spec) || {}) as UnitSpecMeta;
}

export function expandUnits(rows: RenderDatum[], spec: ViewSpec): UnitDatum[] {
  const unit = unitMeta(spec);
  const valueKey = unit.value;
  // An array object key reads as its joined string, exactly as a JS property lookup would.
  const rowKey = String(unit.key || specObjectKey(spec) || 'id');
  const unitValue = positiveNumber(unit.unitValue, UNIT_DEFAULTS.unitValue);
  const maxUnits = positiveInteger(unit.maxUnits, UNIT_DEFAULTS.maxUnits);
  const units: UnitDatum[] = [];

  rows.forEach((row, rowIndex) => {
    const rawCount = valueKey ? Number(row[valueKey]) : 1;
    const quantity = Math.max(0, Number.isFinite(rawCount) ? rawCount : 0);
    // A positive remainder receives a circle so the displayed units never
    // understate the source quantity (e.g. 51 at 10 per circle becomes 6).
    const count = Math.ceil(quantity / unitValue);
    const parentKey = String(row[rowKey] ?? rowIndex);
    for (let unitIndex = 0; unitIndex < count; unitIndex++) {
      units.push({
        ...row,
        __row: row,
        __unitIndex: unitIndex,
        __rowIndex: rowIndex,
        __parentKey: parentKey,
        __unitValue: unitValue,
        __valueStart: unitIndex * unitValue,
        __valueEnd: Math.min(quantity, (unitIndex + 1) * unitValue),
        __unitKey: `${parentKey}\u0000${unitIndex}`
      });
    }
  });

  return units.slice(0, maxUnits);
}

export function unitLayout(units: UnitDatum[], chart: ChartContext, spec: ViewSpec): UnitLayoutResult {
  const unit = unitMeta(spec);
  const layout = unit.layout || UNIT_DEFAULTS.layout;
  const columns = positiveInteger(unit.columns, Math.max(8, Math.floor(Math.sqrt(units.length) * 1.4)));
  const requestedRadius = positiveNumber(unit.radius, 12);
  const xChannel = spec.encoding?.x || null;
  const yChannel = spec.encoding?.y || null;
  const groupKey = unit.group || null;
  const xKey = xChannel?.field;

  if (layout === 'force') {
    return forceLayout(units, chart, requestedRadius, xChannel, yChannel);
  }

  if (layout === 'beeswarm') {
    if (!xKey || !xChannel) throw new Error('Unit beeswarm layout requires an x field.');
    let radius = fitRadius(chart, requestedRadius, {
      columns: Math.max(uniqueCount(units, (d) => d.__row[xKey]), 1), rows: 1
    });
    const x = unitXScale(units, xChannel, [radius, chart.innerWidth - radius]);
    const placed = dodgeForHeight(units, radius, chart.innerHeight, (d) => position(x, d.__row[xKey]));
    radius = placed.radius;
    const yByKey = new Map(placed.circles.map((circle) => [circle.data.__unitKey, circle.y] as const));
    return {
      name: 'beeswarm', axes: true, r: radius,
      axis: { scale: x, channel: { ...xChannel, title: xChannel.title || xKey } },
      x: (d) => position(x, d.__row[xKey]),
      y: (d) => chart.innerHeight - radius - (yByKey.get(d.__unitKey) ?? 0)
    };
  }

  if (layout === 'bar') {
    if (!groupKey) throw new Error('Unit bar layout requires .group("field").');
    const groups = Array.from(new Set(units.map((d) => d.__row[groupKey]))) as string[];
    const groupBand = scaleBand().domain(groups).range([0, chart.innerWidth]).padding(0.18);
    const groupScale = groupBand as unknown as RuntimeScale;
    const groupCounts = countBy(units, (d) => d.__row[groupKey]);
    const radius = fitGroupedRadius(chart, requestedRadius, groupBand.bandwidth(), max(groupCounts.values()) || 1, columns);
    const cell = radius * 2.45;
    const groupColumns = Math.max(1, Math.min(columns, Math.floor(groupBand.bandwidth() / cell) || 1));
    const stackByGroup = stackIndex(units, (d) => d.__row[groupKey]);
    const groupStart = (group: unknown) => {
      const count = groupCounts.get(group) || 1;
      const usedColumns = Math.min(groupColumns, count);
      const usedWidth = (usedColumns - 1) * cell;
      return (groupBand(group as string) ?? 0) + (groupBand.bandwidth() - usedWidth) / 2;
    };
    return {
      name: 'bar', axes: true, r: radius, groupField: groupKey,
      axis: { scale: groupScale, channel: { field: groupKey, title: groupKey, type: 'nominal' } },
      x: (d) => groupStart(d.__row[groupKey]) + (stackByGroup(d) % groupColumns) * cell,
      y: (d) => chart.innerHeight - radius - Math.floor(stackByGroup(d) / groupColumns) * cell
    };
  }

  if (layout !== 'grid') throw new Error(`Unsupported Unit layout: ${layout}.`);

  const rowsNeeded = Math.ceil(units.length / columns);
  const radius = fitRadius(chart, requestedRadius, { columns, rows: rowsNeeded });
  const cell = radius * 2.45;
  const startX = Math.max(0, (chart.innerWidth - columns * cell) / 2);
  const startY = Math.max(0, (chart.innerHeight - rowsNeeded * cell) / 2);
  return {
    name: 'grid', axes: false, axis: null, r: radius,
    x: (_, i) => startX + (i % columns) * cell + radius,
    y: (_, i) => startY + Math.floor(i / columns) * cell + radius
  };
}

export function unitSelectionOpacity(unit: UnitDatum, spec: ViewSpec, dimOpacity = 0.22): number {
  const selection = viewHighlight(spec);
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(unit.__row || unit, selection)
    ? 1
    : Number(selection.opacity ?? dimOpacity);
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** Preserve keyed units, then minimize travel for the remaining slots. */
export function matchUnitSlotsByIdentityAndTravel(chart: ChartContext, units: UnitDatum[], layout: UnitLayoutResult): UnitMatchResult {
  if (unitTransitionPlan(chart)?.match?.mode !== 'key-first-travel') {
    return { units, maxDistance: 0, totalDistance: 0 };
  }
  const sourceNodes = chart.g.selectAll<UnitNode, unknown>('circle.vd-unit').nodes();
  const sources = sourceNodes.map((node, index) => ({
    index,
    key: String(node.dataset.key ?? node.__data__?.__semanticUnitKey ?? node.__data__?.__unitKey ?? index),
    joinKey: String(unitJoinKey(node.__data__) ?? node.dataset.sourceKey ?? node.dataset.key ?? index),
    x: finiteNumber(node.getAttribute('cx')),
    y: finiteNumber(node.getAttribute('cy'))
  })).filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
  const targets = units.map((unit, index) => ({
    index,
    key: String(unit.__semanticUnitKey ?? unit.__unitKey),
    x: finiteNumber(layout.x(unit, index)),
    y: finiteNumber(layout.y(unit, index))
  }));
  const pairs = keyFirstTravelMatching(sources, targets);
  const pairByTarget = new Map(pairs.map((pair) => [pair.targetIndex, pair] as const));
  const matchedSourceKeys = new Set(pairs.map((pair) => sources[pair.sourceIndex].joinKey));
  const rematched = units.map((unit, targetIndex): UnitDatum => {
    const pair = pairByTarget.get(targetIndex);
    const source = pair ? sources[pair.sourceIndex] : null;
    const semanticKey = String(unit.__semanticUnitKey ?? unit.__unitKey);
    return {
      ...unit,
      __semanticUnitKey: semanticKey,
      __joinKey: source
        ? source.joinKey
        : uniqueEnterKey(semanticKey, targetIndex, matchedSourceKeys),
      __sourceUnitKey: source?.key ?? null,
      __travelDistance: pair?.distance ?? 0,
      __matchedBy: pair?.matchedBy ?? 'enter'
    };
  });
  return {
    units: rematched,
    maxDistance: pairs.reduce((max, pair) => Math.max(max, pair.distance), 0),
    totalDistance: pairs.reduce((sum, pair) => sum + pair.distance, 0)
  };
}

// ─── Transition planning ─────────────────────────────────────────────────────

export function resolveUnitTransitionPlan(previousSpec: ViewSpec | null, nextSpec: ViewSpec | null): UnitTransitionPlan {
  if (!previousSpec || !nextSpec) return {};
  const diff = diffViewStates(previousSpec, nextSpec);
  const unitValueChanged = unitValueForSpec(previousSpec) !== unitValueForSpec(nextSpec);
  const positionChanged = unitPositionSignature(previousSpec) !== unitPositionSignature(nextSpec)
    || ['data', 'filter', 'transform', 'encoding.x'].some((type) => diff.hasDelta(type));
  const plan: UnitTransitionPlan = {
    reason: unitValueChanged ? 'unit-value-split' : positionChanged ? 'unit-key-first-layout' : 'unit-default-plan',
  };
  if (!positionChanged) return plan;
  const nextLayout = unitMeta(nextSpec).layout || UNIT_DEFAULTS.layout;
  const fallsToAxis = ['bar', 'beeswarm'].includes(nextLayout);
  return {
    ...plan,
    match: { mode: 'key-first-travel', reason: 'same-key-first-then-closest-unmatched-unit' },
    ...(unitValueChanged ? {
      detailChange: {
        mode: 'split' as const,
        parent: 'source-row',
        summaryUnitValue: unitValueForSpec(previousSpec),
        detailUnitValue: unitValueForSpec(nextSpec)
      }
    } : {}),
    ...(fallsToAxis ? { motion: { mode: 'move-across-then-fall' } } : {}),
    steps: fallsToAxis
      ? [
          { part: 'view', changes: ['scale', 'axis'] },
          { part: 'move-across', changes: ['marks.x'] },
          { part: 'fall', changes: ['marks.y', 'exit', 'enter'] }
        ]
      : [
          { part: 'view', changes: ['scale', 'axis'] },
          { part: 'marks', changes: ['marks', 'exit', 'enter'] }
        ]
  };
}

/** Evaluate either authored direction on one deterministic cached path. */
export function canonicalUnitTransitionPair<S extends ViewSpec>(previousSpec: S, nextSpec: S): CanonicalTransitionPair<S> {
  const previousUnitValue = unitValueForSpec(previousSpec);
  const nextUnitValue = unitValueForSpec(nextSpec);
  // A larger value-per-circle is the summary. Always render summary -> detail
  // and evaluate the exact cached path backward for detail -> summary.
  if (previousUnitValue !== nextUnitValue) {
    if (previousUnitValue > nextUnitValue) {
      return { from: previousSpec, to: nextSpec, reverse: false };
    }
    return { from: nextSpec, to: previousSpec, reverse: true };
  }
  const previousOrder = canonicalUnitOrder(previousSpec);
  const nextOrder = canonicalUnitOrder(nextSpec);
  if (previousOrder <= nextOrder) return { from: previousSpec, to: nextSpec, reverse: false };
  return { from: nextSpec, to: previousSpec, reverse: true };
}

export function unitStageTiming(chart: ChartContext): UnitStageTiming | null {
  if (unitTransitionPlan(chart)?.match?.mode !== 'key-first-travel') return null;
  const total = Math.max(1, Number(chart.transition.duration) || 900);
  if (unitTransitionPlan(chart)?.motion?.mode === 'move-across-then-fall') {
    return {
      viewDuration: total * VIEW_STAGE_RATIO,
      moveAcrossDuration: total * MOVE_ACROSS_STAGE_RATIO,
      travelDelay: total * FALL_STAGGER_RATIO,
      markDuration: total * FALL_STAGE_RATIO
    };
  }
  return {
    viewDuration: total * VIEW_STAGE_RATIO,
    travelDelay: total * TRAVEL_STAGE_RATIO,
    markDuration: total * (1 - VIEW_STAGE_RATIO - TRAVEL_STAGE_RATIO)
  };
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function unitXScale(
  units: UnitDatum[],
  channel: ChannelSpec,
  range: [number, number],
  options: { anchors?: boolean } = {}
): RuntimeScale {
  const rows = units.map((d) => d.__row);
  // Force positions are collection anchors. Beeswarm remains a quantitative
  // positional distribution and therefore retains its authored scale type.
  const resolved: RenderChannel = options.anchors ? { ...channel, type: 'nominal' } : channel;
  return bandOrLinear(rows, resolved, range);
}

function fitRadius(chart: ChartContext, requestedRadius: number, { columns = 1, rows = 1 }: { columns?: number; rows?: number } = {}): number {
  return Math.max(2, Math.min(requestedRadius,
    chart.innerWidth / Math.max(columns * 2.45, 1),
    chart.innerHeight / Math.max(rows * 2.45, 1)
  ));
}

/** Record a deterministic D3 force trajectory from the current mark positions. */
function forceLayout(
  units: UnitDatum[],
  chart: ChartContext,
  requestedRadius: number,
  xChannel: ChannelSpec | null,
  yChannel: ChannelSpec | null
): UnitLayoutResult {
  if (!units.length) {
    return {
      name: 'force', axes: false, axis: null, r: requestedRadius,
      x: () => chart.innerWidth / 2,
      y: () => chart.innerHeight / 2,
      trajectory: () => [{ x: chart.innerWidth / 2, y: chart.innerHeight / 2 }],
      trajectoryTimeline: [0]
    };
  }

  const initialRadius = fitForceRadius(chart, requestedRadius, units.length);
  const centerX = chart.innerWidth / 2;
  const centerY = chart.innerHeight / 2;
  const xField = xChannel?.field;
  const yField = yChannel?.field;
  const layoutDescriptor = JSON.stringify({
    width: chart.innerWidth,
    height: chart.innerHeight,
    initialRadius,
    xChannel,
    yChannel,
    xField,
    yField,
    units: units.map((unit) => [
      unit.__unitKey,
      xField ? forceValueSignature(unit.__row[xField]) : null,
      yField ? forceValueSignature(unit.__row[yField]) : null
    ])
  });
  const host = chart.g.node();
  const cachedLayouts = host ? forceLayoutCache.get(host) : undefined;
  const cachedLayout = cachedLayouts?.get(layoutDescriptor);
  let radius = cachedLayout?.radius ?? initialRadius;
  let xScale = xChannel && xField
    ? unitXScale(units, xChannel, [radius, chart.innerWidth - radius], { anchors: true })
    : null;
  let yScale = yChannel && yField
    ? unitXScale(units, yChannel, [chart.innerHeight - radius, radius], { anchors: true })
    : null;
  let axes = {
    x: forceAxis(xScale, xChannel),
    y: forceAxis(yScale, yChannel)
  };
  const existing = new Map(chart.g.selectAll<UnitNode, unknown>('circle.vd-unit').nodes().map((node) => [
    String(node.dataset.key ?? node.__data__?.__semanticUnitKey ?? node.__data__?.__unitKey),
    { x: finiteNumber(node.getAttribute('cx')), y: finiteNumber(node.getAttribute('cy')), r: finiteNumber(node.getAttribute('r')) }
  ] as const));
  const isTransitionTarget = unitTransitionPlan(chart)?.match?.mode === 'key-first-travel';
  const existingEndpoint = units.map((unit) => [
    unit.__unitKey,
    existing.get(String(unit.__semanticUnitKey ?? unit.__unitKey))
  ] as const);

  // A reverse leg can end at its canonical source. Keep both endpoints on
  // this host; the clean endpoint render must not reheat an already solved
  // state. Matching descriptor alone is insufficient after another layout.
  const matchesEndpoint = cachedLayout && existing.size === units.length && existingEndpoint.every(([key, point]) => {
    const endpoint = cachedLayout.endpoints.get(key);
    return point && endpoint && Number.isFinite(point.x) && Number.isFinite(point.y)
      && Math.abs(point.x - endpoint.x) <= FORCE_ENDPOINT_EPSILON
      && Math.abs(point.y - endpoint.y) <= FORCE_ENDPOINT_EPSILON
      && Math.abs(point.r - cachedLayout.radius) <= FORCE_ENDPOINT_EPSILON;
  });
  if (!isTransitionTarget && matchesEndpoint) {
    const endpoint = (unit: UnitDatum) => cachedLayout.endpoints.get(unit.__unitKey) ?? { x: centerX, y: centerY };
    return {
      name: 'force', axes, axis: axes.x, r: radius,
      x: (unit) => endpoint(unit).x,
      y: (unit) => endpoint(unit).y,
      trajectory: (unit) => [endpoint(unit)],
      trajectoryTimeline: [0]
    };
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(units.length * chart.innerWidth / chart.innerHeight)));
  const rows = Math.max(1, Math.ceil(units.length / columns));
  const cell = radius * 2.45;
  const startX = centerX - ((columns - 1) * cell) / 2;
  const startY = centerY - ((rows - 1) * cell) / 2;
  const seeds = new Map(units.map((unit, index) => {
    const current = existing.get(String(unit.__semanticUnitKey ?? unit.__unitKey));
    const validCurrent = current && Number.isFinite(current.x) && Number.isFinite(current.y);
    const seed: Point = validCurrent ? current : {
      x: startX + (index % columns) * cell,
      y: startY + Math.floor(index / columns) * cell
    };
    return [unit.__unitKey, seed] as const;
  }));
  const orderedUnits = [...units]
    .sort((a, b) => String(a.__unitKey).localeCompare(String(b.__unitKey)));
  const resolveForce = (): ForceResolution => {
    const nodes: ForceNode[] = orderedUnits.map((unit) => ({
      unit, ...(seeds.get(unit.__unitKey) ?? { x: centerX, y: centerY }), vx: 0, vy: 0
    }));
    const trajectories = new Map<string, Point[]>(nodes.map((node) => [
      node.unit.__unitKey,
      [{ x: node.x, y: node.y }]
    ]));
    const targetXScale = xScale;
    const targetYScale = yScale;
    const targetX = targetXScale && xField
      ? (node: ForceNode) => position(targetXScale, node.unit.__row[xField])
      : centerX;
    const targetY = targetYScale && yField
      ? (node: ForceNode) => position(targetYScale, node.unit.__row[yField])
      : centerY;
    const simulation = forceSimulation<ForceNode>(nodes)
      .force('x', forceX<ForceNode>(targetX).strength(0.2))
      .force('y', forceY<ForceNode>(targetY).strength(0.2))
      .force('collide', forceCollide<ForceNode>(radius * 1.12).strength(1).iterations(10))
      .alpha(FORCE_ALPHA_START)
      .alphaMin(FORCE_ALPHA_MIN)
      .alphaDecay(1 - Math.pow(
        FORCE_ALPHA_MIN / FORCE_ALPHA_START,
        1 / FORCE_TICK_COUNT
      ))
      .stop();
    const cumulativeMotion = [0];
    for (let tick = 0; tick < FORCE_TICK_COUNT; tick++) {
      const previous = nodes.map((node) => ({ x: node.x, y: node.y }));
      simulation.tick();
      let squaredMotion = 0;
      for (const node of nodes) {
        trajectories.get(node.unit.__unitKey)?.push({ x: node.x, y: node.y });
      }
      nodes.forEach((node, index) => {
        squaredMotion += (node.x - previous[index].x) ** 2 + (node.y - previous[index].y) ** 2;
      });
      cumulativeMotion.push(
        cumulativeMotion[cumulativeMotion.length - 1] + Math.sqrt(squaredMotion / nodes.length)
      );
    }
    simulation.stop();
    return { nodes, trajectories, cumulativeMotion };
  };

  let resolved = resolveForce();
  let finalOverflow = forceOverflow(resolved.nodes, radius, chart.innerWidth, chart.innerHeight);
  for (let pass = 0; pass < 24; pass++) {
    const overflowTotal = finalOverflow.left + finalOverflow.right + finalOverflow.top + finalOverflow.bottom;
    if (overflowTotal <= 1e-6) break;
    // Use the measured edge margin to reduce the common radius, then resolve
    // the anchors and collision distances together at that radius.
    const nextRadius = Math.max(2, Math.min(
      radius - finalOverflow.left,
      radius - finalOverflow.right,
      radius - finalOverflow.top,
      radius - finalOverflow.bottom
    ));
    if (nextRadius >= radius - 1e-8) break;
    radius = nextRadius;
    xScale = xChannel && xField
      ? unitXScale(units, xChannel, [radius, chart.innerWidth - radius], { anchors: true })
      : null;
    yScale = yChannel && yField
      ? unitXScale(units, yChannel, [chart.innerHeight - radius, radius], { anchors: true })
      : null;
    axes = {
      x: forceAxis(xScale, xChannel),
      y: forceAxis(yScale, yChannel)
    };
    resolved = resolveForce();
    finalOverflow = forceOverflow(resolved.nodes, radius, chart.innerWidth, chart.innerHeight);
  }
  const { nodes, trajectories, cumulativeMotion } = resolved;
  const endpoints = new Map(nodes.map((node) => [node.unit.__unitKey, { x: node.x, y: node.y }] as const));
  const endpoint = (unit: UnitDatum) => endpoints.get(unit.__unitKey) ?? { x: centerX, y: centerY };
  const totalMotion = cumulativeMotion[cumulativeMotion.length - 1];
  const trajectoryTimeline = totalMotion > Number.EPSILON
    ? cumulativeMotion.map((motion) => motion / totalMotion)
    : cumulativeMotion.map((_, index) => index / Math.max(1, cumulativeMotion.length - 1));

  if (host && finalOverflow.left + finalOverflow.right + finalOverflow.top + finalOverflow.bottom <= 1e-6) {
    const cache = cachedLayouts ?? new Map<string, ForceEndpointCache>();
    cache.delete(layoutDescriptor);
    cache.set(layoutDescriptor, { radius, endpoints });
    while (cache.size > 2) cache.delete(cache.keys().next().value!);
    forceLayoutCache.set(host, cache);
  } else if (host) {
    cachedLayouts?.delete(layoutDescriptor);
  }

  return {
    name: 'force', axes, axis: axes.x, r: radius,
    x: (unit) => endpoint(unit).x,
    y: (unit) => endpoint(unit).y,
    trajectory: (unit) => trajectories.get(unit.__unitKey),
    trajectoryTimeline
  };
}

function forceOverflow(nodes: Point[], radius: number, width: number, height: number) {
  return {
    left: Math.max(0, -Math.min(...nodes.map((node) => node.x - radius))),
    right: Math.max(0, Math.max(...nodes.map((node) => node.x + radius)) - width),
    top: Math.max(0, -Math.min(...nodes.map((node) => node.y - radius))),
    bottom: Math.max(0, Math.max(...nodes.map((node) => node.y + radius)) - height)
  };
}

function forceAxis(scale: RuntimeScale | null, channel: ChannelSpec | null): UnitAxis | null {
  if (!scale || !channel?.field) return null;
  return {
    scale,
    channel: { ...channel, title: channel.title || channel.field }
  };
}

function fitForceRadius(chart: ChartContext, requestedRadius: number, count: number): number {
  const areaRadius = Math.sqrt(
    (chart.innerWidth * chart.innerHeight * 0.62) / Math.max(count * Math.PI, 1)
  );
  return Math.max(2, Math.min(requestedRadius, areaRadius));
}

function fitGroupedRadius(chart: ChartContext, requestedRadius: number, groupWidth: number, maxGroupCount: number, columns: number): number {
  let radius = Math.min(requestedRadius, groupWidth / 3 / 2.45);
  for (let i = 0; i < 5; i++) {
    const groupColumns = Math.max(1, columns);
    const groupRows = Math.max(1, Math.ceil(maxGroupCount / groupColumns));
    radius = Math.min(requestedRadius,
      groupWidth / Math.max(groupColumns * 2.45, 1),
      chart.innerHeight / Math.max(groupRows * 2.45, 1));
  }
  return Math.max(2, radius);
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function stackIndex(values: UnitDatum[], group: (value: UnitDatum) => unknown): (value: UnitDatum) => number {
  const counts = new Map<unknown, number>();
  const indexes = new Map<string, number>();
  values.forEach((value) => {
    const key = group(value);
    const index = counts.get(key) || 0;
    counts.set(key, index + 1);
    indexes.set(value.__unitKey, index);
  });
  return (value) => indexes.get(value.__unitKey) || 0;
}

function uniqueCount(values: UnitDatum[], key: (value: UnitDatum) => unknown): number {
  return new Set(values.map(key)).size;
}

function countBy(values: UnitDatum[], key: (value: UnitDatum) => unknown): Map<unknown, number> {
  const counts = new Map<unknown, number>();
  values.forEach((value) => {
    const group = key(value);
    counts.set(group, (counts.get(group) || 0) + 1);
  });
  return counts;
}

function finiteNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function unitJoinKey(unit: Partial<UnitDatum> | undefined): string | undefined {
  return unit?.__joinKey ?? unit?.__unitKey;
}

function uniqueEnterKey(semanticKey: string, targetIndex: number, used: Set<string>): string {
  let key = `\u0001enter\u0000${semanticKey}\u0000${targetIndex}`;
  while (used.has(key)) key += '\u0000';
  used.add(key);
  return key;
}

function unitPositionSignature(spec: ViewSpec): string {
  const unit = unitMeta(spec);
  return stableStringify({
    layout: unit.layout || UNIT_DEFAULTS.layout,
    columns: unit.columns ?? null,
    radius: unit.radius ?? null,
    group: unit.group ?? null,
    value: unit.value ?? null,
    unitValue: unitValueForSpec(spec),
    maxUnits: unit.maxUnits ?? UNIT_DEFAULTS.maxUnits,
    x: spec.encoding?.x ?? null,
    y: spec.encoding?.y ?? null
  });
}

function unitValueForSpec(spec: ViewSpec): number {
  return positiveNumber(unitMeta(spec).unitValue, UNIT_DEFAULTS.unitValue);
}

function canonicalUnitOrder(spec: ViewSpec): string {
  const unit = unitMeta(spec);
  const layoutRank = UNIT_LAYOUT_ORDER.indexOf(unit.layout || UNIT_DEFAULTS.layout);
  return `${String(layoutRank < 0 ? UNIT_LAYOUT_ORDER.length : layoutRank).padStart(2, '0')}|${stableStringify(spec)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function forceValueSignature(value: unknown): unknown {
  if (value instanceof Date) return ['date', value.getTime()];
  if (value === null) return ['null'];
  const type = typeof value;
  if (type === 'undefined') return ['undefined'];
  if (type === 'number') {
    const number = value as number;
    return ['number', Number.isFinite(number) ? number : String(number)];
  }
  if (type === 'string' || type === 'boolean') return [type, value];
  if (Array.isArray(value)) return ['array', value.map(forceValueSignature)];
  return ['object', stableStringify(value)];
}

function dodgeForHeight(
  units: UnitDatum[],
  radius: number,
  height: number,
  x: (d: UnitDatum) => number
): { circles: DodgeCircle[]; radius: number } {
  let fittedRadius = radius;
  let placed = dodge(units, { radius: fittedRadius * 2.15, x });
  while (fittedRadius > 2 && maxPlacedY(placed) > height - fittedRadius * 2) {
    fittedRadius -= 0.75;
    placed = dodge(units, { radius: fittedRadius * 2.15, x });
  }
  return { circles: placed, radius: Math.max(2, fittedRadius) };
}

function maxPlacedY(placed: DodgeCircle[]): number {
  return placed.reduce((max, circle) => Math.max(max, circle.y || 0), 0);
}

function dodge(data: UnitDatum[], { radius = 1, x }: { radius?: number; x: (d: UnitDatum) => number }): DodgeCircle[] {
  const radius2 = radius ** 2;
  const circles: DodgeCircle[] = data
    .map((datum) => ({ x: +x(datum), y: 0, data: datum, next: null }))
    .sort((a, b) => a.x - b.x);
  const epsilon = 1e-3;
  let head: DodgeCircle | null = null;
  let tail: DodgeCircle | null = null;

  function intersects(x: number, y: number): boolean {
    let a = head;
    while (a) {
      if (radius2 - epsilon > (a.x - x) ** 2 + (a.y - y) ** 2) return true;
      a = a.next;
    }
    return false;
  }

  for (const b of circles) {
    while (head && head.x < b.x - radius2) head = head.next;
    if (intersects(b.x, (b.y = 0))) {
      let a = head;
      b.y = Infinity;
      do {
        if (!a) break;
        const y = a.y + Math.sqrt(radius2 - (a.x - b.x) ** 2);
        if (y < b.y && !intersects(b.x, y)) b.y = y;
        a = a.next;
      } while (a);
    }
    b.next = null;
    if (head === null || tail === null) {
      head = tail = b;
    } else {
      tail.next = b;
      tail = b;
    }
  }

  return circles;
}
