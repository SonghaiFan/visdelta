import type { Visualization } from './core.js';
import { transition } from './transition.js';
import type { TransitionOptions, VisualizationTransition } from './transition.js';

/** Options for a timeline of adjacent visualization states. */
export interface SequenceOptions extends TransitionOptions {}

export interface SequencePlayOptions {
  /** Milliseconds for each adjacent state change. */
  duration?: number;
  /** Timeline position in leg units: 0 is the first state, 1 the second. */
  from?: number;
  /** Timeline position in leg units: 0 is the first state, 1 the second. */
  to?: number;
}

export interface VisualizationSequence {
  /** Immutable states in timeline order. */
  readonly states: readonly Visualization[];
  /** Current timeline position. Integers identify authored states. */
  readonly value: number;
  /** Display a frame synchronously. Values between integers seek within a leg. */
  progress(value: number): VisualizationSequence;
  /** Play across adjacent legs. Duration applies to each leg. */
  play(options?: SequencePlayOptions): VisualizationSequence;
  pause(): VisualizationSequence;
  /** Recompile the active leg for the container's current size/theme. */
  resize(): VisualizationSequence;
  destroy(): void;
}

interface Segment {
  controller: VisualizationTransition;
  mount: Element;
  root: Element;
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

  const host = resolveTarget(options.target);
  const segments: Segment[] = [];
  let activeIndex = -1;
  let value = 0;
  let animation: number | null = null;
  let destroyed = false;

  try {
    for (let index = 0; index < states.length - 1; index += 1) {
      // D3 schedules named transitions on connected nodes. Prepare each leg in
      // a same-sized, hidden document mount; the visible host stays untouched.
      const mount = preparationMount(host, options.height);
      const controller = await transition(states[index], states[index + 1], { ...options, target: mount });
      const root = mount.firstElementChild;
      if (!root) throw new Error('sequence() could not prepare a transition surface.');
      segments.push({ controller, mount, root });
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
    const lastState = states.length - 1;
    const clamped = Math.max(0, Math.min(lastState, next));
    if (clamped === lastState) return { index: lastState - 1, local: 1, value: clamped };
    const index = Math.floor(clamped);
    return { index, local: clamped - index, value: clamped };
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
    next.controller.resize();
  }

  const controller: VisualizationSequence = {
    states,
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
    play({ duration = 800, from = value, to = states.length - 1 } = {}) {
      assertAlive();
      if (!Number.isFinite(duration) || duration < 0) throw new Error('duration must be a finite non-negative number.');
      if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('sequence play positions must be finite numbers.');
      const start = location(from).value;
      const end = location(to).value;
      stop();
      controller.progress(start);
      const span = duration * Math.abs(end - start);
      if (!span) { controller.progress(end); return controller; }
      let started: number | null = null;
      const tick = (now: number) => {
        started ??= now;
        const fraction = Math.min(1, (now - started) / span);
        controller.progress(start + (end - start) * fraction);
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
    resize() {
      assertAlive();
      if (activeIndex >= 0) segments[activeIndex].controller.resize();
      return controller;
    },
    destroy() {
      if (destroyed) return;
      stop();
      segments.forEach(segment => {
        segment.controller.destroy();
        segment.mount.remove();
      });
      destroyed = true;
    }
  };

  controller.progress(0);
  return controller;
}

function resolveTarget(target: string | Element): Element {
  if (typeof target !== 'string') return target;
  const node = document.querySelector(target);
  if (!node) throw new Error(`VisDelta target not found: ${target}`);
  return node;
}

function preparationMount(host: Element, height: number | undefined): HTMLDivElement {
  const mount = document.createElement('div');
  const width = Math.max(60, host.clientWidth || 720);
  const measuredHeight = Math.max(1, host.clientHeight || height || 500);
  mount.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${measuredHeight}px;visibility:hidden;pointer-events:none;`;
  document.body.append(mount);
  return mount;
}
