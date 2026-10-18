import { createSpecDataResolver } from './runtime/resolve-spec-data.js';
import type { TransitionInspection } from './runtime/inspection.js';
export type { TransitionInspection, InspectedStage, InspectedProperty } from './runtime/inspection.js';
import type { ViewSpec, DeltaResult, RuntimeOptions, DeclarationOperationChange, StateChange } from './types/index.js';
import { cloneState } from './grammar/view-state.js';
import { delta, visualizationChartModule, visualizationSpec } from './core.js';
import type { Visualization } from './core.js';
import type { ChartModule } from './charts/module.js';
import { createTransitionSurface } from './runtime/transition-surface.js';
import { transitionRegistry } from './runtime/chart-registry.js';
import { validateTransforms } from './data/validate.js';
import { createChartRuntime } from './runtime/chart-runtime.js';
import { resolveTarget } from './runtime/target.js';
import { d3ChartStyle } from './charts/style.js';
import type { TimedVisualizationTransition } from './runtime/transition-controller.js';
import { assertCanvasSize, contentHeight } from './runtime/canvas-size.js';
import type { CanvasSize } from './runtime/canvas-size.js';

export type { CanvasSize } from './runtime/canvas-size.js';

export type { Visualization } from './core.js';

export interface TransitionOptions extends RuntimeOptions {
  /** Named sources for visualizations that use .data("name"). */
  data?: Record<string, unknown>;
  /**
   * Outer width of the canvas (the SVG), margins included, as in Observable Plot.
   * A number is a fixed width in pixels: a container narrower than that overflows
   * instead of the chart shrinking. `"auto"` makes the canvas exactly the
   * container's content width and re-fits when it changes; the figure's own
   * border gives way on that axis. Omitted: the container's width, inside the
   * figure's own border.
   */
  width?: CanvasSize;
  /**
   * Outer height of the canvas (the SVG), margins included. A number is a fixed
   * height in pixels and overrides the chart's default. `"auto"` makes the canvas
   * exactly the container's content height and re-fits when it changes; the
   * figure's border gives way. The container needs a height
   * of its own (a fixed height, a flex or grid track), otherwise the chart keeps
   * its default height. Omitted: the chart's default height.
   */
  height?: CanvasSize;
}

export interface PlayOptions {
  /** Milliseconds for one serial route stage. Defaults to 800. */
  duration?: number;
  /** Start progress, clamped to [0, 1]. Defaults to 0. */
  from?: number;
  /** End progress, clamped to [0, 1]. Defaults to 1. */
  to?: number;
}

export interface VisualizationTransition {
  /** Defensive copy of the resolved start state. */
  readonly from: ViewSpec;
  /** Defensive copy of the resolved end state. */
  readonly to: ViewSpec;
  /** Semantic difference between the resolved endpoints, as returned by delta(). */
  readonly delta: DeltaResult;
  /** The mounted chart-view element. */
  readonly view: Element;
  /** Current progress from 0 to 1. */
  readonly value: number;
  /** Synchronously display a frame. Direction is inferred from the previous value. */
  progress(value: number): VisualizationTransition;
  /** Plays from 0 to 1 by default. Returns this controller for chaining. */
  play(options?: PlayOptions): VisualizationTransition;
  /** Stop owned playback at the current frame. */
  pause(): VisualizationTransition;
  /**
   * Recompile at the container's current size/theme, retaining progress and data.
   * `width` and `height` change the requested canvas size as in `TransitionOptions`;
   * a dimension left out keeps its current request.
   */
  resize(options?: { width?: CanvasSize; height?: CanvasSize }): VisualizationTransition;
  /**
   * Serial route stages planned for this pair (at least 1). Stages split progress
   * equally and `play({ duration })` gives each one `duration` ms, so a full
   * play lasts `stageCount() × duration`.
   */
  stageCount(): number;
  /** Semantic changes for each actual route stage, in authored playback order. */
  stageChanges(): StateChange[][];
  /** Exact planner operation per route stage; undefined for direct or chart-refined stages. */
  stageOperations(): Array<DeclarationOperationChange | undefined>;
  /** Read compiled SVG property tracks without pausing or seeking playback. */
  inspect(): Promise<TransitionInspection>;
  /** Stop playback and remove the mounted transition. The controller cannot be used afterwards. */
  destroy(): void;
}

/** Compile two states of the same chart type into a standalone, seekable transition. */
export async function transition(
  from: Visualization,
  to: Visualization,
  options: TransitionOptions
): Promise<VisualizationTransition> {
  return transitionWithModules(from, to, options);
}

/** Internal scoped entry used by persistent renderers. */
export async function transitionWithModules(
  from: Visualization, to: Visualization, options: TransitionOptions,
  modules?: ChartModule<any>[]
): Promise<VisualizationTransition> {
  const localModules = modules ?? [visualizationChartModule(from), visualizationChartModule(to)]
    .filter((module): module is ChartModule => module !== null);
  const source = visualizationSpec(from);
  const target = visualizationSpec(to);
  if (!source.mark || source.mark !== target.mark) {
    throw new Error('transition() requires two states of the same chart type.');
  }
  for (const module of modules ? [] : localModules) {
    if (normalizeChartKey(module.key) !== normalizeChartKey(source.mark)) {
      throw new Error(`Visualization uses chart module "${module.key}" but declares mark "${source.mark}".`);
    }
  }
  validateTransforms(source.transform ?? []);
  validateTransforms(target.transform ?? []);
  assertCanvasSize('transition() width', options.width);
  assertCanvasSize('transition() height', options.height);
  const resolveData = createSpecDataResolver(options.data);
  const [resolvedFrom, resolvedTo] = await Promise.all([resolveData(source), resolveData(target)]);
  const transitionDelta = delta(resolvedFrom, resolvedTo);
  const host = resolveTarget(options.target);
  const chartStyle = options.chartStyle ?? d3ChartStyle;
  const renderContext = { root: host, chartStyle };
  const chartTypes = await transitionRegistry(resolvedFrom, createChartRuntime(renderContext), localModules, modules !== undefined);
  const surface = createTransitionSurface(resolvedFrom, resolvedTo, {
    ...options, chartStyle
  }, chartTypes);
  // A sequence moves this root between its preparation mount and visible host.
  // Keep theme, color and text measurements bound to the chart itself rather
  // than the now-empty preparation mount after that handoff.
  renderContext.root = surface.root;
  let value = 0;
  let lastDirection = 1;
  let animation: number | null = null;
  let destroyed = false;
  let resizeObserver: ResizeObserver | null = null;

  function assertAlive() {
    if (destroyed) throw new Error('This transition has been destroyed.');
  }
  function stop() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
  }
  function show(next: number, direction = lastDirection) {
    if (direction) lastDirection = direction;
    surface.progress(next, lastDirection);
    value = next;
  }
  const controller: TimedVisualizationTransition = {
    // Expose copies: caller inspection cannot change the rendered endpoints.
    from: cloneState(source),
    to: cloneState(target),
    delta: transitionDelta,
    view: surface.view,
    get value() { return value; },
    progress(next) {
      assertAlive();
      next = finiteProgress(next);
      const direction = Math.sign(next - value) || lastDirection;
      stop();
      show(next, direction);
      return controller;
    },
    play({ duration = 800, from = 0, to = 1 } = {}) {
      assertAlive();
      if (!Number.isFinite(duration) || duration < 0) throw new Error('duration must be a finite non-negative number.');
      const start = finiteProgress(from);
      const end = finiteProgress(to);
      const direction = Math.sign(end - start) || lastDirection;
      stop();
      show(start, direction);
      // Duration belongs to one semantic route stage. A planner may insert
      // complete intermediate states, so a full pair can take n × duration.
      // A partial seek keeps that same clock proportional to its route span.
      const span = duration * surface.stageCount() * Math.abs(end - start);
      if (!span) { show(end, direction); return controller; }
      // The play call is the clock origin. If the first animation frame becomes
      // the origin instead, that frame redraws progress(0) and creates a visible
      // dead beat between an authored state change and its projected motion.
      const started = performance.now();
      const tick = (now: number) => {
        const fraction = Math.max(0, Math.min(1, (now - started) / span));
        show(start + (end - start) * fraction, direction);
        animation = fraction < 1 ? requestAnimationFrame(tick) : null;
      };
      animation = requestAnimationFrame(tick);
      return controller;
    },
    pause() { assertAlive(); stop(); return controller; },
    stageCount() { return surface.stageCount(); },
    stageOperations() { assertAlive(); return cloneState(surface.stageOperations()); },
    stageChanges() { assertAlive(); return surface.stageStates().map(([from, to]) => delta(from, to).stateChanges); },
    inspect: surface.inspect,
    resize({ width, height } = {}) {
      assertAlive();
      assertCanvasSize('resize width', width);
      assertCanvasSize('resize height', height);
      surface.resize({ width, height }); show(value, lastDirection); return controller;
    },
    destroy() {
      if (destroyed) return;
      stop();
      resizeObserver?.disconnect();
      surface.destroy();
      destroyed = true;
    }
  };
  try {
    show(0);
    surface.commitMount();
    if (typeof ResizeObserver !== 'undefined') {
      // Re-fit when a dimension that follows the container changes.
      let width = host.clientWidth;
      let height = contentHeight(host);
      resizeObserver = new ResizeObserver(() => {
        if (destroyed) return;
        const follows = surface.follows();
        const changed = (follows.width && host.clientWidth !== width) || (follows.height && contentHeight(host) !== height);
        width = host.clientWidth;
        height = contentHeight(host);
        if (changed) controller.resize();
      });
      resizeObserver.observe(host);
    }
  } catch (error) {
    surface.rollbackMount();
    controller.destroy();
    throw error;
  }
  return controller;
}

function finiteProgress(value: number): number {
  if (!Number.isFinite(value)) throw new Error('progress must be a finite number.');
  return Math.max(0, Math.min(1, value));
}

function normalizeChartKey(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}
