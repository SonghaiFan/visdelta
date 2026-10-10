import type { BaseType, Selection } from 'd3-selection';
import { applyTransforms } from '../data/transforms.js';
import { resolveIntermediateSpecs, resolveTransitionRoute } from '../charts/transition-route.js';
import { resolveMarkRendererKey } from '../charts/index.js';
import { serializeViewSpec, specDatumKey } from '../spec-meta.js';
import { activeMarkLayer, drawUnsupported, fadeLayers } from './mark-layers.js';
import { applyPlotClip } from './clipping.js';
import { transitionSpec } from '../toolkit/motion-timing.js';

import { domainTransforms, viewRows } from './data.js';
import { resolveSpecDataTypes } from '../data/types.js';
import { getScene, recordSceneDiagnostics, resetSceneToEmptySource, resizeScene } from './scene.js';
import { clamp } from './utils.js';
import { clearSceneTransitionProgress, createSceneTransitionProgress } from '../transition-progress.js';
import { createViewCompiler } from './view-compile.js';
import type { CompileResult, StepTransition } from './view-compile.js';
import type {
  ChartContext,
  ChartType,
  ChartTransitionContext,
  DataRow,
  IntermediateSpec,
  MarginSpec,
  TransitionPlan,
  ViewSpec
} from '../types/index.js';
import type { ChartTypeRegistry } from '../charts/index.js';
import { viewLineageCorrespondence } from '../data/view-lineage.js';
import { motion } from './recorder.js';
import type { MotionTiming } from './recorder.js';
import type { RuntimeScene, SceneHostElement } from './scene.js';
import { correspondMarks, resolveMarkIdentity } from '../identity/mark-correspondence.js';
import type { MarkCorrespondence } from '../identity/mark-correspondence.js';
import { compileLineage } from '../data/lineage.js';
import type { RenderDatum } from './render-types.js';

type DatasetMap = Record<string, DataRow[]>;
type SceneTransition = CompileResult['sceneTransition'];

export interface ViewConfig {
  height?: number;
  margin?: Partial<MarginSpec>;
}

export interface ViewLayoutSpec extends ViewSpec {
  height?: number;
  margin?: Partial<MarginSpec>;
}

interface DrawViewOptions {
  previousViewSpec?: ViewSpec | null;
  previousTransition?: StepTransition;
  seekable?: boolean;
}

interface RenderOptions {
  transitionSource?: CompileResult | null;
  seekable?: boolean;
  skipSourcePrep?: boolean;
}

interface MembershipChange {
  exit: boolean;
  enter: boolean;
}

interface RuntimeTransition extends ChartTransitionContext {
  exitFirst?: boolean;
  enterLast?: boolean;
  exitDuration?: number;
  scaleDuration?: number;
  enterDuration?: number;
  enterDelay?: number;
}

interface RuntimeChart extends ChartContext {
  scene: RuntimeScene;
  type: string;
  transition: RuntimeTransition;
  transitionPlan: TransitionPlan;
  sceneTransition: SceneTransition;
  seekable: boolean;
  position?: { x(row: DataRow): number; y(row: DataRow): number };
}

type IntermediatePhase = IntermediateSpec;

interface RenderPhaseConfig {
  node: SceneHostElement;
  spec: ViewSpec;
  viewConfig: ViewConfig;
  datasets: DatasetMap;
  tooltip: HTMLElement;
  seekable: boolean;
  sceneTransition: SceneTransition;
  transitionSource: CompileResult;
  reverse: boolean;
}

interface RenderPhaseContext {
  chartType: ChartType;
  node: SceneHostElement;
  finalSpec: ViewSpec;
  viewConfig: ViewConfig;
  datasets: DatasetMap;
  tooltip: HTMLElement;
  seekable: boolean;
  transitionSource: CompileResult;
}

export interface SeekPhase extends RenderPhaseConfig {
  start: number;
  end: number;
}

export interface SeekSequence {
  phase: number | null;
  phases: SeekPhase[];
}

export interface ViewRuntimeScene extends RuntimeScene {
  seekSequence?: SeekSequence | null;
}

/** Per-instance rendering pipeline for standalone transitions. */
export function createViewRenderer(chartTypes: ChartTypeRegistry) {
const { compileEffectiveView, compileTransitionSource } = createViewCompiler(chartTypes);
return { drawView, prepareSeekSourceState, compileTransitionSource,
  renderSeekPhase, applySeekSequence };
function drawView(node: SceneHostElement, viewSpec: ViewSpec | null, viewConfig: ViewConfig, datasets: DatasetMap, tooltip: HTMLElement, stepTransition: StepTransition = {}, options: DrawViewOptions = {}): void {
  const scene = getScene(node, viewConfig) as ViewRuntimeScene;
  if (!viewSpec || !viewSpec.mark) {
    clearSeekSequence(scene);
    scene.empty.style("display", "grid").text("No view for this step.");
    fadeLayers(scene, '', null);
    return;
  }

  scene.empty.style("display", "none");

  const { sceneTransition, effectiveViewSpec } = compileEffectiveView(viewSpec, stepTransition);
  if (!effectiveViewSpec) {
    clearSeekSequence(scene);
    scene.empty.style("display", "grid").text("No view for this step.");
    fadeLayers(scene, '', null);
    return;
  }
  const transitionSource = compileTransitionSource(
    options.previousViewSpec,
    options.previousTransition
  );

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
      chartType: chartType!,
      node,
      finalSpec: effectiveViewSpec,
      viewConfig,
      datasets,
      tooltip,
      
      seekable: seekableStep,
      transitionSource
    });

    if (seekableStep) {
      scene.seekSequence = createSeekSequence(renderPhases);
      renderSeekPhase(scene, 0);
      return;
    }

    // Every production transition is seekable; keep intermediate rendering on
    // the same progress-driven path so there is no second timer-based runtime.
    scene.seekSequence = createSeekSequence(renderPhases);
    renderSeekPhase(scene, 0);
    return;
  }

  clearSeekSequence(scene);
  renderCompiledView(node, effectiveViewSpec, viewConfig, datasets, tooltip, sceneTransition, {
    transitionSource,
    seekable: seekableStep
  });
}

function renderCompiledView(node: SceneHostElement, effectiveViewSpec: ViewSpec, viewConfig: ViewConfig, datasets: DatasetMap, tooltip: HTMLElement, sceneTransition: SceneTransition = { scene: [] }, renderOptions: RenderOptions = {}): void {
  const scene = getScene(node, viewConfig) as ViewRuntimeScene;
  const seekable = Boolean(renderOptions.seekable);
  if (seekable && !renderOptions.skipSourcePrep) {
    prepareSeekSourceState(
      node,
      viewConfig,
      datasets,
      tooltip,
      
      renderOptions.transitionSource ?? undefined
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
  const source = viewRows(renderSpec.data, datasets) as DataRow[];
  const transforms = renderSpec.transform || [];
  const rows = applyTransforms(source, transforms) as RenderDatum[];
  attachDatumIdentity(rows, compileLineage(source, transforms, {
    key: specDatumKey(renderSpec) ?? undefined
  }));
  const domainRows = applyTransforms(source, domainTransforms(renderSpec.transform || []));
  if (!rows.length) {
    const emptyTransition = transitionSpec(renderSpec, previousSpec);
    motion(scene.empty.style("display", "grid").style('opacity', 0).text("No rows after transforms."), emptyTransition.base)
      .style('opacity', 1);
    fadeLayers(scene, '', emptyTransition);
    // d3 Selection is invariant in its element type, so fade each layer through one generic call.
    const fade = <E extends BaseType>(layer: Selection<E, unknown, any, any>) => motion(layer, emptyTransition.base).style('opacity', 0);
    fade(scene.grid); fade(scene.xAxis); fade(scene.yAxis); fade(scene.xLabel); fade(scene.yLabel); fade(scene.legend);
    if (seekable) {
      scene.transitionProgress = createSceneTransitionProgress(scene);
    }
    scene.previousSpec = renderSpec;
    return;
  }

  const width = Math.max(60, node.clientWidth || 720);
  const layoutSpec = effectiveViewSpec as ViewLayoutSpec;
  const height = viewConfig.height || layoutSpec.height || 500;
  resizeScene(scene, width, height);

  const rendererKey = resolveMarkRendererKey(renderSpec);
  const margin = fitMargins(width, height, {
    top: 58,
    right: 44,
    bottom: 64,
    left: 68,
    ...(chartType?.defaultMargin?.(renderSpec, { width, height, rows: domainRows }) || {}),
    ...(layoutSpec.margin || {}),
    ...(viewConfig.margin || {})
  });
  scene.svg
    .attr('class', `vd-chart vd-chart-${rendererKey}`)
    .attr('data-chart-type', rendererKey);
  const previousSource = previousSpec ? viewRows(previousSpec.data, datasets) as DataRow[] : [];
  const previousRows = previousSpec
    ? applyTransforms(previousSource, previousSpec.transform || [])
    : [];
  // Keep chart-owned decisions separate from shared correspondence evidence;
  // attaching evidence must not mutate a plan object retained by a plugin.
  const transitionPlan = { ...(chartType?.resolveTransitionPlan?.(previousSpec, renderSpec) || {}) };
  const lineage = previousSpec ? viewLineageCorrespondence(previousSpec, renderSpec) : null;
  if (lineage) transitionPlan.lineage = lineage;
  const markCorrespondence = previousSpec
    ? correspondMarks(
        previousRows,
        rows,
        resolveMarkIdentity(previousSpec, chartType?.defaultMarkKey?.(previousSpec)),
        resolveMarkIdentity(renderSpec, chartType?.defaultMarkKey?.(renderSpec))
      )
    : null;
  if (markCorrespondence) transitionPlan.markCorrespondence = markCorrespondence;
  const observationChange = observationMembershipChange(
    previousSpec, renderSpec, previousRows, rows, markCorrespondence
  );
  const chartTransition = observationTransition(
    transitionSpec(renderSpec, previousSpec),
    observationChange,
    { simultaneous: transitionPlan.membershipTiming === 'simultaneous' }
  );
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const chartTransitionFrame = motion(scene.frame, chartTransition.base).attr(
    "transform",
    `translate(${margin.left},${margin.top})`
  );
  const g = activeMarkLayer(scene, rendererKey, chartTransition);
  const chart: RuntimeChart = {
    scene,
    g,
    type: rendererKey,
    width,
    height,
    margin,
    transition: chartTransition,
    transitionPlan,
    sceneTransition,
    seekable,
    sourceRows: source,
    domainRows,
    innerWidth,
    innerHeight,
    frame: chartTransitionFrame
  };
  applyPlotClip(chart, true);

  const renderer = chartType?.renderer;
  if (renderer) renderer(chart, rows, renderSpec, tooltip);
  else drawUnsupported(chart, renderSpec, chartTypes.types());
  reflectCamera(scene, chart.camera);

  recordSceneDiagnostics(chart, renderSpec);
  if (seekable) {
    scene.transitionProgress = createSceneTransitionProgress(scene);
  }
  scene.previousSpec = renderSpec;
}

function attachDatumIdentity(rows: RenderDatum[], table: ReturnType<typeof compileLineage>): void {
  if (rows.length !== table.rows.length) return;
  const fields = typeof table.identity.key === 'string'
    ? [table.identity.key]
    : Array.isArray(table.identity.key) ? [...table.identity.key] : [];
  rows.forEach((row, index) => {
    row.__datumIdentity = {
      fields,
      mode: table.identity.mode,
      keys: table.rows[index].lineage.map((atom) => atom.datumKey)
    };
  });
}

/**
 * A row-preserving change may remove observations without changing what a
 * remaining observation means. Keep the old coordinate system while those
 * marks leave, then move the shared view. Aggregation and reshaping have their
 * own chart-specific visual order and deliberately do not take this path.
 */
function observationMembershipChange(
  previousSpec: ViewSpec | null,
  nextSpec: ViewSpec,
  previousRows: DataRow[],
  nextRows: DataRow[],
  correspondence: MarkCorrespondence | null
): MembershipChange {
  if (!previousSpec || previousSpec.mark !== nextSpec?.mark) return { exit: false, enter: false };
  if ((previousSpec.transform || []).some((transform) => transform?.aggregate) ||
      (nextSpec.transform || []).some((transform) => transform?.aggregate)) return { exit: false, enter: false };

  if (correspondence?.stable) {
    return {
      exit: correspondence.exit.length > 0,
      enter: correspondence.enter.length > 0
    };
  }

  // Without stable endpoint identity, cardinality can establish a one-way
  // membership change but cannot safely invent correspondence between rows.
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
function observationTransition(
  transition: RuntimeTransition,
  change: MembershipChange,
  { simultaneous = false }: { simultaneous?: boolean }
): RuntimeTransition {
  if (!change.exit && !change.enter) return transition;
  const totalDuration = Math.max(1, Number(transition.duration) || 900);
  if (simultaneous) {
    const timing: MotionTiming = { delay: 0, duration: totalDuration, ease: transition.base.ease };
    return {
      ...transition,
      base: { ...timing },
      ...(change.exit ? { exit: { ...timing } } : {}),
      ...(change.enter ? { enter: { ...timing } } : {}),
      exitFirst: false,
      enterLast: false,
      exitDuration: change.exit ? totalDuration : 0,
      scaleDuration: totalDuration,
      enterDuration: change.enter ? totalDuration : 0,
      enterDelay: 0
    };
  }
  const parts = 1 + Number(change.exit) + Number(change.enter);
  const partDuration = Math.max(1, Math.floor(totalDuration / parts));
  const exitDuration = change.exit ? partDuration : 0;
  const enterDuration = change.enter ? partDuration : 0;
  const scaleDuration = Math.max(1, totalDuration - exitDuration - enterDuration);
  const ease = transition.base.ease;
  const create = (duration: number, delay = 0): MotionTiming => ({ delay, duration, ease });
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

function reflectCamera(scene: RuntimeScene, camera: ChartContext['camera']): void {
  const value = camera || { k: 1, x: 0, y: 0 };
  scene.svg
    .attr('data-camera-k', Number(value.k) || 1)
    .attr('data-camera-x', Number(value.x) || 0)
    .attr('data-camera-y', Number(value.y) || 0);
}

function fitMargins(width: number, height: number, margin: MarginSpec): MarginSpec {
  const fitted = { ...margin };
  fitMarginPair(fitted, 'left', 'right', Math.max(0, width - 24));
  fitMarginPair(fitted, 'top', 'bottom', Math.max(0, height - 24));
  return fitted;
}

function fitMarginPair(
  margin: MarginSpec,
  start: keyof MarginSpec,
  end: keyof MarginSpec,
  budget: number
): void {
  const total = Math.max(0, Number(margin[start]) || 0) + Math.max(0, Number(margin[end]) || 0);
  if (!total || total <= budget) return;
  const scale = budget / total;
  margin[start] = Math.max(0, margin[start] * scale);
  margin[end] = Math.max(0, margin[end] * scale);
}

function prepareChartSpec(
  chartType: ChartType | undefined,
  spec: ViewSpec | null | undefined,
  datasets: DatasetMap = {}
): ViewSpec | null {
  if (!spec) return null;
  const typed = resolveSpecDataTypes(spec, viewRows(spec.data, datasets));
  return chartType?.prepareSpec?.(typed) || typed;
}

function intermediateRenderPhases(
  chartType: ChartType | undefined,
  sourceSpec: ViewSpec | null,
  targetSpec: ViewSpec | null
): IntermediatePhase[] {
  if (!chartType || !sourceSpec || !targetSpec) return [];
  const raw = resolveIntermediateSpecs(chartType, sourceSpec, targetSpec);
  const phases = Array.isArray(raw) ? raw : [raw];
  return phases
    .map((phase): IntermediatePhase => ({
      ...phase,
      spec: serializeViewSpec(phase.spec)
    }))
    .filter((phase): phase is IntermediatePhase => Boolean(phase.spec));
}

function renderPhaseConfigs(
  intermediatePhases: IntermediatePhase[],
  context: RenderPhaseContext
): RenderPhaseConfig[] {
  const route = resolveTransitionRoute(context.chartType,
    context.transitionSource.effectiveViewSpec, context.finalSpec, intermediatePhases);
  return route.legs.map(({ canonical, scenes }): RenderPhaseConfig => {
    const canonicalSource = compileTransitionSource(canonical.from);
    const canonicalTarget = compileEffectiveView(canonical.to, { scene: scenes });
    return {
      node: context.node,
      spec: canonical.to,
      viewConfig: context.viewConfig,
      datasets: context.datasets,
      tooltip: context.tooltip,
      seekable: context.seekable,
      sceneTransition: canonicalTarget.sceneTransition,
      transitionSource: {
        ...canonicalSource,
        effectiveViewSpec: canonical.from
      },
      reverse: canonical.reverse
    };
  });
}

function prepareSeekSourceState(
  node: SceneHostElement,
  viewConfig: ViewConfig,
  datasets: DatasetMap,
  tooltip: HTMLElement,
  transitionSource: CompileResult = { effectiveViewSpec: null, sceneTransition: { scene: [] } }
): void {
  const scene = getScene(node, viewConfig) as ViewRuntimeScene;
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


function clearSeekSequence(scene: ViewRuntimeScene): void {
  scene.seekSequence = null;
}

function createSeekSequence(phases: RenderPhaseConfig[] = []): SeekSequence {
  // `progress()` partitions an authored pair by its complete route stages.
  const durations = phases.map(() => 1);
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

function renderSeekPhase(scene: ViewRuntimeScene, phaseIndex: number): void {
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
    
    config.sceneTransition,
    {
      transitionSource: config.transitionSource,
      seekable: config.seekable
    }
  );
}

function applySeekSequence(scene: ViewRuntimeScene, progress: number, direction = 1): boolean {
  const sequence = scene.seekSequence;
  if (!sequence?.phases?.length) return false;

  const bounded = clamp(progress, 0, 1);
  const phases = sequence.phases;
  const phaseIndex = phases.findIndex((phase, index) =>
    bounded <= phase.end || index === phases.length - 1
  );
  const phase = phases[Math.max(0, phaseIndex)];
  const span = Math.max(Number.EPSILON, phase.end - phase.start);

  // A shared endpoint is a complete chart state, just like an authored
  // sequence endpoint. Do not leave exit ticks/marks from the incoming leg.
  if (Math.abs(bounded - phase.end) < 1e-12) {
    const endpoint = phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec;
    prepareSeekSourceState(phase.node, phase.viewConfig, phase.datasets, phase.tooltip,
      compileTransitionSource(endpoint));
    sequence.phase = null;
    return true;
  }

  renderSeekPhase(scene, Math.max(0, phaseIndex));
  scene.transitionProgress?.progress(
    phaseProgress(phase, (bounded - phase.start) / span),
    phase.reverse ? -direction : direction
  );
  return true;
}

function phaseProgress(phase: SeekPhase, value: number): number {
  const progress = clamp(value, 0, 1);
  return phase.reverse ? 1 - progress : progress;
}

}
