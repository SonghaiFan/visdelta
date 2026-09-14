// @ts-nocheck — complex layout algorithms with D3-style scale patterns
import { matchesSelection, viewHighlight } from '../../focus.js';
import { diffViewStates } from '../../grammar/diff.js';
import { specObjectKey, specState, specTransition, specUnit } from '../../spec-meta.js';
import { defaultTransition } from '../../timing.js';

const UNIT_LAYOUT_ORDER = ['grid', 'force', 'bar', 'beeswarm'];
const VIEW_STAGE_RATIO = 0.28;
const TRAVEL_STAGE_RATIO = 0.18;
const MOVE_ACROSS_STAGE_RATIO = 0.24;
const FALL_STAGGER_RATIO = 0.10;
const FALL_STAGE_RATIO = 0.38;
const FORCE_TICK_COUNT = 180;
const FORCE_ALPHA_START = 0.4;
const FORCE_ALPHA_MIN = 0.1;

export function expandUnits(rows, spec, d3) {
  const unit = specUnit(spec) || {};
  const valueKey = unit.value;
  const rowKey = unit.key || specObjectKey(spec) || 'id';
  const unitValue = positiveNumber(unit.unitValue, 1);
  const maxUnits = positiveInteger(unit.maxUnits, 240);
  const units = [];

  rows.forEach((row, rowIndex) => {
    const rawCount = valueKey ? Number(row[valueKey]) : 1;
    const quantity = Math.max(0, Number.isFinite(rawCount) ? rawCount : 0);
    // A positive remainder receives a circle so the displayed units never
    // understate the source quantity (e.g. 51 at 10 per circle becomes 6).
    const count = Math.ceil(quantity / unitValue);
    Array.from({ length: count }, (_, unitIndex) => {
      units.push({
        ...row,
        __row: row,
        __unitIndex: unitIndex,
        __rowIndex: rowIndex,
        __parentKey: String(row[rowKey] ?? rowIndex),
        __unitValue: unitValue,
        __valueStart: unitIndex * unitValue,
        __valueEnd: Math.min(quantity, (unitIndex + 1) * unitValue),
        __unitKey: `${String(row[rowKey] ?? rowIndex)}\u0000${unitIndex}`
      });
    });
  });

  return units.slice(0, maxUnits);
}

export function unitLayout(units, chart, spec, deps) {
  const { bandOrLinear, d3, position } = deps;
  const unit = specUnit(spec) || {};
  const layout = unit.layout || 'grid';
  const columns = positiveInteger(unit.columns, Math.max(8, Math.floor(Math.sqrt(units.length) * 1.4)));
  const requestedRadius = positiveNumber(unit.radius, 12);
  const xChannel = spec.encoding?.x || null;
  const yChannel = spec.encoding?.y || null;
  const groupKey = unit.group || null;
  const xKey = xChannel?.field;

  if (layout === 'force') {
    return forceLayout(units, chart, requestedRadius, xChannel, yChannel, {
      bandOrLinear, d3, position
    });
  }

  if (layout === 'beeswarm') {
    if (!xKey) throw new Error('Unit beeswarm layout requires an x field.');
    let radius = fitRadius(chart, requestedRadius, {
      columns: Math.max(uniqueCount(units, (d) => d.__row[xKey]), 1), rows: 1
    });
    const x = unitXScale(units, xChannel, [radius, chart.innerWidth - radius], { bandOrLinear, d3 });
    let placed = dodgeForHeight(units, radius, chart.innerHeight, (d) => position(x, d.__row[xKey]));
    radius = placed.radius;
    const yByKey = new Map(placed.map((circle) => [circle.data.__unitKey, circle.y]));
    return {
      name: 'beeswarm', axes: true, r: radius,
      axis: { scale: x, channel: { ...xChannel, title: xChannel.title || xKey } },
      x: (d) => position(x, d.__row[xKey]),
      y: (d) => chart.innerHeight - radius - yByKey.get(d.__unitKey)
    };
  }

  if (layout === 'bar') {
    if (!groupKey) throw new Error('Unit bar layout requires .group("field").');
    const groups = Array.from(new Set(units.map((d) => d.__row[groupKey])));
    const groupScale = d3.scaleBand().domain(groups).range([0, chart.innerWidth]).padding(0.18);
    const groupCounts = countBy(units, (d) => d.__row[groupKey]);
    const radius = fitGroupedRadius(chart, requestedRadius, groupScale.bandwidth(), d3.max(groupCounts.values()) || 1, columns);
    const cell = radius * 2.45;
    const groupColumns = Math.max(1, Math.min(columns, Math.floor(groupScale.bandwidth() / cell) || 1));
    const stackByGroup = stackIndex(units, (d) => d.__row[groupKey]);
    const groupStart = (group) => {
      const count = groupCounts.get(group) || 1;
      const usedColumns = Math.min(groupColumns, count);
      const usedWidth = (usedColumns - 1) * cell;
      return groupScale(group) + (groupScale.bandwidth() - usedWidth) / 2;
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

export function unitSelectionOpacity(unit, spec, dimOpacity = 0.22) {
  const selection = viewHighlight(spec);
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(unit.__row || unit, selection)
    ? 1
    : Number(selection.opacity ?? dimOpacity);
}

/** Match the remaining identity-free units by the smallest total travel. */
export function minimumTravelMatching(sources, targets) {
  if (!sources.length || !targets.length) return [];
  const sourceIsRows = sources.length <= targets.length;
  const rows = sourceIsRows ? sources : targets;
  const columns = sourceIsRows ? targets : sources;
  const costs = rows.map((row) => columns.map((column) =>
    sourceIsRows ? travelDistance(row, column) : travelDistance(column, row)));
  const assignment = hungarian(costs);
  return assignment.map((columnIndex, rowIndex) => {
    const sourceIndex = sourceIsRows ? rowIndex : columnIndex;
    const targetIndex = sourceIsRows ? columnIndex : rowIndex;
    return {
      sourceIndex,
      targetIndex,
      distance: travelDistance(sources[sourceIndex], targets[targetIndex])
    };
  });
}

/**
 * Identity is the first constraint; distance is only the fallback. A source
 * and target with the same key stay paired even when another unit is closer.
 */
export function keyFirstTravelMatching(sources, targets) {
  const pairs = [];
  const usedSources = new Set();
  const usedTargets = new Set();
  const sourceByKey = new Map();

  sources.forEach((source, sourceIndex) => {
    if (source.key != null && !sourceByKey.has(String(source.key))) {
      sourceByKey.set(String(source.key), sourceIndex);
    }
  });
  targets.forEach((target, targetIndex) => {
    if (target.key == null) return;
    const sourceIndex = sourceByKey.get(String(target.key));
    if (sourceIndex == null || usedSources.has(sourceIndex)) return;
    usedSources.add(sourceIndex);
    usedTargets.add(targetIndex);
    pairs.push({
      sourceIndex,
      targetIndex,
      distance: travelDistance(sources[sourceIndex], target),
      matchedBy: 'key'
    });
  });

  const remainingSources = sources
    .map((source, sourceIndex) => ({ ...source, __sourceIndex: sourceIndex }))
    .filter((source) => !usedSources.has(source.__sourceIndex));
  const remainingTargets = targets
    .map((target, targetIndex) => ({ ...target, __targetIndex: targetIndex }))
    .filter((target) => !usedTargets.has(target.__targetIndex));
  minimumTravelMatching(remainingSources, remainingTargets).forEach((pair) => {
    pairs.push({
      sourceIndex: remainingSources[pair.sourceIndex].__sourceIndex,
      targetIndex: remainingTargets[pair.targetIndex].__targetIndex,
      distance: pair.distance,
      matchedBy: 'travel'
    });
  });
  return pairs.sort((a, b) => a.targetIndex - b.targetIndex);
}

export function matchUnitSlotsByIdentityAndTravel(chart, units, layout) {
  if (chart.transitionPlan?.match?.mode !== 'key-first-travel') {
    return { units, maxDistance: 0, totalDistance: 0 };
  }
  const sourceNodes = chart.g.selectAll('circle.vd-unit').nodes();
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
  const pairByTarget = new Map(pairs.map((pair) => [pair.targetIndex, pair]));
  const matchedSourceKeys = new Set(pairs.map((pair) => sources[pair.sourceIndex].joinKey));
  const rematched = units.map((unit, targetIndex) => {
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

export function resolveUnitTransitionPlan(previousSpec, nextSpec) {
  if (!previousSpec || !nextSpec) return {};
  const diff = diffViewStates(previousSpec, nextSpec);
  const unitValueChanged = unitValueForSpec(previousSpec) !== unitValueForSpec(nextSpec);
  const positionChanged = unitPositionSignature(previousSpec) !== unitPositionSignature(nextSpec)
    || ['data', 'filter', 'transform', 'encoding.x'].some((type) => diff.hasDelta(type));
  const timing = defaultTransition({
    ...specTransition(previousSpec),
    ...specTransition(nextSpec)
  });
  const plan = {
    diff: diff.deltas.map(({ type, action, previous, next }) => ({ type, action, previous, next })),
    reason: unitValueChanged ? 'unit-value-split' : positionChanged ? 'unit-key-first-layout' : 'unit-default-plan',
    timing,
    totalDuration: timing.duration
  };
  if (!positionChanged) return plan;
  const nextLayout = specUnit(nextSpec)?.layout || 'grid';
  const fallsToAxis = ['bar', 'beeswarm'].includes(nextLayout);
  return {
    ...plan,
    match: { mode: 'key-first-travel', reason: 'same-key-first-then-closest-unmatched-unit' },
    ...(unitValueChanged ? {
      detailChange: {
        mode: 'split',
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
export function canonicalUnitTransitionPair(previousSpec, nextSpec) {
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

export function unitStageTiming(chart) {
  if (chart.transitionPlan?.match?.mode !== 'key-first-travel') return null;
  const total = Math.max(1, Number(chart.transition.duration) || 900);
  if (chart.transitionPlan?.motion?.mode === 'move-across-then-fall') {
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

function unitXScale(units, channel, range, deps, options = {}) {
  const rows = units.map((d) => d.__row);
  // Force positions are collection anchors. Beeswarm remains a quantitative
  // positional distribution and therefore retains its authored scale type.
  const resolved = options.anchors ? { ...channel, type: 'nominal' } : channel;
  return deps.bandOrLinear(rows, resolved, range, deps.d3);
}

function fitRadius(chart, requestedRadius, { columns = 1, rows = 1 } = {}) {
  return Math.max(2, Math.min(requestedRadius,
    chart.innerWidth / Math.max(columns * 2.45, 1),
    chart.innerHeight / Math.max(rows * 2.45, 1)
  ));
}

/** Record a deterministic D3 force trajectory from the current mark positions. */
function forceLayout(units, chart, requestedRadius, xChannel, yChannel, deps) {
  const { bandOrLinear, d3, position } = deps;
  if (!units.length) {
    return {
      name: 'force', axes: false, axis: null, r: requestedRadius,
      x: () => chart.innerWidth / 2,
      y: () => chart.innerHeight / 2,
      trajectory: () => [{ x: chart.innerWidth / 2, y: chart.innerHeight / 2 }],
      trajectoryTimeline: [0]
    };
  }

  const radius = fitForceRadius(chart, requestedRadius, units.length);
  const centerX = chart.innerWidth / 2;
  const centerY = chart.innerHeight / 2;
  const xScale = xChannel?.field
    ? unitXScale(units, xChannel, [radius, chart.innerWidth - radius], { bandOrLinear, d3 }, { anchors: true })
    : null;
  const yScale = yChannel?.field
    ? unitXScale(units, yChannel, [chart.innerHeight - radius, radius], { bandOrLinear, d3 }, { anchors: true })
    : null;
  const axes = {
    x: forceAxis(xScale, xChannel),
    y: forceAxis(yScale, yChannel)
  };
  const existing = new Map(chart.g.selectAll('circle.vd-unit').nodes().map((node) => [
    String(node.dataset.key ?? node.__data__?.__semanticUnitKey ?? node.__data__?.__unitKey),
    { x: finiteNumber(node.getAttribute('cx')), y: finiteNumber(node.getAttribute('cy')) }
  ]));
  const existingEndpoint = units.map((unit) => [
    unit.__unitKey,
    existing.get(String(unit.__semanticUnitKey ?? unit.__unitKey))
  ]);
  const isTransitionTarget = chart.transitionPlan?.match?.mode === 'key-first-travel';

  // The cached transition surface renders the clean target once more at
  // progress 1. Keep an already-resolved force endpoint fixed instead of
  // reheating it and producing a last-frame jump.
  if (!isTransitionTarget && existingEndpoint.every(([, point]) =>
    point && Number.isFinite(point.x) && Number.isFinite(point.y))) {
    const endpoints = new Map(existingEndpoint);
    return {
      name: 'force', axes, axis: axes.x, r: radius,
      x: (unit) => endpoints.get(unit.__unitKey).x,
      y: (unit) => endpoints.get(unit.__unitKey).y,
      trajectory: (unit) => [endpoints.get(unit.__unitKey)],
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
    return [unit.__unitKey, validCurrent ? current : {
      x: startX + (index % columns) * cell,
      y: startY + Math.floor(index / columns) * cell
    }];
  }));
  const orderedUnits = [...units]
    .sort((a, b) => String(a.__unitKey).localeCompare(String(b.__unitKey)));
  const resolveForce = () => {
    const nodes = orderedUnits.map((unit) => ({
      unit, ...seeds.get(unit.__unitKey), vx: 0, vy: 0
    }));
    const trajectories = new Map(nodes.map((node) => [
      node.unit.__unitKey,
      [{ x: node.x, y: node.y }]
    ]));
    const targetX = xScale
      ? (node) => position(xScale, node.unit.__row[xChannel.field])
      : centerX;
    const targetY = yScale
      ? (node) => position(yScale, node.unit.__row[yChannel.field])
      : centerY;
    const simulation = d3.forceSimulation(nodes)
      .force('x', d3.forceX(targetX).strength(0.2))
      .force('y', d3.forceY(targetY).strength(0.2))
      .force('collide', d3.forceCollide(radius * 1.12).strength(1).iterations(10))
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
        trajectories.get(node.unit.__unitKey).push({ x: node.x, y: node.y });
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

  // The force result is the geometry ground truth. If a cluster crosses the
  // plot, move its discrete anchor range inward and resolve again; never scale
  // the circles or infer padding from row counts.
  let resolved;
  for (let pass = 0; pass < 4; pass++) {
    resolved = resolveForce();
    const overflow = forceOverflow(
      resolved.nodes, radius, chart.innerWidth, chart.innerHeight
    );
    const changedX = pass < 3 && xScale && insetScaleRange(xScale, overflow.left, overflow.right);
    const changedY = pass < 3 && yScale && insetScaleRange(yScale, overflow.top, overflow.bottom);
    if (!changedX && !changedY) break;
  }
  const { nodes, trajectories, cumulativeMotion } = resolved;
  const endpoints = new Map(nodes.map((node) => [node.unit.__unitKey, { x: node.x, y: node.y }]));
  const totalMotion = cumulativeMotion[cumulativeMotion.length - 1];
  const trajectoryTimeline = totalMotion > Number.EPSILON
    ? cumulativeMotion.map((motion) => motion / totalMotion)
    : cumulativeMotion.map((_, index) => index / Math.max(1, cumulativeMotion.length - 1));

  return {
    name: 'force', axes, axis: axes.x, r: radius,
    x: (unit) => endpoints.get(unit.__unitKey).x,
    y: (unit) => endpoints.get(unit.__unitKey).y,
    trajectory: (unit) => trajectories.get(unit.__unitKey),
    trajectoryTimeline
  };
}

function forceOverflow(nodes, radius, width, height) {
  return {
    left: Math.max(0, -Math.min(...nodes.map((node) => node.x - radius))),
    right: Math.max(0, Math.max(...nodes.map((node) => node.x + radius)) - width),
    top: Math.max(0, -Math.min(...nodes.map((node) => node.y - radius))),
    bottom: Math.max(0, Math.max(...nodes.map((node) => node.y + radius)) - height)
  };
}

function insetScaleRange(scale, lowOverflow, highOverflow) {
  const low = Math.max(0, Number(lowOverflow) || 0);
  const high = Math.max(0, Number(highOverflow) || 0);
  if (low < 0.01 && high < 0.01) return false;
  const range = scale.range();
  const start = Number(range[0]);
  const end = Number(range[range.length - 1]);
  if (start <= end) scale.range([start + low, end - high]);
  else scale.range([start - high, end + low]);
  return true;
}

function forceAxis(scale, channel) {
  if (!scale || !channel?.field) return null;
  return {
    scale,
    channel: { ...channel, title: channel.title || channel.field }
  };
}

function fitForceRadius(chart, requestedRadius, count) {
  const areaRadius = Math.sqrt(
    (chart.innerWidth * chart.innerHeight * 0.62) / Math.max(count * Math.PI, 1)
  );
  return Math.max(2, Math.min(requestedRadius, areaRadius));
}

function fitGroupedRadius(chart, requestedRadius, groupWidth, maxGroupCount, columns) {
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

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function stackIndex(values, group) {
  const counts = new Map();
  const indexes = new Map();
  values.forEach((value) => {
    const key = group(value);
    const index = counts.get(key) || 0;
    counts.set(key, index + 1);
    indexes.set(value.__unitKey, index);
  });
  return (value) => indexes.get(value.__unitKey) || 0;
}

function uniqueCount(values, key) {
  return new Set(values.map(key)).size;
}

function countBy(values, key) {
  const counts = new Map();
  values.forEach((value) => {
    const group = key(value);
    counts.set(group, (counts.get(group) || 0) + 1);
  });
  return counts;
}

function hungarian(costs) {
  const rowCount = costs.length;
  const columnCount = costs[0]?.length || 0;
  const u = Array(rowCount + 1).fill(0);
  const v = Array(columnCount + 1).fill(0);
  const matchedRow = Array(columnCount + 1).fill(0);
  const path = Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    const minCost = Array(columnCount + 1).fill(Infinity);
    const used = Array(columnCount + 1).fill(false);
    let column0 = 0;
    do {
      used[column0] = true;
      const row0 = matchedRow[column0];
      let delta = Infinity;
      let column1 = 0;
      for (let column = 1; column <= columnCount; column++) {
        if (used[column]) continue;
        const cost = costs[row0 - 1][column - 1] - u[row0] - v[column];
        if (cost < minCost[column]) {
          minCost[column] = cost;
          path[column] = column0;
        }
        if (minCost[column] < delta) {
          delta = minCost[column];
          column1 = column;
        }
      }
      for (let column = 0; column <= columnCount; column++) {
        if (used[column]) {
          u[matchedRow[column]] += delta;
          v[column] -= delta;
        } else {
          minCost[column] -= delta;
        }
      }
      column0 = column1;
    } while (matchedRow[column0] !== 0);

    do {
      const column1 = path[column0];
      matchedRow[column0] = matchedRow[column1];
      column0 = column1;
    } while (column0 !== 0);
  }

  const assignment = Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (matchedRow[column]) assignment[matchedRow[column] - 1] = column - 1;
  }
  return assignment;
}

function travelDistance(source, target) {
  return Math.hypot(Number(source.x) - Number(target.x), Number(source.y) - Number(target.y));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function unitJoinKey(unit) {
  return unit?.__joinKey ?? unit?.__unitKey;
}

function uniqueEnterKey(semanticKey, targetIndex, used) {
  let key = `\u0001enter\u0000${semanticKey}\u0000${targetIndex}`;
  while (used.has(key)) key += '\u0000';
  used.add(key);
  return key;
}

function unitPositionSignature(spec) {
  const unit = specUnit(spec) || {};
  return stableStringify({
    layout: unit.layout || 'grid',
    columns: unit.columns ?? null,
    radius: unit.radius ?? null,
    group: unit.group ?? null,
    value: unit.value ?? null,
    unitValue: unitValueForSpec(spec),
    x: spec.encoding?.x ?? null
  });
}

function unitValueForSpec(spec) {
  return positiveNumber(specUnit(spec)?.unitValue, 1);
}

function canonicalUnitOrder(spec) {
  const unit = specUnit(spec) || {};
  const layoutRank = UNIT_LAYOUT_ORDER.indexOf(unit.layout || 'grid');
  return `${String(layoutRank < 0 ? UNIT_LAYOUT_ORDER.length : layoutRank).padStart(2, '0')}|${stableStringify(spec)}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function dodgeForHeight(units, radius, height, x) {
  let fittedRadius = radius;
  let placed = dodge(units, { radius: fittedRadius * 2.15, x });
  while (fittedRadius > 2 && maxPlacedY(placed) > height - fittedRadius * 2) {
    fittedRadius -= 0.75;
    placed = dodge(units, { radius: fittedRadius * 2.15, x });
  }
  placed.radius = Math.max(2, fittedRadius);
  return placed;
}

function maxPlacedY(placed) {
  return placed.reduce((max, circle) => Math.max(max, circle.y || 0), 0);
}

function dodge(data, { radius = 1, x = (d) => d } = {}) {
  const radius2 = radius ** 2;
  const circles = data.map((datum, index, values) => ({ x: +x(datum, index, values), data: datum }))
    .sort((a, b) => a.x - b.x);
  const epsilon = 1e-3;
  let head = null;
  let tail = null;

  function intersects(x, y) {
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
        const y = a.y + Math.sqrt(radius2 - (a.x - b.x) ** 2);
        if (y < b.y && !intersects(b.x, y)) b.y = y;
        a = a.next;
      } while (a);
    }
    b.next = null;
    if (head === null) head = tail = b;
    else tail = tail.next = b;
  }

  return circles;
}
