import type { DataRow } from '../../types/index.js';
import type { LineageCorrespondence, LineageEdge } from '../../data/lineage.js';

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarLineageTarget extends BarRect {
  datum?: DataRow;
}

export interface BarLineageFragment {
  key: string;
  edge: LineageEdge;
  source: BarRect;
  target: BarRect;
  targetDatum?: DataRow;
}

export interface BarLineageMotionInput {
  lineage: LineageCorrespondence;
  sourceRects: Map<string, BarRect>;
  targetRects: Map<string, BarLineageTarget>;
  orientation: 'horizontal' | 'vertical';
}

/**
 * Turn a many-to-many provenance relation into deterministic bar fragments.
 * Each source and target bar is partitioned independently; an edge therefore
 * occupies the correct additive share at both ends of its motion.
 */
export function planBarLineageMotion(input: BarLineageMotionInput): BarLineageFragment[] {
  const { lineage, sourceRects, targetRects, orientation } = input;
  if (!lineage.splittable || !['split', 'merge', 'reaggregate'].includes(lineage.mode)) return [];
  if (!lineage.edges.length || !lineage.edges.every(additiveEdge)) return [];

  const ordered = [...lineage.edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  const sourceParts = partitionEdges(ordered, 'from', 'sourceValue', sourceRects, orientation);
  const targetParts = partitionEdges(ordered, 'to', 'targetValue', targetRects, orientation);
  if (!sourceParts || !targetParts) return [];

  return ordered.map((edge) => ({
    key: edgeKey(edge),
    edge,
    source: sourceParts.get(edgeKey(edge))!,
    target: targetParts.get(edgeKey(edge))!,
    targetDatum: targetRects.get(edge.to)?.datum
  }));
}

function partitionEdges(
  edges: LineageEdge[],
  groupField: 'from' | 'to',
  valueField: 'sourceValue' | 'targetValue',
  rects: Map<string, BarRect>,
  orientation: 'horizontal' | 'vertical'
): Map<string, BarRect> | null {
  const groups = new Map<string, LineageEdge[]>();
  for (const edge of edges) groups.set(edge[groupField], [...(groups.get(edge[groupField]) ?? []), edge]);
  const result = new Map<string, BarRect>();
  for (const [key, group] of groups) {
    const rect = rects.get(key);
    if (!rect) return null;
    const total = group.reduce((sum, edge) => sum + Number(edge[valueField]), 0);
    if (!(total > 0)) return null;
    let cursor = orientation === 'horizontal' ? rect.x : rect.y + rect.height;
    group.forEach((edge, index) => {
      const last = index === group.length - 1;
      const ratio = Number(edge[valueField]) / total;
      if (orientation === 'horizontal') {
        const end = last ? rect.x + rect.width : cursor + rect.width * ratio;
        result.set(edgeKey(edge), { x: cursor, y: rect.y, width: Math.max(0, end - cursor), height: rect.height });
        cursor = end;
      } else {
        const start = last ? rect.y : cursor - rect.height * ratio;
        result.set(edgeKey(edge), { x: rect.x, y: start, width: rect.width, height: Math.max(0, cursor - start) });
        cursor = start;
      }
    });
  }
  return result;
}

function additiveEdge(edge: LineageEdge): boolean {
  return Number.isFinite(edge.sourceValue) && Number(edge.sourceValue) >= 0 &&
    Number.isFinite(edge.targetValue) && Number(edge.targetValue) >= 0;
}

function edgeKey(edge: LineageEdge): string {
  return JSON.stringify([edge.from, edge.to, edge.atoms.map((atom) => atom.id).sort()]);
}
