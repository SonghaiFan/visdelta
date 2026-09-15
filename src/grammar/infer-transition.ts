import type { Delta, ViewSpec } from '../types/index.js';
import { diffViewStates, sameValue } from './diff.js';

type SpecLike = ViewSpec | { toSpec(): ViewSpec } | null | undefined;

/** Derive renderer scene hints from endpoint differences, not a complete
 * ontology or phase order. Builder provenance is not animation input. */
export function inferTransition(previous: SpecLike, next: SpecLike): string[] {
  if (!previous || !next) return [];
  const diff = diffViewStates(previous, next);
  const scenes: string[] = [];
  const layoutOnly = onlyDetailLayoutChanged(diff.delta('detail'));
  const aggregateChanged = !sameValue(
    diff.previous.nonFilterTransforms.filter(t => 'aggregate' in t || 'bin' in t),
    diff.next.nonFilterTransforms.filter(t => 'aggregate' in t || 'bin' in t)
  );
  const detail = !layoutOnly && (
    diff.hasDelta('detail') || aggregateChanged
  );
  const prev = diff.previous.encoding;
  const curr = diff.next.encoding;
  const swapped = Boolean(prev.x?.field && prev.y?.field && prev.x.field !== prev.y.field &&
    prev.x.field === curr.y?.field && prev.y.field === curr.x?.field);
  const fieldChanged = (['x', 'y'] as const).some(channel =>
    prev[channel]?.field && curr[channel]?.field && prev[channel]?.field !== curr[channel]?.field
  );
  const coordinatesChanged = (['x', 'y'] as const).some(channel =>
    !sameValue(coordinates(prev[channel]), coordinates(curr[channel]))
  );
  const offsetChanged = (['xOffset', 'yOffset'] as const).some(channel =>
    !sameValue(prev[channel], curr[channel])
  );

  if (
    diff.hasDelta('filter') ||
    diff.hasDelta('selection') ||
    diff.hasDelta('focus') ||
    diff.hasDelta('highlight')
  ) scenes.push('selection');
  // A pure axis swap changes reading direction, not the selected variables.
  // Generated aggregate fields belong to detail rather than mapping.
  if (fieldChanged && !swapped && !detail) scenes.push('mapping');
  if (detail) scenes.push('detail');
  if (swapped || coordinatesChanged || offsetChanged || layoutOnly || diff.hasDelta('axis')) scenes.push('axis');
  return scenes;
}

function coordinates(channel: Record<string, unknown> | undefined) {
  if (!channel) return null;
  return { scale: channel.scale ?? null, domain: channel.domain ?? null, sort: channel.sort ?? null };
}

function onlyDetailLayoutChanged(delta: Delta | null): boolean {
  if (!delta?.previous || !delta?.next) return false;
  const { layout: previousLayout, ...previous } = delta.previous as Record<string, unknown>;
  const { layout: nextLayout, ...next } = delta.next as Record<string, unknown>;
  return sameValue(previous, next) && !sameValue(previousLayout, nextLayout);
}
