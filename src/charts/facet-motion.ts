import { specState } from '../spec-meta.js';
import type { CanonicalTransitionPair, ViewSpec } from '../types/index.js';

export interface PanelRect { x: number; y: number; width: number; height: number }
export function canonicalFacetPair<S extends ViewSpec>(from: S, to: S): CanonicalTransitionPair<S> {
  const rank = (spec: ViewSpec) => {
    const layout = spec.facetLayout as { direction?: string; columns?: number } | undefined;
    return layout?.direction === 'y' ? 1 : layout?.direction === 'x' ? Infinity : layout?.columns ?? 2;
  };
  const reverse = rank(from) === rank(to) ? JSON.stringify(from.facetLayout) > JSON.stringify(to.facetLayout) : rank(from) < rank(to);
  return reverse ? { from: to, to: from, reverse: true } : { from, to, reverse: false };
}
export function panelAxisOrder(spec: ViewSpec): 'x' | 'y' {
  const state = specState(spec);
  const order = (state.sceneState?.axis ?? state.axis)?.order;
  if (order?.length) return order[0];
  return spec.encoding?.x?.type === 'quantitative' && spec.encoding?.y?.type !== 'quantitative' ? 'y' : 'x';
}
/** First move the container's two coordinates, then reflow its contents. */
export function panelMotionFrame(from: PanelRect, to: PanelRect, first: 'x' | 'y', progress: number, ease: (t: number) => number) {
  const midway = first === 'x' ? { ...from, x: to.x, width: to.width } : { ...from, y: to.y, height: to.height };
  const phase = Math.min(1, Math.floor(progress * 4));
  const frames = [from, midway, to];
  const local = ease(Math.max(0, Math.min(1, progress * 4 - phase)));
  const rect = Object.fromEntries((['x','y','width','height'] as const).map(key => [key, frames[phase][key] + (frames[phase + 1][key] - frames[phase][key]) * local])) as unknown as PanelRect;
  const content = Math.max(0, Math.min(1, (progress - .5) * 2));
  return { rect, content };
}

/** Choose a staged route whose intermediate containers remain disjoint. */
export function containerAxisOrder(from: PanelRect[], to: PanelRect[], preferred: 'x' | 'y'): 'x' | 'y' {
  const safe = (axis: 'x' | 'y') => {
    const middle = from.map((r, i) => axis === 'x' ? { ...r, x: to[i].x, width: to[i].width } : { ...r, y: to[i].y, height: to[i].height });
    const collision = (a: PanelRect, b: PanelRect, endA: PanelRect, endB: PanelRect) => {
      const edges = (u: PanelRect, v: PanelRect) => [u.x + u.width - v.x, v.x + v.width - u.x, u.y + u.height - v.y, v.y + v.height - u.y];
      const start = edges(a, b), end = edges(endA, endB);
      let low = 0, high = 1;
      for (let k = 0; k < 4; k++) {
        const delta = end[k] - start[k];
        if (Math.abs(delta) < 1e-9) { if (start[k] <= 1e-6) return false; }
        else if (delta > 0) low = Math.max(low, (1e-6 - start[k]) / delta);
        else high = Math.min(high, (1e-6 - start[k]) / delta);
      }
      return low < high;
    };
    return from.every((a, i) => from.every((b, j) => i >= j || (!collision(a, b, middle[i], middle[j]) && !collision(middle[i], middle[j], to[i], to[j]))));
  };
  return safe(preferred) ? preferred : preferred === 'x' ? 'y' : 'x';
}

