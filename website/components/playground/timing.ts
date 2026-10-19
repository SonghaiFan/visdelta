import type { StateChange } from 'visdelta/core';

export const STAGE_DURATION = 900;
const CHROME_DURATION = 300;

/** Lightweight figure changes use one clock for live edits, replay and the ruler. */
export function stageDurationFor(changes: readonly StateChange[], fallback = STAGE_DURATION): number {
  return changes.length > 0 && changes.every(change =>
    (change.category === 'encoding' && change.channel === 'color')
  ) ? CHROME_DURATION : fallback;
}
