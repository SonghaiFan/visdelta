import { chartError, chartFailure } from './edit-errors.js';
export type { ChartErrorDetails } from './edit-errors.js';
import { observeChart, captureChart } from './runtime/chart-observation.js';
import type { ChartObservation, ChartCapture } from './runtime/chart-observation.js';
export type { ChartObservation, ChartCapture, ChartMarkObservation } from './runtime/chart-observation.js';
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
export interface ChartCapabilities {
  mark: string;
  fluentEdits: boolean;
  /** null means an adapter exists but did not publish a method list. */
  editMethods: string[] | null;
}
export interface ChartView {
  /** Capabilities of the latest accepted chart, not the visible animation frame. */
  capabilities(): ChartCapabilities;
  /** Validate an exact batch against current accepted state without accepting it or consuming its request ID. */
  previewEdit(message: EditMessage | string): Promise<ChartSnapshot>;
  edit(message: EditMessage | string, options?: UpdateOptions): Promise<UpdateResult>;
  update(spec: ChartInput, options?: UpdateOptions): Promise<UpdateResult>;
  /** Complete state replacement; different chart types fade in without a geometric morph. */
  replace(spec: ChartInput, options?: UpdateOptions): Promise<UpdateResult>;
  /** Immediate replacement, scheduled with the same latest policy. */
  render(spec: ChartInput, options?: Omit<UpdateOptions, 'animate'>): Promise<UpdateResult>;
  /** Latest validated, accepted declaration, not the current animation frame. */
  snapshot(): ChartSnapshot;
  inspectMarks(): ChartObservation;
  capture(): Promise<ChartCapture>;
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
    let geometryRevision = 0;

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
        const changingType = settled.mark !== job.resolved!.mark;
        candidate = await prepare(changingType ? job.resolved! : settled, job.resolved!);
        if (destroyed) { dispose(candidate); return; }
        commit(candidate);
        candidate = undefined;
        const end = () => {
          settled = job.resolved!;
          finish(job, 'applied');
          busy = false;
          void drain();
        };
        if (changingType && job.options.animate !== false && job.options.duration !== 0) {
          live.controller.progress(1);
          const mount = live.mount, started = performance.now(), elapsed = job.options.duration ?? defaultDuration;
          mount.style.opacity = '0';
          const fade = () => {
            if (destroyed) return;
            const progress = Math.min(1, (performance.now() - started) / elapsed);
            mount.style.opacity = String(progress);
            if (progress >= 1) { mount.style.removeProperty('opacity'); frame = undefined; end(); }
            else frame = requestAnimationFrame(fade);
          };
          frame = requestAnimationFrame(fade);
        } else if (job.options.animate === false || job.options.duration === 0) {
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
    async function submitUpdate(next: ChartInput, updateOptions: UpdateOptions = {}, expectedRevision?: number, resolveData?: ReturnType<typeof createSpecDataResolver>, allowChartChange = false): Promise<UpdateResult> {
        alive();
        releaseManual();
        let spec: ViewSpec;
        try { spec = declaration(next); } catch (error) { throw chartFailure(error, 'INVALID_CHART_STATE', 'Submit one complete valid ViewSpec.'); }
        if (!allowChartChange && spec.mark !== accepted.mark) throw chartError('CHART_TYPE_MISMATCH', 'update() requires the same chart type. Use replace() with a complete declaration.', 'Use replace() for a different chart type.', { chartType: spec.mark });
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
              if (!destroyed) reject(chartFailure(error, 'INVALID_CHART_STATE', 'Correct the complete declaration using the chart documentation; previous accepted intent is retained.', spec.mark));
            }
          })();
        });
    }
    function checkRevision(expected: number) {
      if (expected !== revision) throw chartError('REVISION_CONFLICT', `Stale edit: expected revision ${expected}, current revision ${revision}. Read snapshot() and submit a new request.`, 'Read snapshot() and use a new request ID with the current revision.', { revision });
    }
    function editMessage(input: EditMessage | string) {
      try { return parseEdit(input); }
      catch (error) { throw chartFailure(error, 'INVALID_EDIT_MESSAGE', 'Supply requestId, integer baseRevision, and 1–32 method/args edits.'); }
    }
    async function deriveEdit(message: EditMessage) {
      checkRevision(message.baseRevision);
      const source = cloneState(accepted);
      const module = localModules.find(module => module.key === source.mark);
      if (!module?.edit) throw chartError('UNSUPPORTED_EDIT', `Chart module "${source.mark}" does not support fluent edits.`, 'Use update() with a complete declaration.', { chartType: source.mark });
      const unsupported = module.editMethods && message.edits.find(call => !module.editMethods!.includes(call.method));
      if (unsupported) throw chartError('UNSUPPORTED_EDIT', `Chart module "${source.mark}" does not support edit ${unsupported.method}.`, 'Read capabilities().editMethods; use a complete supported state or choose another supported operation.', { chartType: source.mark, method: unsupported.method, editIndex: message.edits.indexOf(unsupported), path: `/edits/${message.edits.indexOf(unsupported)}/method` });
      const resolveData = createSpecDataResolver(bindings);
      const resolved = await resolveData(source);
      let candidate: ViewSpec;
      try { candidate = await module.edit(source, message.edits, resolved); }
      catch (error) { throw chartFailure(error, 'INVALID_EDIT_STATE', 'Correct the arguments or submit a complete state with update().', source.mark); }
      alive();
      checkRevision(message.baseRevision);
      return { candidate, resolveData };
    }
    const requests = new Map<string, { fingerprint: string; result: Promise<UpdateResult> }>();
    const view: ChartView = {
      update: submitUpdate,
      capabilities() {
        alive();
        const module = localModules.find(module => module.key === accepted.mark);
        return { mark: accepted.mark!, fluentEdits: !!module?.edit,
          editMethods: module?.edit ? (module.editMethods ? [...module.editMethods] : null) : [] };
      },
      async previewEdit(input) {
        alive();
        if (preparingManual || manual) throw new Error('Finish and release the manual transition before previewing edits.');
        const message = editMessage(input);
        let validation: Mounted | undefined;
        try {
          const { candidate, resolveData } = await deriveEdit(message);
          const spec = declaration(candidate);
          if (spec.mark !== accepted.mark) throw chartError('CHART_TYPE_MISMATCH', 'An edit must retain the chart type.', 'Use replace() for a different chart type.', { chartType: spec.mark });
          const resolved = await resolveData(spec);
          alive();
          validation = await prepare(resolved, resolved);
          alive();
          checkRevision(message.baseRevision);
          return { revision: message.baseRevision, spec: cloneState(spec) };
        } catch (error) {
          throw chartFailure(error, 'INVALID_CHART_STATE', 'Correct the candidate; preview has not accepted any changes.', accepted.mark);
        } finally { if (validation) dispose(validation); }
      },
      async edit(input, settings = {}) {
        alive();
        const message = editMessage(input);
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
          const { candidate, resolveData } = await deriveEdit(message);
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
      replace(next, settings) { return submitUpdate(next, settings, undefined, undefined, true); },
      render(next, settings) { return view.update(next, { ...settings, animate: false }); },
      inspectMarks() {
        alive(); if (busy || jobs.size || editWaiters.size || preparingManual || manual) throw new Error('Wait for settled chart updates before observation.');
        return observeChart(live.controller.view, revision);
      },
      async capture() {
        alive(); if (busy || jobs.size || editWaiters.size || preparingManual || manual) throw new Error('Wait for settled chart updates before capture.');
        const observedRevision = revision; const observedGeometry = geometryRevision; const observed = live;
        const image = await captureChart(live.controller.view, revision);
        alive(); if (revision !== observedRevision || geometryRevision !== observedGeometry || observed !== live || busy || jobs.size || editWaiters.size || preparingManual || manual) throw new Error('Chart changed during capture. Capture again.');
        return image;
      },
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
        // Preserve a replacement fade while changing layout.
        live.mount.style.height = size.height === 'auto' ? '100%' : '';
        geometryRevision++;
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
