import type { Visualization } from './core.js';
import { mountedAt, registerMounted } from './runtime/mounted.js';
import { sequence as createSequence } from './sequence.js';
import { transition } from './transition.js';
import type { SequencePlayOptions } from './sequence.js';
import type { PlayOptions, TransitionOptions, VisualizationTransition } from './transition.js';
import type { Target } from './types/index.js';

type StateUpdate<S extends Visualization> = (state: S) => Visualization;

/** A live VisDelta chart: an owned mount plus its current immutable endpoint. */
export interface LiveChart<S extends Visualization = any> {
  readonly target: Element;
  readonly state: S;
  /** Derive one next state from the current endpoint. Nothing changes until `play()`. */
  update<T extends Visualization>(change: (state: S) => T): PendingUpdate<T>;
  /** Derive several adjacent states from the current endpoint and play them as one timeline. */
  sequence(steps: readonly StateUpdate<any>[]): PendingSequence;
  /** Remove the mounted chart and release its runtime controller. */
  destroy(): void;
}

/** A single immutable state change awaiting an explicit animation command. */
export interface PendingUpdate<S extends Visualization = Visualization> {
  play(options?: PlayOptions): Promise<LiveMotion<S>>;
}

/** A prepared multi-state timeline awaiting an explicit animation command. */
export interface PendingSequence {
  play(options?: SequencePlayOptions): Promise<LiveSequenceMotion>;
}

/** Controls for the currently playing one-leg update. */
export interface LiveMotion<S extends Visualization = Visualization> {
  readonly chart: LiveChart<S>;
  readonly controller: VisualizationTransition;
  pause(): LiveMotion<S>;
  progress(value: number): LiveMotion<S>;
  resize(): LiveMotion<S>;
  destroy(): void;
}

/** Controls for the currently playing multi-leg timeline. */
export interface LiveSequenceMotion {
  readonly chart: LiveChart;
  readonly controller: Awaited<ReturnType<typeof createSequence>>;
  pause(): LiveSequenceMotion;
  progress(value: number): LiveSequenceMotion;
  resize(): LiveSequenceMotion;
  destroy(): void;
}

/** Find a chart previously mounted by VisDelta. */
export function select<S extends Visualization = any>(target: Target): LiveChart<S> {
  const host = resolveTarget(target);
  if (!mountedAt(host)) throw new Error('select() needs a chart mounted by transition() or mount() at this target.');
  return live<S>(host);
}

/** Mount one visualization so it can subsequently be addressed with `select()`. */
export async function mount<S extends Visualization>(visualization: S, options: TransitionOptions): Promise<LiveChart<S>> {
  const controller = await transition(visualization, visualization, options);
  controller.progress(1);
  return live<S>(resolveTarget(options.target ?? '#app'));
}

function live<S extends Visualization>(target: Element): LiveChart<S> {
  return {
    target,
    get state() {
      return requireMounted(target).visualization as S;
    },
    update(change) {
      const current = requireMounted(target);
      return update(target, current.visualization as S, change(current.visualization as S), current.options);
    },
    sequence(steps) {
      const current = requireMounted(target);
      const states: Visualization[] = [current.visualization];
      for (const step of steps) states.push(step(states[states.length - 1]));
      if (states.length < 2) throw new Error('LiveChart.sequence() requires at least one state update.');
      return sequence(target, current.visualization, states, current.options);
    },
    destroy() {
      requireMounted(target).controller.destroy();
    }
  };
}

function update<S extends Visualization>(target: Element, from: Visualization, to: S, options: TransitionOptions): PendingUpdate<S> {
  return {
    async play(playOptions = {}) {
      const current = requireMounted(target);
      if (current.visualization !== from) throw new Error('The mounted chart changed before this update was played. Select it again and retry.');
      const staging = stagingMount(target, options.height);
      const controller = await transition(from, to, { ...options, target: staging });
      const root = staging.firstElementChild;
      if (!root) {
        controller.destroy();
        staging.remove();
        throw new Error('LiveChart.update() could not prepare a transition surface.');
      }
      target.replaceChildren(root);
      staging.remove();
      registerMounted(target, to, { ...options, target }, controller);
      current.controller.destroy();
      controller.play(playOptions);
      return motion(live<S>(target), controller);
    }
  };
}

function sequence(target: Element, from: Visualization, states: Visualization[], options: TransitionOptions): PendingSequence {
  return {
    async play(playOptions = {}) {
      const current = requireMounted(target);
      if (current.visualization !== from) throw new Error('The mounted chart changed before this sequence was played. Select it again and retry.');
      // Preparation is off-host. It mounts only after every adjacent leg is
      // ready, so an existing chart remains visible during setup.
      const controller = await createSequence(states, { ...options, target });
      registerMounted(target, states[states.length - 1], { ...options, target }, controller);
      current.controller.destroy();
      controller.play(playOptions);
      return sequenceMotion(live(target), controller);
    }
  };
}

function motion<S extends Visualization>(chart: LiveChart<S>, controller: VisualizationTransition): LiveMotion<S> {
  return {
    chart,
    controller,
    pause() { controller.pause(); return this; },
    progress(value) { controller.progress(value); return this; },
    resize() { controller.resize(); return this; },
    destroy() { controller.destroy(); }
  };
}

function sequenceMotion(chart: LiveChart, controller: Awaited<ReturnType<typeof createSequence>>): LiveSequenceMotion {
  return {
    chart,
    controller,
    pause() { controller.pause(); return this; },
    progress(value) { controller.progress(value); return this; },
    resize() { controller.resize(); return this; },
    destroy() { controller.destroy(); }
  };
}

function requireMounted(target: Element) {
  const current = mountedAt(target);
  if (!current) throw new Error('The selected chart is no longer mounted.');
  return current;
}

function resolveTarget(target: Target): Element {
  if (typeof target !== 'string') return target;
  const node = document.querySelector(target);
  if (!node) throw new Error(`VisDelta target not found: ${target}`);
  return node;
}

function stagingMount(host: Element, height: number | undefined): HTMLDivElement {
  const staging = document.createElement('div');
  const width = Math.max(60, host.clientWidth || 720);
  const measuredHeight = Math.max(1, host.clientHeight || height || 500);
  staging.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${measuredHeight}px;visibility:hidden;pointer-events:none;`;
  document.body.append(staging);
  return staging;
}
