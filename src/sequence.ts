import type { Visualization } from './core.js';
import { cloneState } from './grammar/view-state.js';
import { transition } from './transition.js';
import type { TransitionOptions, VisualizationTransition } from './transition.js';
import { resolveTarget } from './runtime/target.js';
import type { TimedVisualizationTransition } from './runtime/transition-controller.js';
import { assertCanvasSize, contentHeight } from './runtime/canvas-size.js';
import type { CanvasSize } from './runtime/canvas-size.js';

/** Options for a timeline of adjacent visualization states. */
export interface SequenceOptions extends TransitionOptions {}

export interface SequencePlayOptions {
  /** Milliseconds for each serial route stage. Defaults to 800. */
  duration?: number;
  /** Timeline position in leg units: 0 is the first state, 1 the second. Defaults to the current value. */
  from?: number;
  /** Timeline position in leg units: 0 is the first state, 1 the second. Defaults to the last state. */
  to?: number;
}

export interface VisualizationSequence {
  /** Immutable states in timeline order. */
  readonly states: readonly Visualization[];
  /** Current timeline position. Integers identify authored states. */
  readonly value: number;
  /** Display a frame synchronously. Values between integers seek within a leg. */
  progress(value: number): VisualizationSequence;
  /** Play across adjacent legs. Duration applies to each serial route stage. */
  play(options?: SequencePlayOptions): VisualizationSequence;
  /** Stop owned playback at the current frame. */
  pause(): VisualizationSequence;
  /**
   * Recompile the active leg for the container's current size/theme. `width` and
   * `height` change the requested canvas size for every leg, as in
   * `TransitionOptions`; a dimension left out keeps its current request.
   */
  resize(options?: { width?: CanvasSize; height?: CanvasSize }): VisualizationSequence;
  /** Stop playback and remove every prepared leg. The controller cannot be used afterwards. */
  destroy(): void;
}

interface Segment {
  controller: VisualizationTransition;
  mount: Element;
  root: Element;
  stageCount: number;
}

/**
 * Turn an ordered set of immutable states into a seekable timeline.
 *
 * A sequence owns every adjacent pair (`A → B`, `B → C`, …) and swaps a
 * prepared surface only at shared endpoints. That keeps the chart host mounted
 * throughout a handoff instead of briefly clearing it between pairwise calls.
 * Authored states are fixed route boundaries. Each pair may add automatic
 * waypoints, but those waypoints never replace a state in this timeline.
 */
export async function sequence(states: readonly Visualization[], options: SequenceOptions): Promise<VisualizationSequence> {
  if (states.length < 2) throw new Error('sequence() requires at least two visualization states.');
  const authoredStates = Object.freeze(states.map(state =>
    typeof (state as { toSpec?: unknown }).toSpec === 'function' ? state : cloneState(state)
  ));

  assertCanvasSize('sequence() width', options.width);
  assertCanvasSize('sequence() height', options.height);
  const host = resolveTarget(options.target);
  const segments: Segment[] = [];
  /** The canvas size every leg is asked for; legs not on screen pick it up when shown. */
  const requested: { width?: CanvasSize; height?: CanvasSize } = { width: options.width, height: options.height };
  let resizeObserver: ResizeObserver | null = null;
  let activeIndex = -1;
  let value = 0;
  let animation: number | null = null;
  let destroyed = false;

  try {
    for (let index = 0; index < authoredStates.length - 1; index += 1) {
      // D3 schedules named transitions on connected nodes. Prepare each leg in
      // a same-sized, hidden document mount; the visible host stays untouched.
      const mount = preparationMount(host, options);
      let controller: VisualizationTransition | undefined;
      try {
        controller = await transition(authoredStates[index], authoredStates[index + 1], { ...options, target: mount });
        const root = mount.firstElementChild;
        if (!root) throw new Error('sequence() could not prepare a transition surface.');
        const timed = controller as TimedVisualizationTransition;
        segments.push({ controller, mount, root, stageCount: Math.max(1, Number(timed.stageCount?.()) || 1) });
      } catch (error) {
        controller?.destroy();
        mount.remove();
        throw error;
      }
    }
  } catch (error) {
    segments.forEach(segment => {
      segment.controller.destroy();
      segment.mount.remove();
    });
    throw error;
  }

  function assertAlive() {
    if (destroyed) throw new Error('This sequence has been destroyed.');
  }

  function stop() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
  }

  function location(next: number) {
    const lastState = authoredStates.length - 1;
    const clamped = Math.max(0, Math.min(lastState, next));
    if (clamped === lastState) return { index: lastState - 1, local: 1, value: clamped };
    const index = Math.floor(clamped);
    return { index, local: clamped - index, value: clamped };
  }

  /** Convert authored-leg coordinates into serial route-stage coordinates. */
  function stagePosition(next: number): number {
    const frame = location(next);
    const completed = segments
      .slice(0, frame.index)
      .reduce((sum, segment) => sum + segment.stageCount, 0);
    return completed + frame.local * segments[frame.index].stageCount;
  }

  /** Convert serial route-stage coordinates back into authored-leg coordinates. */
  function timelinePosition(next: number): number {
    const total = segments.reduce((sum, segment) => sum + segment.stageCount, 0);
    const bounded = Math.max(0, Math.min(total, next));
    if (bounded === total) return authoredStates.length - 1;
    let cursor = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const count = segments[index].stageCount;
      if (bounded <= cursor + count) return index + (bounded - cursor) / count;
      cursor += count;
    }
    return authoredStates.length - 1;
  }

  function activate(index: number) {
    if (activeIndex === index) return;
    if (activeIndex >= 0) {
      const previous = segments[activeIndex];
      if (previous.root.parentNode === host) previous.mount.append(previous.root);
    }
    const next = segments[index];
    host.replaceChildren(next.root);
    activeIndex = index;
    next.controller.resize(requested);
  }

  const controller: VisualizationSequence = {
    states: authoredStates,
    get value() { return value; },
    progress(next) {
      assertAlive();
      if (!Number.isFinite(next)) throw new Error('sequence progress must be a finite number.');
      stop();
      const frame = location(next);
      activate(frame.index);
      segments[frame.index].controller.progress(frame.local);
      value = frame.value;
      return controller;
    },
    play({ duration = 800, from = value, to = authoredStates.length - 1 } = {}) {
      assertAlive();
      if (!Number.isFinite(duration) || duration < 0) throw new Error('duration must be a finite non-negative number.');
      if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('sequence play positions must be finite numbers.');
      const start = location(from).value;
      const end = location(to).value;
      stop();
      controller.progress(start);
      const startStage = stagePosition(start);
      const endStage = stagePosition(end);
      const span = duration * Math.abs(endStage - startStage);
      if (!span) { controller.progress(end); return controller; }
      // Start the clock when play() is called so the first scheduled frame
      // advances instead of repeating the already-committed start frame.
      const started = performance.now();
      const tick = (now: number) => {
        const fraction = Math.min(1, (now - started) / span);
        controller.progress(timelinePosition(startStage + (endStage - startStage) * fraction));
        animation = fraction < 1 ? requestAnimationFrame(tick) : null;
      };
      animation = requestAnimationFrame(tick);
      return controller;
    },
    pause() {
      assertAlive();
      stop();
      return controller;
    },
    resize({ width, height } = {}) {
      assertAlive();
      assertCanvasSize('resize width', width);
      assertCanvasSize('resize height', height);
      if (width != null) requested.width = width;
      if (height != null) requested.height = height;
      if (activeIndex >= 0) segments[activeIndex].controller.resize(requested);
      return controller;
    },
    destroy() {
      if (destroyed) return;
      stop();
      resizeObserver?.disconnect();
      segments.forEach(segment => {
        segment.controller.destroy();
        segment.mount.remove();
      });
      destroyed = true;
    }
  };

  controller.progress(0);
  if (typeof ResizeObserver !== 'undefined') {
    // The legs observe their hidden mounts, so the sequence watches the host and
    // re-fits the leg on screen when a dimension that follows the container changes.
    let width = host.clientWidth;
    let height = contentHeight(host);
    resizeObserver = new ResizeObserver(() => {
      if (destroyed) return;
      const changed = (typeof requested.width !== 'number' && host.clientWidth !== width)
        || (requested.height === 'auto' && contentHeight(host) !== height);
      width = host.clientWidth;
      height = contentHeight(host);
      if (changed) controller.resize();
    });
    resizeObserver.observe(host);
  }
  return controller;
}

function preparationMount(host: Element, options: Pick<TransitionOptions, 'width' | 'height'>): HTMLDivElement {
  const mount = document.createElement('div');
  const width = Math.max(60, typeof options.width === 'number' ? options.width : host.clientWidth || 720);
  const measuredHeight = Math.max(1, typeof options.height === 'number' ? options.height : host.clientHeight || 500);
  mount.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${measuredHeight}px;visibility:hidden;pointer-events:none;`;
  document.body.append(mount);
  return mount;
}
