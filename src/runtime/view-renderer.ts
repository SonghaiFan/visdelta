// @ts-nocheck — extracted rendering pipeline; D3 scene internals remain dynamic.
import { applyTransforms } from '../data/transforms.js';
import { resolveMarkRendererKey } from '../charts/index.js';
import { serializeViewSpec, specState } from '../spec-meta.js';
import { activeMarkLayer, applyPlotClip, drawUnsupported, effectiveTransitionSpec, fadeLayers, transitionSpec } from './marks.js';

import { domainTransforms, viewRows } from './data.js';
import { resolveSpecDataTypes } from '../data/types.js';
import { applySceneTransitions, getScene, resetSceneToEmptySource, resizeScene } from './scene.js';
import { clamp } from './utils.js';
import { VISDELTA_TRANSITION_NAME, clearSceneTransitionProgress, createSceneTransitionProgress } from '../transition-progress.js';
import { createViewCompiler } from './view-compile.js';
import type { AnyRecord } from '../types/index.js';
import type { ChartTypeRegistry } from '../charts/index.js';
import { viewLineageCorrespondence } from '../data/view-lineage.js';

/** Per-instance rendering pipeline for standalone transitions. */
export function createViewRenderer(chartTypes: ChartTypeRegistry) {
const { compileEffectiveView, compileTransitionSource } = createViewCompiler(chartTypes);
return { drawView, prepareSeekSourceState, compileTransitionSource,
  renderSeekPhase, applySeekSequence };
function drawView(node: any, viewSpec: AnyRecord, viewConfig: AnyRecord, datasets: AnyRecord, tooltip: Element, d3: AnyRecord, aq: AnyRecord, stepTransition: AnyRecord = {}, options: AnyRecord = {}) {
  const scene = getScene(node, viewConfig, d3);
  scene.progressRoots = [
    node,
    node.__visDeltaMarkName
  ].filter(Boolean);

  if (!viewSpec || !viewSpec.mark) {
    clearSeekSequence(scene);
    scene.empty.style("display", "grid").text("No view for this step.");
    fadeLayers(scene, null, null, d3);
    return;
  }

  scene.empty.style("display", "none");

  const { sceneTransition, effectiveViewSpec } = compileEffectiveView(viewSpec, stepTransition);
  const transitionSource = compileTransitionSource(
    options.previousViewSpec,
    options.previousTransition
  );

  if (scene.phaseTimer) {
    window.clearTimeout(scene.phaseTimer);
    scene.phaseTimer = null;
  }

  const seekableStep = Boolean(options.seekable);
  const rawSourceSpec = seekableStep
    ? transitionSource.effectiveViewSpec
    : scene.previousSpec;
  const chartType = chartTypes.get(effectiveViewSpec);
  const targetForPlan = prepareChartSpec(chartType, effectiveViewSpec, datasets);
  const sourceForPlan = prepareChartSpec(chartType, rawSourceSpec, datasets);
  const intermediatePhases = intermediateRenderPhases(chartType, sourceForPlan, targetForPlan);
  if (intermediatePhases.length) {
    const renderPhases = renderPhaseConfigs(intermediatePhases, {
      chartType,
      node,
      finalSpec: effectiveViewSpec,
      viewConfig,
      datasets,
      tooltip,
      d3,
      aq,
      seekable: seekableStep,
      finalSceneTransition: sceneTransition,
      transitionSource
    });

    if (seekableStep) {
      scene.seekSequence = createSeekSequence(renderPhases);
      renderSeekPhase(scene, 0);
      return;
    }

    clearSeekSequence(scene);
    renderPhaseSequence(scene, renderPhases, 0);
    return;
  }

  clearSeekSequence(scene);
  renderCompiledView(node, effectiveViewSpec, viewConfig, datasets, tooltip, d3, aq, sceneTransition, {
    transitionSource,
    seekable: seekableStep
  });
}

function renderCompiledView(node: any, effectiveViewSpec: AnyRecord, viewConfig: AnyRecord, datasets: AnyRecord, tooltip: Element, d3: AnyRecord, aq: AnyRecord, sceneTransition: AnyRecord = {}, renderOptions: AnyRecord = {}) {
  const scene = getScene(node, viewConfig, d3);
  const seekable = Boolean(renderOptions.seekable);
  if (seekable && !renderOptions.skipSourcePrep) {
    prepareSeekSourceState(
      node,
      viewConfig,
      datasets,
      tooltip,
      d3,
      aq,
      renderOptions.transitionSource
    );
  }
  clearSceneTransitionProgress(scene, { finish: !seekable });
  const chartType = chartTypes.get(effectiveViewSpec);
  const typedSpec = resolveSpecDataTypes(
    effectiveViewSpec,
    viewRows(effectiveViewSpec.data, datasets)
  );
  const renderSpec = chartType?.prepareSpec?.(typedSpec) || typedSpec;
  const previousRawSpec = seekable
    ? renderOptions.transitionSource?.effectiveViewSpec || null
    : scene.previousSpec;
  const previousSpec = prepareChartSpec(chartType, previousRawSpec, datasets);
  const source = viewRows(renderSpec.data, datasets);
  const rows = applyTransforms(source, renderSpec.transform || [], aq);
  const domainRows = applyTransforms(source, domainTransforms(renderSpec.transform || []), aq);
  if (!rows.length) {
    const emptyTransition = transitionSpec(renderSpec, previousSpec, { seekable, d3 });
    scene.empty.style("display", "grid").style('opacity', 0).text("No rows after transforms.")
      .transition(emptyTransition.base).style('opacity', 1);
    fadeLayers(scene, null, emptyTransition, d3);
    for (const layer of [scene.grid, scene.xAxis, scene.yAxis, scene.xLabel, scene.yLabel, scene.legend]) {
      layer.transition(emptyTransition.base).style('opacity', 0);
    }
    if (seekable) {
      scene.transitionProgress = createSceneTransitionProgress(scene, { transitionName: VISDELTA_TRANSITION_NAME });
    }
    scene.previousSpec = renderSpec;
    return;
  }

  const width = Math.max(60, node.clientWidth || 720);
  const height = viewConfig.height || effectiveViewSpec.height || 500;
  resizeScene(scene, width, height);

  const rendererKey = resolveMarkRendererKey(renderSpec);
  const margin = fitMargins(width, height, {
    top: 58,
    right: 44,
    bottom: 64,
    left: 68,
    ...(chartType?.defaultMargin?.(renderSpec) || {}),
    ...(effectiveViewSpec.margin || {}),
    ...(viewConfig.margin || {})
  });
  scene.svg
    .attr('class', `vd-chart vd-chart-${rendererKey}`)
    .attr('data-chart-type', rendererKey);
  const previousSource = previousSpec ? viewRows(previousSpec.data, datasets) : [];
  const previousRows = previousSpec
    ? applyTransforms(previousSource, previousSpec.transform || [], aq)
    : [];
  const observationChange = observationMembershipChange(previousSpec, renderSpec, previousRows, rows);
  const chartTransition = observationTransition(
    transitionSpec(renderSpec, previousSpec, { seekable, d3 } as AnyRecord),
    observationChange,
    { d3, seekable }
  );
  const transitionPlan = chartType?.resolveTransitionPlan?.(previousSpec, renderSpec) || {};
  const lineage = previousSpec ? viewLineageCorrespondence(previousSpec, renderSpec) : null;
  if (lineage) transitionPlan.lineage = lineage;
  const chart: AnyRecord = {
    scene,
    type: rendererKey,
    width,
    height,
    margin,
    transition: chartTransition,
    transitionPlan,
    sceneTransition,
    seekable,
    seekTransitionName: VISDELTA_TRANSITION_NAME,
    sourceRows: source,
    domainRows,
    aq
  };
  chart.innerWidth = chart.width - chart.margin.left - chart.margin.right;
  chart.innerHeight = chart.height - chart.margin.top - chart.margin.bottom;
  chart.frame = scene.frame.transition(chart.transition.base).attr(
    "transform",
    `translate(${chart.margin.left},${chart.margin.top})`
  );
  chart.g = activeMarkLayer(scene, rendererKey, chart.transition);
  applyPlotClip(chart, true);

  const renderer = chartType?.renderer;
  if (renderer) renderer(chart, rows, renderSpec, tooltip, d3);
  else drawUnsupported(chart, renderSpec, chartTypes.types());
  reflectCamera(scene, chart.camera);

  applySceneTransitions(chart, rows, renderSpec);
  if (seekable) {
    scene.transitionProgress = createSceneTransitionProgress(scene, {
      transitionName: VISDELTA_TRANSITION_NAME
    });
  }
  scene.previousSpec = renderSpec;
}

/**
 * A row-preserving change may remove observations without changing what a
 * remaining observation means. Keep the old coordinate system while those
 * marks leave, then move the shared view. Aggregation and reshaping have their
 * own chart-specific visual order and deliberately do not take this path.
 */
function observationMembershipChange(previousSpec, nextSpec, previousRows, nextRows) {
  if (!previousSpec || previousSpec.mark !== nextSpec?.mark) return { exit: false, enter: false };
  if ((previousSpec.transform || []).some((transform) => transform?.aggregate) ||
      (nextSpec.transform || []).some((transform) => transform?.aggregate)) return { exit: false, enter: false };
  return {
    exit: previousRows.length > nextRows.length,
    enter: nextRows.length > previousRows.length
  };
}

/**
 * Membership changes have one visual order: exiting marks leave in the
 * old view; then the scale moves; then entering marks appear in the new view.
 * A one-way add or remove simply omits the unused third.
 */
function observationTransition(transition, change, { d3, seekable }) {
  if (!change.exit && !change.enter) return transition;
  const totalDuration = Math.max(1, Number(transition.duration) || 900);
  const parts = 1 + Number(change.exit) + Number(change.enter);
  const partDuration = Math.max(1, Math.floor(totalDuration / parts));
  const exitDuration = change.exit ? partDuration : 0;
  const enterDuration = change.enter ? partDuration : 0;
  const scaleDuration = Math.max(1, totalDuration - exitDuration - enterDuration);
  const ease = transition.base.ease();
  const create = (duration, delay = 0) => {
    const next = seekable
      ? d3.transition(VISDELTA_TRANSITION_NAME)
      : d3.transition();
    return next.duration(duration).delay(delay).ease(ease);
  };
  return {
    ...transition,
    base: create(scaleDuration, exitDuration),
    ...(change.exit ? { exit: create(exitDuration) } : {}),
    ...(change.enter ? { enter: create(enterDuration, exitDuration + scaleDuration) } : {}),
    exitFirst: change.exit,
    enterLast: change.enter,
    exitDuration,
    scaleDuration,
    enterDuration,
    enterDelay: exitDuration + scaleDuration
  };
}

function reflectCamera(scene: AnyRecord, camera: AnyRecord | null | undefined) {
  const value = camera || { k: 1, x: 0, y: 0 };
  scene.svg
    .attr('data-camera-k', Number(value.k) || 1)
    .attr('data-camera-x', Number(value.x) || 0)
    .attr('data-camera-y', Number(value.y) || 0);
}

function fitMargins(width, height, margin) {
  const fitted = { ...margin };
  fitMarginPair(fitted, 'left', 'right', Math.max(0, width - 24));
  fitMarginPair(fitted, 'top', 'bottom', Math.max(0, height - 24));
  return fitted;
}

function fitMarginPair(margin, start, end, budget) {
  const total = Math.max(0, Number(margin[start]) || 0) + Math.max(0, Number(margin[end]) || 0);
  if (!total || total <= budget) return;
  const scale = budget / total;
  margin[start] = Math.max(0, margin[start] * scale);
  margin[end] = Math.max(0, margin[end] * scale);
}

function prepareChartSpec(chartType, spec, datasets = {}) {
  if (!spec) return null;
  const typed = resolveSpecDataTypes(spec, viewRows(spec.data, datasets));
  return chartType?.prepareSpec?.(typed) || typed;
}

function intermediateRenderPhases(chartType, sourceSpec, targetSpec) {
  const raw = chartType?.intermediateSpecs?.(sourceSpec, targetSpec) ?? [];
  const phases = Array.isArray(raw) ? raw : raw?.sequence || [raw];
  return phases
    .map((phase) => ({
      ...phase,
      spec: serializeViewSpec(phase?.spec || null)
    }))
    .filter((phase) => phase.spec);
}

function renderPhaseConfigs(intermediatePhases, context) {
  let source = context.transitionSource;
  const phases = intermediatePhases.map((phase) => {
    const sceneTransition = sceneTransitionForPhase(phase);
    const transitionPlanDuration = transitionPlanDurationForPhase(context.chartType, source?.effectiveViewSpec, phase.spec);
    const config = {
      node: context.node,
      spec: phase.spec,
      viewConfig: context.viewConfig,
      datasets: context.datasets,
      tooltip: context.tooltip,
      d3: context.d3,
      aq: context.aq,
      seekable: context.seekable,
      sceneTransition,
      transitionSource: source,
      transitionPlanDuration
    };
    source = {
      effectiveViewSpec: phase.spec,
      sceneTransition
    };
    return config;
  });

  phases.push({
    node: context.node,
    spec: context.finalSpec,
    viewConfig: context.viewConfig,
    datasets: context.datasets,
    tooltip: context.tooltip,
    d3: context.d3,
    aq: context.aq,
    seekable: context.seekable,
    sceneTransition: context.finalSceneTransition,
    transitionSource: source,
    transitionPlanDuration: transitionPlanDurationForPhase(context.chartType, source?.effectiveViewSpec, context.finalSpec)
  });

  return phases;
}

function transitionPlanDurationForPhase(chartType, previousSpec, nextSpec) {
  const plan = chartType?.resolveTransitionPlan?.(
    prepareChartSpec(chartType, previousSpec),
    prepareChartSpec(chartType, nextSpec)
  );
  const duration = Number(plan?.totalDuration);
  return Number.isFinite(duration) ? duration : null;
}

function sceneTransitionForPhase(phase) {
  const sceneType = phase.scene || "axis";
  const state = specState(phase.spec);
  return {
    scene: [sceneType],
    [sceneType]:
      state[sceneType] ||
      state.sceneState?.[sceneType] ||
      null
  };
}

function prepareSeekSourceState(node: any, viewConfig: AnyRecord, datasets: AnyRecord, tooltip: Element, d3: AnyRecord, aq: AnyRecord, transitionSource: AnyRecord = {}) {
  const scene = getScene(node, viewConfig, d3);
  const sourceSpec = transitionSource?.effectiveViewSpec || null;
  if (!sourceSpec) {
    resetSceneToEmptySource(scene);
    return;
  }

  renderCompiledView(
    node,
    sourceSpec,
    viewConfig,
    datasets,
    tooltip,
    d3,
    aq,
    transitionSource.sceneTransition || {},
    {
      seekable: true,
      skipSourcePrep: true,
      transitionSource: null
    }
  );
  scene.transitionProgress?.progress(1);
  clearSceneTransitionProgress(scene, { finish: true });
}


function phaseDuration(phaseOrSpec: AnyRecord = {}) {
  const spec = phaseOrSpec.spec || phaseOrSpec;
  const plannedDuration = Number(phaseOrSpec.transitionPlanDuration);
  if (Number.isFinite(plannedDuration)) return Math.max(1, plannedDuration);
  const transition = effectiveTransitionSpec(spec);
  const duration = Number(transition.duration);
  const fallbackDuration = Number(effectiveTransitionSpec({}).duration) || 900;
  const axis = specState(spec).sceneState?.axis || specState(spec).axis || {};
  const stepOrder = Array.isArray(axis.order)
    ? axis.order.filter((part) => part === "x" || part === "y")
    : [];
  const perStepDuration = Number(axis.duration);
  const effectiveDuration =
    stepOrder.length > 1 && Number.isFinite(perStepDuration)
      ? perStepDuration * stepOrder.length
      : duration;
  const stagger = transition.stagger;
  const staggerMax =
    typeof stagger === "object"
      ? Number(stagger.max ?? 0)
      : 0;
  return Math.max(1, Number.isFinite(effectiveDuration) ? effectiveDuration : fallbackDuration) + (Number.isFinite(staggerMax) ? staggerMax : 0);
}

function clearSeekSequence(scene) {
  scene.seekSequence = null;
}

function createSeekSequence(phases = []) {
  const durations = phases.map((phase) => phaseDuration(phase));
  const total = Math.max(1, durations.reduce((sum, duration) => sum + duration, 0));
  let cursor = 0;
  return {
    phase: null,
    phases: phases.map((phase, index) => {
      const start = cursor / total;
      cursor += durations[index];
      const end = index === phases.length - 1 ? 1 : cursor / total;
      return { ...phase, start, end };
    })
  };
}

function renderPhaseSequence(scene, phases = [], index = 0) {
  const config = phases[index];
  if (!config) return;

  renderCompiledView(
    config.node,
    config.spec,
    config.viewConfig,
    config.datasets,
    config.tooltip,
    config.d3,
    config.aq,
    config.sceneTransition,
    {
      transitionSource: config.transitionSource,
      seekable: config.seekable
    }
  );

  if (index >= phases.length - 1) return;
  scene.phaseTimer = window.setTimeout(() => {
    scene.phaseTimer = null;
    renderPhaseSequence(scene, phases, index + 1);
  }, phaseDuration(config));
}

function renderSeekPhase(scene, phaseIndex) {
  const sequence = scene.seekSequence;
  const config = sequence?.phases?.[phaseIndex];
  if (!sequence || !config || sequence.phase === phaseIndex) return;

  sequence.phase = phaseIndex;
  renderCompiledView(
    config.node,
    config.spec,
    config.viewConfig,
    config.datasets,
    config.tooltip,
    config.d3,
    config.aq,
    config.sceneTransition,
    {
      transitionSource: config.transitionSource,
      seekable: config.seekable
    }
  );
}

function applySeekSequence(scene, progress, direction = 1) {
  const sequence = scene.seekSequence;
  if (!sequence?.phases?.length) return false;

  const bounded = clamp(progress, 0, 1);
  const phases = sequence.phases;
  const phaseIndex = phases.findIndex((phase, index) =>
    bounded <= phase.end || index === phases.length - 1
  );
  const phase = phases[Math.max(0, phaseIndex)];
  const span = Math.max(0.001, phase.end - phase.start);

  renderSeekPhase(scene, Math.max(0, phaseIndex));
  scene.transitionProgress?.progress(
    clamp((bounded - phase.start) / span, 0, 1),
    direction
  );
  return true;
}

}
