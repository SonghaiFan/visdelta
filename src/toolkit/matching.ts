export interface TravelPair {
  sourceIndex: number;
  targetIndex: number;
  distance: number;
  matchedBy?: 'key' | 'travel';
}

export interface TravelSlot {
  key?: string | number | null;
  x: number;
  y: number;
}

export function minimumTravelMatching(sources: readonly TravelSlot[], targets: readonly TravelSlot[]): TravelPair[] {
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
 * and target with the same key stay paired even when another position is closer.
 */
export function keyFirstTravelMatching(sources: readonly TravelSlot[], targets: readonly TravelSlot[]): TravelPair[] {
  for (const slot of [...sources, ...targets]) {
    if (!Number.isFinite(slot.x) || !Number.isFinite(slot.y)) throw new Error('Travel matching requires finite coordinates.');
  }
  const pairs: TravelPair[] = [];
  const usedSources = new Set<number>();
  const usedTargets = new Set<number>();
  const sourceByKey = new Map<string, number>();

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

/** Minimum-cost assignment of rows to columns; rows must not outnumber columns. */
function hungarian(costs: number[][]): number[] {
  const rowCount = costs.length;
  const columnCount = costs[0]?.length || 0;
  const u: number[] = Array(rowCount + 1).fill(0);
  const v: number[] = Array(columnCount + 1).fill(0);
  const matchedRow: number[] = Array(columnCount + 1).fill(0);
  const path: number[] = Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    const minCost: number[] = Array(columnCount + 1).fill(Infinity);
    const used: boolean[] = Array(columnCount + 1).fill(false);
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

  const assignment: number[] = Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (matchedRow[column]) assignment[matchedRow[column] - 1] = column - 1;
  }
  return assignment;
}

function travelDistance(source: TravelSlot, target: TravelSlot): number {
  if (![source.x, source.y, target.x, target.y].every(Number.isFinite)) {
    throw new Error('Travel matching requires finite coordinates.');
  }
  const distance = Math.hypot(source.x - target.x, source.y - target.y);
  if (!Number.isFinite(distance)) throw new Error('Travel matching requires finite distances.');
  return distance;
}
