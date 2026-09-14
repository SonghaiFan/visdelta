import type { ViewSpec, DiffResult, RuntimeOptions } from './types/index.js';
import { cloneState } from './grammar/view-state.js';
import { delta, visualizationChartModule, visualizationSpec } from './core.js';
import type { Visualization } from './core.js';
import type { ChartModule } from './charts/module.js';
import { normalizeDataSource } from './charts/authoring.js';
import { loadData } from './runtime/data.js';
import { createTransitionSurface } from './runtime/transition-surface.js';
import { transitionRegistry } from './runtime/chart-registry.js';
import { validateTransforms } from './data/validate.js';
import { createChartRuntimeDeps } from './runtime/chart-deps.js';
import { resolveTarget } from './runtime/target.js';
import { d3ChartStyle } from './charts/style.js';
import { resolveSpecDataTypes } from './data/types.js';
import { registerMounted, unregisterMounted } from './runtime/mounted.js';

export type { Visualization } from './core.js';

export interface TransitionOptions extends RuntimeOptions {
  /** Named sources for visualizations that use .data("name"). */
  data?: Record<string, unknown>;
  height?: number;
}

export interface PlayOptions {
  /** Time for the complete 0–1 interval, in milliseconds. */
  duration?: number;
  from?: number;
  to?: number;
}

export interface VisualizationTransition {
  readonly from: ViewSpec;
  readonly to: ViewSpec;
  readonly delta: DiffResult;
  readonly view: Element;
  readonly value: number;
  /** Synchronously display a frame. Direction is inferred from the previous value. */
  progress(value: number): VisualizationTransition;
  /** Plays from 0 to 1 by default. Returns this controller for chaining. */
  play(options?: PlayOptions): VisualizationTransition;
  pause(): VisualizationTransition;
  /** Recompile at the container's current size/theme, retaining progress and data. */
  resize(): VisualizationTransition;
  destroy(): void;
}

/** Compile two states of the same chart type into a standalone, seekable transition. */
export async function transition(
  from: Visualization,
  to: Visualization,
  options: TransitionOptions
): Promise<VisualizationTransition> {
  const localModules = [visualizationChartModule(from), visualizationChartModule(to)]
    .filter((module): module is ChartModule => module !== null);
  const source = visualizationSpec(from);
  const target = visualizationSpec(to);
  if (!source.mark || source.mark !== target.mark) {
    throw new Error('transition() requires two states of the same chart type.');
  }
  for (const module of localModules) {
    if (normalizeChartKey(module.key) !== normalizeChartKey(source.mark)) {
      throw new Error(`Visualization uses chart module "${module.key}" but declares mark "${source.mark}".`);
    }
  }
  if (!options?.d3) {
    throw new Error('Pass { target, d3 } to transition().');
  }
  validateTransforms(source.transform ?? []);
  validateTransforms(target.transform ?? []);
  const declared = cloneState(options.data ?? {});
  const sourceCache = new Map<string, Promise<unknown[]>>();
  const resolveData = async (spec: ViewSpec): Promise<ViewSpec> => {
    let data = normalizeDataSource(spec.data);
    if (typeof data === 'string' || (data && typeof data === 'object' && 'name' in data && !('url' in data))) {
      const name = typeof data === 'string' ? data : String((data as { name: string }).name);
      if (!(name in declared)) throw new Error(`transition(): missing dataset "${name}". Pass options.data or bind inline data.`);
      data = normalizeDataSource(declared[name]);
    }
    if (!data || typeof data !== 'object') throw new Error('transition(): each visualization needs a data source.');
    if (!Array.isArray(data) && !Array.isArray((data as { values?: unknown }).values) && !('url' in data)) {
      throw new Error('transition(): expected rows, { values }, or { url }.');
    }
    if (!Array.isArray(data) && 'url' in data) {
      const urlSource = data as { url: string; type?: string; format?: { type?: string } };
      data = { ...urlSource, type: urlSource.type ?? urlSource.format?.type ?? (/\.json(?:[?#]|$)/i.test(urlSource.url) ? 'json' : 'csv') };
    }
    const cacheKey = JSON.stringify(data);
    let pending = sourceCache.get(cacheKey);
    if (!pending) {
      pending = loadData({ rows: data }, options.d3).then(result => cloneState(result.rows));
      sourceCache.set(cacheKey, pending);
    }
    const rows = await pending;
    return resolveSpecDataTypes({ ...spec, data: { values: rows } }, rows);
  };
  const [resolvedFrom, resolvedTo] = await Promise.all([resolveData(source), resolveData(target)]);
  const host = resolveTarget(options.target ?? '#app');
  const chartStyle = options.chartStyle ?? d3ChartStyle;
  const chartTypes = await transitionRegistry(resolvedFrom, createChartRuntimeDeps({ root: host, chartStyle }), localModules);
  const surface = createTransitionSurface(resolvedFrom, resolvedTo, { ...options, chartStyle }, chartTypes);
  let value = 0;
  let lastDirection = 1;
  let animation: number | null = null;
  let destroyed = false;

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
  const controller: VisualizationTransition = {
    // Expose copies: caller inspection cannot change the rendered endpoints.
    from: cloneState(source),
    to: cloneState(target),
    delta: delta(resolvedFrom, resolvedTo),
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
      const span = duration * Math.abs(end - start);
      if (!span) { show(end, direction); return controller; }
      let started: number | null = null;
      const tick = (now: number) => {
        started ??= now;
        const fraction = Math.min(1, (now - started) / span);
        show(start + (end - start) * fraction, direction);
        animation = fraction < 1 ? requestAnimationFrame(tick) : null;
      };
      animation = requestAnimationFrame(tick);
      return controller;
    },
    pause() { assertAlive(); stop(); return controller; },
    resize() { assertAlive(); surface.resize(); show(value, lastDirection); return controller; },
    destroy() {
      if (destroyed) return;
      stop();
      surface.destroy();
      destroyed = true;
      unregisterMounted(host, controller);
    }
  };
  try {
    show(0);
    surface.commitMount();
    registerMounted(host, to, options, controller);
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
