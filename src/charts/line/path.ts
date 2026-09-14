import {
  interpolatePathPoints,
  matchRenderedPaths
} from '../path-interpolation.js';

export type LinePathPoint = { x: number; y: number };
export type LinePathInterpolator = (progress: number) => string;

export interface LinePathKeyPoint extends LinePathPoint {
  key: string;
}

export interface LinePathFrame {
  path: string;
  curve: string;
  points: LinePathKeyPoint[];
}

export type LinePathStrategy =
  | 'keep-shape'
  | 'move-points'
  | 'zipper'
  | 'add-points'
  | 'remove-points'
  | 'add-remove-points'
  | 'change-curve'
  | 'match-shape';

export interface LinePathMatch {
  strategy: LinePathStrategy;
  interpolate: LinePathInterpolator;
}

/**
 * Choose a Line-owned transition from keyed observations before falling back
 * to rendered geometry. The Core never needs to know how an SVG line is made.
 */
export function matchLinePathFrames(
  fromNode: SVGPathElement,
  from: LinePathFrame | null | undefined,
  to: LinePathFrame,
  renderPoints: (points: readonly LinePathPoint[]) => string
): LinePathMatch {
  if (!from || !from.points.length || !to.points.length) {
    return {
      strategy: 'match-shape',
      interpolate: matchLinePaths(fromNode, to.path)
    };
  }

  // A curve change deliberately changes the rendered geometry between the
  // same observations. Geometry sampling is the right tool for that job.
  if (from.curve !== to.curve) {
    return {
      strategy: 'change-curve',
      interpolate: matchLinePaths(fromNode, to.path)
    };
  }

  const fromKeys = from.points.map((point) => point.key);
  const toKeys = to.points.map((point) => point.key);

  if (sameKeysInOrder(fromKeys, toKeys)) {
    if (samePointPositions(from.points, to.points)) {
      return semanticMatch('keep-shape', from, to, pairSameKeys(from.points, to.points), renderPoints);
    }
    return semanticMatch('move-points', from, to, pairSameKeys(from.points, to.points), renderPoints);
  }

  const observation = pairObservationChanges(from.points, to.points);
  if (observation) {
    const strategy = observation.added && observation.removed
      ? 'add-remove-points'
      : observation.added ? 'add-points' : 'remove-points';
    return semanticMatch(strategy, from, to, observation.pairs, renderPoints);
  }

  return {
    strategy: 'match-shape',
    interpolate: matchLinePaths(fromNode, to.path)
  };
}

/**
 * Move two complete series to or from their shared aggregate path like a
 * zipper. The caller may separately render the aggregate geometry as a
 * reference guide; this matcher only owns the two moving series paths.
 *
 * Canonical progress runs aggregate -> series. Merge evaluates these exact
 * frames backward, so its attraction progress is `1 - progress`. Squaring that
 * value gives the requested slow-then-fast pull; a short index offset makes
 * observations attach in x order instead of collapsing everywhere at once.
 */
export function matchLineZipperFrames(
  from: LinePathFrame | null | undefined,
  to: LinePathFrame,
  renderPoints: (points: readonly LinePathPoint[]) => string
): LinePathMatch | null {
  if (!from || !from.points.length || from.points.length !== to.points.length) return null;
  if (!sameKeysInOrder(from.points.map(point => point.key), to.points.map(point => point.key))) return null;

  return {
    strategy: 'zipper',
    interpolate: (progress: number) => {
      const splitProgress = clampProgress(progress);
      if (splitProgress === 0) return from.path;
      if (splitProgress === 1) return to.path;

      const attraction = (1 - splitProgress) ** 2;
      const spread = 0.42;
      const last = Math.max(1, from.points.length - 1);
      return renderPoints(from.points.map((source, index) => {
        const offset = index / last * spread;
        const attached = clampProgress((attraction - offset) / (1 - spread));
        const detached = 1 - attached;
        const target = to.points[index]!;
        return {
          x: source.x + (target.x - source.x) * detached,
          y: source.y + (target.y - source.y) * detached
        };
      }));
    }
  };
}

/**
 * Match two rendered SVG paths by distance, then move the matched points.
 *
 * A D3 curve change can alter both the number and type of SVG commands.
 * Matching points on the rendered geometry avoids pairing unrelated numbers
 * from the two `d` strings. This work belongs to the Line module; the generic
 * transition runtime only sees the resulting D3 attribute tween.
 */
export function matchLinePaths(
  fromNode: SVGPathElement,
  toPath: string | null | undefined
): LinePathInterpolator {
  return matchRenderedPaths(fromNode, toPath);
}

/** Pure point interpolation used by matchLinePaths and its unit tests. */
export function interpolateLinePoints(
  fromPoints: readonly LinePathPoint[],
  toPoints: readonly LinePathPoint[]
): LinePathInterpolator {
  return interpolatePathPoints(fromPoints, toPoints);
}

interface PointPair {
  from: LinePathPoint;
  to: LinePathPoint;
  start?: number;
  end?: number;
}

function semanticMatch(
  strategy: LinePathStrategy,
  from: LinePathFrame,
  to: LinePathFrame,
  pairs: PointPair[],
  renderPoints: (points: readonly LinePathPoint[]) => string
): LinePathMatch {
  return {
    strategy,
    interpolate: (progress: number) => {
      const value = clampProgress(progress);
      if (value === 0) return from.path;
      if (value === 1) return to.path;
      return renderPoints(pairs.map((pair) => {
        const local = phaseProgress(value, pair.start ?? 0, pair.end ?? 1);
        return {
          x: pair.from.x + (pair.to.x - pair.from.x) * local,
          y: pair.from.y + (pair.to.y - pair.from.y) * local
        };
      }));
    }
  };
}

function pairSameKeys(
  from: readonly LinePathKeyPoint[],
  to: readonly LinePathKeyPoint[]
): PointPair[] {
  return from.map((point, index) => ({ from: point, to: to[index] }));
}

/**
 * One keyed matcher owns every observation membership change. Add supplies
 * enter pairs, Remove supplies exit pairs, and a moving window simply has
 * both. There is no separate window-transition geometry.
 */
function pairObservationChanges(
  from: readonly LinePathKeyPoint[],
  to: readonly LinePathKeyPoint[]
): { pairs: PointPair[]; added: boolean; removed: boolean } | null {
  const fromKeys = from.map((point) => point.key);
  const toKeys = to.map((point) => point.key);
  const fromSet = new Set(fromKeys);
  const toSet = new Set(toKeys);
  const added = toKeys.some((key) => !fromSet.has(key));
  const removed = fromKeys.some((key) => !toSet.has(key));
  if (!added && !removed) return null;

  const sharedFrom = fromKeys.filter((key) => toSet.has(key));
  const sharedTo = toKeys.filter((key) => fromSet.has(key));
  if (!sameKeysInOrder(sharedFrom, sharedTo)) return null;

  const order = mergeObservationOrder(fromKeys, toKeys, sharedFrom);
  const fromByKey = pointMap(from);
  const toByKey = pointMap(to);
  const ordered = order.map((key) => fromByKey.get(key) ?? toByKey.get(key)!);
  const stagesBoth = added && removed;
  return {
    added,
    removed,
    pairs: ordered.map((point, index) => {
      const source = fromByKey.get(point.key);
      const target = toByKey.get(point.key);
      return {
        from: source ?? anchorMissingPoint(index, ordered, fromByKey),
        to: target ?? anchorMissingPoint(index, ordered, toByKey),
        start: stagesBoth && !target ? 0.3 : 0,
        end: stagesBoth && !source ? 0.7 : 1
      };
    })
  };
}

function phaseProgress(value: number, start: number, end: number): number {
  return clampProgress((value - start) / Math.max(Number.EPSILON, end - start));
}

function mergeObservationOrder(
  from: readonly string[],
  to: readonly string[],
  shared: readonly string[]
): string[] {
  const order: string[] = [];
  let fromIndex = 0;
  let toIndex = 0;
  const append = (key: string) => {
    if (order[order.length - 1] !== key) order.push(key);
  };

  for (const sharedKey of shared) {
    while (from[fromIndex] !== sharedKey) append(from[fromIndex++]);
    while (to[toIndex] !== sharedKey) append(to[toIndex++]);
    append(sharedKey);
    fromIndex += 1;
    toIndex += 1;
  }
  while (fromIndex < from.length) append(from[fromIndex++]);
  while (toIndex < to.length) append(to[toIndex++]);
  return order;
}

function anchorMissingPoint(
  index: number,
  ordered: readonly LinePathKeyPoint[],
  known: Map<string, LinePathKeyPoint>
): LinePathPoint {
  let before = index - 1;
  while (before >= 0 && !known.has(ordered[before].key)) before -= 1;
  let after = index + 1;
  while (after < ordered.length && !known.has(ordered[after].key)) after += 1;

  const left = before >= 0 ? known.get(ordered[before].key) : null;
  const right = after < ordered.length ? known.get(ordered[after].key) : null;
  if (left && right) {
    const ratio = (index - before) / (after - before);
    return {
      x: left.x + (right.x - left.x) * ratio,
      y: left.y + (right.y - left.y) * ratio
    };
  }
  if (left) return { x: left.x, y: left.y };
  if (right) return { x: right.x, y: right.y };
  return { x: ordered[index].x, y: ordered[index].y };
}

function pointMap(points: readonly LinePathKeyPoint[]): Map<string, LinePathKeyPoint> {
  return new Map(points.map((point) => [point.key, point]));
}

function sameKeysInOrder(from: readonly string[], to: readonly string[]): boolean {
  return from.length === to.length && from.every((key, index) => key === to[index]);
}

function samePointPositions(
  from: readonly LinePathKeyPoint[],
  to: readonly LinePathKeyPoint[]
): boolean {
  return from.every((point, index) =>
    Math.abs(point.x - to[index].x) < 0.001 && Math.abs(point.y - to[index].y) < 0.001);
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, Number(progress) || 0));
}
