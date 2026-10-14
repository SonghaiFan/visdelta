import type { TransitionInspection } from 'visdelta/transition';

export interface ElementTrack {
  label: string;
  path: string[];
  start: number;
  end: number;
}

/** Shared ancestor rows keep the tree and the animation lanes in identical order. */
export function elementTree(tracks: ElementTrack[]) {
  const roots = new Map<string, { id: string; label: string; depth: number }>();
  for (const track of tracks) {
    track.path.forEach((label, depth) => {
      const id = JSON.stringify(track.path.slice(0, depth + 1));
      if (!roots.has(id)) roots.set(id, { id, label, depth });
    });
  }
  const rows = [...roots.values()];
  const ordered: typeof rows = [];
  const visit = (parent: string[]) => {
    for (const row of rows) {
      const path = JSON.parse(row.id) as string[];
      if (path.length === parent.length + 1 && path.slice(0, -1).every((part, i) => part === parent[i])) {
        ordered.push(row);
        visit(path);
      }
    }
  };
  visit([]);
  return ordered;
}

/** Copy intervals only: inspected nodes are invalid after controller destruction. */
export function elementTracks(inspection: TransitionInspection): ElementTrack[] {
  const groups = new Map<string, ElementTrack[]>();
  for (const phase of inspection.stages) {
    for (const property of phase.properties) {
      // Custom tweens can move through an intermediate shape with equal endpoints.
      if (property.kind !== 'custom' && property.from === property.to) continue;
      // Inspection has already restored the visible frame. Read the saved DOM
      // ancestry rather than parents of nodes that may now be detached.
      const path = property.ancestry.map(({ tag, classes }) => `${tag}${classes.map(name => `.${name}`).join('')}`);
      if (!path.length) continue;
      const label = path.at(-1)!;
      const id = JSON.stringify(path);
      const span = phase.end - phase.start;
      const interval = { label, path, start: phase.start + property.start * span, end: phase.start + property.end * span };
      if (interval.end <= interval.start) continue;
      const intervals = groups.get(id) ?? [];
      intervals.push(interval);
      groups.set(id, intervals);
    }
  }
  return Array.from(groups.values()).flatMap(intervals => {
    const merged: ElementTrack[] = [];
    for (const interval of intervals.sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end + 1e-9) previous.end = Math.max(previous.end, interval.end);
      else merged.push({ ...interval });
    }
    return merged;
  });
}
