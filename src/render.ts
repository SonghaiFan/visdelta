import { parseSpec, stringifySpec, visualizationChartModule } from './core.js';
import type { Visualization } from './core.js';
import type { ChartModule } from './charts/module.js';
import type { Target, ViewSpec } from './types/index.js';
import { cloneState } from './grammar/view-state.js';
import { transitionWithModules } from './transition.js';
import type { TransitionOptions, VisualizationTransition } from './transition.js';
import { createSpecDataResolver } from './runtime/resolve-spec-data.js';
import { resolveTarget } from './runtime/target.js';
import { assertCanvasSize } from './runtime/canvas-size.js';

import { editJSON, parseEdit } from './fluent-edits.js';
import type { EditMessage } from './fluent-edits.js';
export type { EditMessage, FluentEdit } from './fluent-edits.js';

export type ChartInput = string | Visualization;
export interface RenderOptions extends Omit<TransitionOptions, 'target'> {
  updates?: { policy?: 'latest'; /** Milliseconds per route stage. */ duration?: number };
}
export interface UpdateOptions {
  animate?: boolean;
  /** Milliseconds per route stage. */
  duration?: number;
  /** Replaces the named dataset bindings for this update and subsequent updates. */
  data?: Record<string, unknown>;
}
export interface UpdateResult {
  status: 'applied' | 'superseded' | 'destroyed';
  /** Acceptance revision; absent if destroyed or superseded before acceptance. */
  revision?: number;
}
export interface ChartSnapshot { revision: number; spec: ViewSpec }
export interface ChartView {
  edit(message: EditMessage | string, options?: UpdateOptions): Promise<UpdateResult>;
  update(spec: ChartInput, options?: UpdateOptions): Promise<UpdateResult>;
  /** Immediate replacement, scheduled with the same latest policy. */
  render(spec: ChartInput, options?: Omit<UpdateOptions, 'animate'>): Promise<UpdateResult>;
  /** Latest validated, accepted declaration, not the current animation frame. */
  snapshot(): ChartSnapshot;
  /** Exclusive manual control. Finish at an endpoint before submitting updates. */
  transition(spec: ChartInput, options?: Pick<UpdateOptions, 'data'>): Promise<VisualizationTransition>;
  resize(options?: Pick<TransitionOptions, 'width' | 'height'>): void;
  destroy(): void;
}
export interface ChartRenderer {
  render(target: Target, spec: ChartInput, options?: RenderOptions): Promise<ChartView>;
}

function duration(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error('duration must be a finite non-negative number.');
  return value;
}
function declaration(input: ChartInput) {
  return typeof input === 'string' ? parseSpec(input) : parseSpec(stringifySpec(input));
}

/** A renderer owns its module list; it neither reads nor writes global registrations. */
export function createRenderer({ modules }: { modules: readonly ChartModule<any>[] }): ChartRenderer {
  const ownedModules = [...modules];
  return { async render(target, input, options = {}) {
    if (options.updates?.policy !== undefined && options.updates.policy !== 'latest') {
      throw new Error('Only the latest update policy is supported.');
    }
    const defaultDuration = duration(options.updates?.duration ?? 600);
    const host = resolveTarget(target);
    const size = { width: options.width, height: options.height };
    assertCanvasSize('render width', size.width);
    assertCanvasSize('render height', size.height);
    let bindings = cloneState(options.data ?? {});
    let accepted = declaration(input);
    let settled = await createSpecDataResolver(bindings)(accepted);
    const builderModule = typeof input === 'string' ? null : visualizationChartModule(input);
    const localModules = builderModule ? [builderModule, ...ownedModules] : ownedModules;
    let revision = 0;
    let acceptedId = 0;
    let submitted = 0;
    let destroyed = false;
    let busy = false;
    let frame: number | undefined;
    let pending: Job | undefined;
    const jobs = new Set<Job>();
    const mounts = new Set<HTMLElement>();
    const editWaiters = new Set<() => void>();
    let live: Mounted;
    let manual: { from: ViewSpec; to: ViewSpec; playing: boolean } | undefined;
    let preparingManual = false;

    interface Mounted { controller: VisualizationTransition; mount: HTMLElement }
    interface Job {
      id: number; spec: ViewSpec; resolved?: ViewSpec; data: Record<string, unknown>;
      options: UpdateOptions; revision?: number;
      resolve(result: UpdateResult): void; reject(error: unknown): void;
    }
    function alive() { if (destroyed) throw new Error('This chart view has been destroyed.'); }
    function dispose(value: Mounted) { value.controller.destroy(); value.mount.remove(); mounts.delete(value.mount); }
    async function prepare(from: ViewSpec, to: ViewSpec): Promise<Mounted> {
      const mount = document.createElement('div');
      // A connected, explicitly sized hidden host preserves inherited theme and measurements.
      mount.style.cssText = `position:absolute;top:0;left:0;visibility:hidden;pointer-events:none;width:${host.clientWidth}px;height:${host.clientHeight}px;`;
      mount.setAttribute('aria-hidden', 'true');
      mounts.add(mount);
      host.append(mount);
      try {
        const controller = await transitionWithModules(from, to, {
          target: mount, chartStyle: options.chartStyle, ...size,
        }, localModules);
        if (destroyed) { controller.destroy(); throw new Error('This chart view has been destroyed.'); }
        return { controller, mount };
      } catch (error) { mount.remove(); mounts.delete(mount); throw error; }
    }
    function commit(next: Mounted) {
      next.mount.style.cssText = size.height === 'auto' ? 'height:100%' : '';
      next.mount.removeAttribute('aria-hidden');
      // Refit before removing the old view; a failed resize is still transactional.
      next.controller.resize(size);
      if (live && live !== next) dispose(live);
      live = next;
    }
    function finish(job: Job, status: UpdateResult['status']) {
      jobs.delete(job);
      job.resolve({ status, ...(job.revision === undefined ? {} : { revision: job.revision }) });
    }
    async function drain() {
      if (busy || destroyed || !pending) return;
      const job = pending;
      pending = undefined;
      busy = true;
      let candidate: Mounted | undefined;
      try {
        candidate = await prepare(settled, job.resolved!);
        if (destroyed) { dispose(candidate); return; }
        commit(candidate);
        candidate = undefined;
        const end = () => {
          settled = job.resolved!;
          finish(job, 'applied');
          busy = false;
          void drain();
        };
        if (job.options.animate === false || job.options.duration === 0) {
          live.controller.progress(1);
          end();
        } else {
          live.controller.play({ duration: job.options.duration });
          const poll = () => {
            if (destroyed) return;
            if (live.controller.value === 1) { frame = undefined; end(); }
            else frame = requestAnimationFrame(poll);
          };
          frame = requestAnimationFrame(poll);
        }
      } catch (error) {
        if (candidate) dispose(candidate);
        jobs.delete(job);
        if (!destroyed) job.reject(error);
        busy = false;
        void drain();
      }
    }
    live = await prepare(settled, settled);
    try { commit(live); } catch (error) { dispose(live); throw error; }
    function releaseManual() {
      if (preparingManual || (manual && (manual.playing || (live.controller.value !== 0 && live.controller.value !== 1)))) {
        throw new Error('Finish the manual transition at an endpoint before submitting another state.');
      }
      if (manual) {
        settled = live.controller.value === 1 ? manual.to : manual.from;
        manual = undefined;
      }
    }
    async function submitUpdate(next: ChartInput, updateOptions: UpdateOptions = {}, expectedRevision?: number, resolveData?: ReturnType<typeof createSpecDataResolver>): Promise<UpdateResult> {
        alive();
        releaseManual();
        const spec = declaration(next);
        if (spec.mark !== accepted.mark) throw new Error('update() requires the same chart type.');
        const settings = { ...updateOptions, duration: duration(updateOptions.duration ?? defaultDuration) };
        const data = cloneState(updateOptions.data ?? bindings);
        const id = ++submitted;
        return new Promise<UpdateResult>((resolve, reject) => {
          const job: Job = { id, spec, data, options: settings, resolve, reject };
          jobs.add(job);
          void (async () => {
            let validation: Mounted | undefined;
            try {
              job.resolved = await (resolveData ?? createSpecDataResolver(data))(spec);
              if (destroyed) return;
              validation = await prepare(job.resolved, job.resolved);
              dispose(validation);
              validation = undefined;
              if (destroyed) return;
              if (expectedRevision !== undefined) checkRevision(expectedRevision);
              if (id < acceptedId) { finish(job, 'superseded'); return; }
              acceptedId = id;
              accepted = spec;
              bindings = data;
              job.revision = ++revision;
              if (pending) finish(pending, 'superseded');
              pending = job;
              void drain();
            } catch (error) {
              if (validation) dispose(validation);
              jobs.delete(job);
              if (!destroyed) reject(error);
            }
          })();
        });
    }
    function checkRevision(expected: number) {
      if (expected !== revision) throw Object.assign(new Error(`Stale edit: expected revision ${expected}, current revision ${revision}. Read snapshot() and submit a new request.`), { code: 'REVISION_CONFLICT', revision });
    }
    const requests = new Map<string, { fingerprint: string; result: Promise<UpdateResult> }>();
    const view: ChartView = {
      update: submitUpdate,
      async edit(input, settings = {}) {
        alive();
        const message = parseEdit(input);
        // Dataset replacements belong to update(); edits retain current bindings.
        if (settings.data !== undefined) throw new Error('Use update() to replace data bindings.');
        const frozenSettings = { animate: settings.animate ?? true, duration: duration(settings.duration ?? defaultDuration) };
        const fingerprint = editJSON({ message, settings: frozenSettings });
        const previous = requests.get(message.requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new Error('requestId already used for different edits or options.');
          return previous.result;
        }
        // Never evict a toggle request and accidentally execute a retry twice.
        if (requests.size >= 1024) throw new Error('This view has reached its 1024 edit request limit. Create a new view.');
        const operation = (async () => {
          releaseManual();
          checkRevision(message.baseRevision);
          const source = cloneState(accepted);
          const module = localModules.find(module => module.key === source.mark);
          if (!module?.edit) throw new Error(`Chart module "${source.mark}" does not support fluent edits.`);
          const resolveData = createSpecDataResolver(bindings);
          const resolved = await resolveData(source);
          const candidate = await module.edit(source, message.edits, resolved);
          alive();
          checkRevision(message.baseRevision);
          return submitUpdate(candidate, frozenSettings, message.baseRevision, resolveData);
        })();
        const result = new Promise<UpdateResult>((resolve, reject) => {
          const onDestroy = () => resolve({ status: 'destroyed' });
          editWaiters.add(onDestroy);
          operation.then(value => { editWaiters.delete(onDestroy); resolve(value); }, error => { editWaiters.delete(onDestroy); reject(error); });
        });
        requests.set(message.requestId, { fingerprint, result });
        return result;
      },
      render(next, settings) { return view.update(next, { ...settings, animate: false }); },
      snapshot() { alive(); return { revision, spec: cloneState(accepted) }; },
      async transition(next, settings = {}) {
        alive();
        releaseManual();
        if (busy || jobs.size) throw new Error('Wait for pending updates before preparing a manual transition.');
        const spec = declaration(next);
        if (spec.mark !== accepted.mark) throw new Error('transition() requires the same chart type.');
        const data = cloneState(settings.data ?? bindings);
        preparingManual = true;
        let candidate: Mounted | undefined;
        try {
          const resolved = await createSpecDataResolver(data)(spec);
          alive();
          candidate = await prepare(settled, resolved);
          commit(candidate);
          candidate = undefined;
          accepted = spec;
          bindings = data;
          revision++;
          manual = { from: settled, to: resolved, playing: false };
          const owned = manual;
          const controller = live.controller;
          // Keep native fluent controls while tracking whether an endpoint is stable.
          const proxy: VisualizationTransition = new Proxy(controller, {
            get(target, key) {
              if (key === 'destroy') return () => { if (manual === owned) view.destroy(); };
              const assertOwned = () => { alive(); if (manual !== owned) throw new Error('This manual transition has been released.'); };
              if (key === 'play') return (...args: Parameters<VisualizationTransition['play']>) => {
                assertOwned();
                target.play(...args);
                owned.playing = true;
                const end = Math.max(0, Math.min(1, args[0]?.to ?? 1));
                if (frame !== undefined) cancelAnimationFrame(frame);
                const poll = () => {
                  if (destroyed || manual !== owned) return;
                  if (target.value === end) { owned.playing = false; frame = undefined; }
                  else frame = requestAnimationFrame(poll);
                };
                poll();
                return proxy;
              };
              if (key === 'resize') return (size?: Parameters<VisualizationTransition['resize']>[0]) => { assertOwned(); view.resize(size); return proxy; };
              if (key === 'pause' || key === 'progress') return (...args: number[]) => {
                assertOwned();
                if (key === 'pause') target.pause(); else target.progress(args[0]);
                owned.playing = false;
                if (frame !== undefined) cancelAnimationFrame(frame);
                frame = undefined;
                return proxy;
              };
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          return proxy;
        } finally {
          if (candidate) dispose(candidate);
          preparingManual = false;
        }
      },
      resize(next = {}) {
        alive();
        assertCanvasSize('resize width', next.width);
        assertCanvasSize('resize height', next.height);
        if (next.width !== undefined) size.width = next.width;
        if (next.height !== undefined) size.height = next.height;
        live.mount.style.cssText = size.height === 'auto' ? 'height:100%' : '';
        live.controller.resize(size);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (frame !== undefined) cancelAnimationFrame(frame);
        dispose(live);
        for (const mount of mounts) mount.remove();
        mounts.clear();
        pending = undefined;
        for (const job of jobs) finish(job, 'destroyed');
        for (const finishEdit of editWaiters) finishEdit();
        editWaiters.clear();
      },
    };
    return view;
  } };
}
