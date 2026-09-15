// Seekable property tracks.
//
// A track item is one timed change on one node: when it starts, how long it
// lasts, how it eases, and a lazy `init()` that materializes the per-property
// tweens once earlier changes have been applied. The sampler below is the only
// thing that turns a normalized progress value into DOM writes, so it is the
// unit that reverse playback, phase handoff, and direction-aware easing share.
//
// Nothing here knows about D3 transitions: every item is written by the
// recorder in ./recorder.ts.

export type Ease = (t: number) => number;

export interface Tween {
  /** Property identity. Later steps on the same node+name take over the track. */
  name: string;
  apply: (this: Element, eased: number) => void;
}

export interface TrackItem {
  node: Element;
  /** Clock time at scheduling. Items scheduled in one frame share a value. */
  time: number;
  delay: number;
  duration: number;
  ease: Ease;
  /**
   * Materialize tweens. Called once, after earlier changes on the same node
   * have been sampled at this item's start, so factories can read the actual
   * starting DOM values. Return null to cancel the item.
   */
  init(): Tween[] | null;
  /** Jump to the final state and release resources (e.g. remove exited nodes). */
  finish(): void;
  /** Release without completing. */
  cancel(): void;
}

export interface FrameEvaluator {
  progress(value: number, direction?: number): void;
}

export interface ProgressController extends FrameEvaluator {
  readonly items: readonly TrackItem[];
  /** Total timeline length in ms. */
  readonly span: number;
  /** Compile per-property tracks. Scrubbing then no longer touches the items. */
  compile(): FrameEvaluator;
  destroy(options?: { finish?: boolean }): void;
}

interface Scheduled {
  item: TrackItem;
  start: number;
  tweens: Tween[] | null;
  started: boolean;
  cancelled: boolean;
  finished: boolean;
}

interface Segment {
  start: number;
  duration: number;
  ease: Ease;
  apply: Tween['apply'];
}

interface PropertyTrack {
  node: Element;
  segments: Segment[];
}

const REVERSE_EASE = '__visDeltaReverseEase';

type DirectionalEase = Ease & { [REVERSE_EASE]?: Ease };

export function createProgressController(items: TrackItem[]): ProgressController {
  const minTime = items.length ? Math.min(...items.map((item) => item.time)) : 0;
  const scheduled: Scheduled[] = items
    .map((item) => ({
      item,
      start: item.time - minTime + item.delay,
      tweens: null,
      started: false,
      cancelled: false,
      finished: false
    }))
    .sort((a, b) => a.start - b.start);
  const span = Math.max(1, ...scheduled.map((entry) => entry.start + entry.item.duration));

  return {
    items,
    span,
    compile() {
      return compilePropertyTracks(scheduled, span);
    },
    progress(value, direction = 1) {
      const elapsed = clamp(value, 0, 1) * span;
      scheduled.forEach((entry) => scrub(entry, elapsed, direction));
    },
    destroy({ finish = false } = {}) {
      scheduled.forEach((entry) => {
        if (finish) finishScheduled(entry);
        else cancelScheduled(entry);
      });
    }
  };
}

/** Live scrub: evaluate every started item directly. Used by the reconstruct path. */
function scrub(entry: Scheduled, elapsed: number, direction: number): void {
  if (entry.finished || entry.cancelled) return;
  if (elapsed < entry.start && !entry.started) return;
  ensureTweens(entry);
  if (!entry.tweens) return;
  const duration = entry.item.duration || 1;
  const eased = easeForDirection(entry.item.ease, direction)(clamp((elapsed - entry.start) / duration, 0, 1));
  entry.tweens.forEach((tween) => tween.apply.call(entry.item.node, eased));
}

function ensureTweens(entry: Scheduled): void {
  if (entry.started) return;
  entry.started = true;
  const tweens = entry.item.init();
  if (!tweens) { entry.cancelled = true; return; }
  entry.tweens = tweens;
}

/**
 * Compile per-node, per-property segment lists. A later step owns a property
 * only once its start has been reached; before the first start a property
 * evaluates its t=0 value. That resets delayed properties on backward seeks
 * without rewinding other properties.
 */
function compilePropertyTracks(scheduled: Scheduled[], span: number): FrameEvaluator {
  const byNode = new Map<Element, Map<string, PropertyTrack>>();
  const tracks: PropertyTrack[] = [];

  const sample = (elapsed: number, direction = 1) => {
    for (const track of tracks) {
      let segment = track.segments[0];
      for (let i = 1; i < track.segments.length && track.segments[i].start <= elapsed; i++) segment = track.segments[i];
      const local = segment.duration > 0
        ? clamp((elapsed - segment.start) / segment.duration, 0, 1)
        : elapsed >= segment.start ? 1 : 0;
      segment.apply.call(track.node, easeForDirection(segment.ease, direction)(local));
    }
  };

  let lastStart = -Infinity;
  for (const entry of scheduled) {
    // Tween factories read starting DOM values. Materialize earlier changes at
    // this step's exact start before initializing its interpolators.
    if (entry.start !== lastStart) { sample(entry.start); lastStart = entry.start; }
    ensureTweens(entry);
    if (!entry.tweens) continue;
    let properties = byNode.get(entry.item.node);
    if (!properties) { properties = new Map(); byNode.set(entry.item.node, properties); }
    for (const tween of entry.tweens) {
      let track = properties.get(tween.name);
      if (!track) {
        track = { node: entry.item.node, segments: [] };
        properties.set(tween.name, track);
        tracks.push(track);
      }
      track.segments.push({ start: entry.start, duration: entry.item.duration, ease: entry.item.ease, apply: tween.apply });
    }
  }
  sample(0);
  return {
    progress(value, direction = 1) {
      sample(clamp(value, 0, 1) * span, direction);
    }
  };
}

function finishScheduled(entry: Scheduled): void {
  if (entry.finished) return;
  ensureTweens(entry);
  if (entry.tweens) entry.tweens.forEach((tween) => tween.apply.call(entry.item.node, 1));
  entry.finished = true;
  entry.item.finish();
}

function cancelScheduled(entry: Scheduled): void {
  if (entry.finished) return;
  entry.finished = true;
  entry.item.cancel();
}

/** Attach a reverse-playback ease without giving Core any chart semantics. */
export function directionalEase(forward: Ease, reverse: Ease): Ease {
  const ease: DirectionalEase = (progress) => forward(progress);
  Object.defineProperty(ease, REVERSE_EASE, { value: reverse });
  return ease;
}

export function easeForDirection(ease: Ease, direction: number): Ease {
  const reverse = (ease as DirectionalEase)[REVERSE_EASE];
  return direction < 0 && typeof reverse === 'function' ? reverse : ease;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
