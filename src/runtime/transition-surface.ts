import type { TransitionInspection, InspectionFrame } from './inspection.js';
// A standalone, seekable surface for one canonical chart pair. It mounts its
// own root under the host, compiles the pair into per-phase frame evaluators,
// and answers progress(value, direction) from DOM snapshots plus those
// evaluators. Nothing here depends on a timer.
import { renderChartShell } from './chart-shell.js';
import { createViewRenderer } from './view-renderer.js';
import { prepareChartSpec } from './view-renderer.js';
import type { ViewConfig, ViewLayoutSpec, ViewRuntimeScene } from './view-renderer.js';
import { resolveTarget } from './target.js';
import { inferTransition } from '../grammar/infer-transition.js';
import { canonicalTransitionPair, selectTransitionRoute } from '../charts/transition-route.js';
import type { TransitionRoute } from '../charts/transition-route.js';
import { captureDomFrame } from './dom-frame.js';
import type { DomFrame } from './dom-frame.js';
import { hideTooltip } from './tooltip.js';
import { clearSceneTransitionProgress } from '../transition-progress.js';
import type { SceneHostElement } from './scene.js';
import type { FrameEvaluator } from './tracks.js';
import type { DeclarationOperationChange, ChartType, MarginSpec, RuntimeOptions, DataRow } from '../types/index.js';
import type { ChartTypeRegistry } from '../charts/index.js';
import { viewRows, domainTransforms } from './data.js';
import { applyTransforms } from '../data/transforms.js';
import type { CanvasSize } from './canvas-size.js';

export interface TransitionSurfaceOptions extends RuntimeOptions {
  /** Canvas width: pixels, or "auto" (default) to follow the container. */
  width?: CanvasSize;
  /** Canvas height: pixels, or "auto" to follow the container. Defaults to the chart's own height. */
  height?: CanvasSize;
  /** Force the reconstruction bridge even for chart types that allow cached frames. */
  reconstruct?: boolean;
}

export interface TransitionSurface {
  /** Stable chart scope, even when a sequence reparents this surface. */
  readonly root: Element;
  readonly view: Element;
  /** Number of serial route stages chosen for this authored pair. */
  stageCount(): number;
  stageOperations(): Array<DeclarationOperationChange | undefined>;
  stageStates(): Array<[ViewLayoutSpec, ViewLayoutSpec]>;
  inspect(): Promise<TransitionInspection>;
  commitMount(): void;
  rollbackMount(): void;
  progress(value: number, direction?: number): void;
  /** Change the requested canvas size; omitted dimensions keep their request. */
  resize(size?: { width?: CanvasSize; height?: CanvasSize }): void;
  /** Which dimensions follow the container, so the owner knows what to observe. */
  follows(): { width: boolean; height: boolean };
  destroy(): void;
}

/** One compiled seek phase: a DOM snapshot plus the evaluator that animates it. */
interface PhaseFrame {
  start: number;
  end: number;
  evaluator: FrameEvaluator;
  dom: DomFrame;
  reverse: boolean;
}

export function createTransitionSurface(
  from: ViewLayoutSpec,
  to: ViewLayoutSpec,
  options: TransitionSurfaceOptions,
  chartTypes: ChartTypeRegistry
): TransitionSurface {
  const { drawView, prepareSeekSourceState, compileTransitionSource,
    renderSeekPhase, applySeekSequence } = createViewRenderer(chartTypes);
  const chartType = chartTypes.get(from);
  if (!chartType) throw new Error(`Unsupported chart type: ${String(from.mark)}`);
  const canonical = canonicalTransitionPair(chartType, from, to);
  const source = canonical.from;
  const target = canonical.to;
  // A chart may insert complete states inside this one authored pair. They are
  // route stages, not extra authored sequence entries. Their count is known
  // from the same pure route policy that the renderer uses below.
  const preparedSource = prepareChartSpec(chartType, compileTransitionSource(source).effectiveViewSpec ?? source) ?? source;
  const preparedTarget = prepareChartSpec(chartType, compileTransitionSource(target).effectiveViewSpec ?? target) ?? target;
  const route: TransitionRoute = selectTransitionRoute(chartType, preparedSource, preparedTarget);
  const routeStages = route.legs.length;
  const layoutStates = [route.from, ...route.legs.map(leg => leg.to)]
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));
  const canonicalProgress = (value: number) => canonical.reverse ? 1 - value : value;
  const host = resolveTarget(options.target);
  const root = document.createElement('div');
  const styleKey = String(options.chartStyle?.key || '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  root.className = `vd-transition-root vd-style-${styleKey}`;
  root.dataset.chartStyle = styleKey;
  const shell = renderChartShell(root, 'main');
  const node = shell.views.main as SceneHostElement;
  // A top legend sits in a block above the canvas, outside the SVG, so `width` and
  // `height` are the canvas alone. A side legend stays in the right margin.
  const legendOutside = options.chartStyle?.legendPosition !== 'right';
  const config: ViewConfig = {
    // "auto" is measured at layout time; until then the chart's own height stands in.
    height: (typeof options.height === 'number' ? options.height : undefined) ?? from.height ?? to.height ?? 500,
    legendOutside
  };
  const scenes = { scene: inferTransition(source, target) };
  // Cache only when the selected chart type explicitly opts into reusable-frame
  // contract. Unspecified/custom renderers use the reconstruction bridge.
  const cacheFrames = chartType.transitionEvaluation === 'cached' && options.reconstruct !== true;
  let cached: FrameEvaluator | null = null;
  let inspectionFrames: InspectionFrame[] = [];
  const runtimeScene = () => node.__visDeltaScene as ViewRuntimeScene | undefined;
  const disposeScene = () => {
    const scene = runtimeScene();
    if (scene) {
      clearSceneTransitionProgress(scene, { finish: false });
    }
    node.replaceChildren();
    delete node.__visDeltaScene;
  };
  let previousChildren: Node[] = Array.from(host.childNodes);
  host.replaceChildren(root);
  let layoutDirty = true;
  let requestedWidth = options.width;
  let requestedHeight = options.height;

  /**
   * Apply the requested canvas size to the chart's own elements. The canvas is
   * the SVG, margins included. A fixed width lets the root shrink-wrap the view,
   * so the host overflows instead of the chart being clipped. "auto" makes the
   * canvas exactly the container's content box on that axis, so the figure's own
   * chrome there (its theme border) gives way. Omitted dimensions keep the chrome and the figure fits.
   */
  function applyCanvasStyles() {
    const fixedWidth = typeof requestedWidth === 'number';
    const fitWidth = requestedWidth === 'auto';
    const explicitHeight = requestedHeight != null;
    const fill = requestedHeight === 'auto';
    const figure = shell.figure.style;
    root.style.width = fixedWidth ? 'max-content' : '';
    node.style.width = fixedWidth ? `${requestedWidth}px` : '';
    // An explicit height is the canvas height, not a floor under the default one.
    node.style.minHeight = explicitHeight ? '0' : '';
    figure.borderLeftWidth = figure.borderRightWidth = fitWidth ? '0' : '';
    figure.borderTopWidth = figure.borderBottomWidth = fill ? '0' : '';
    root.style.height = fill ? '100%' : '';
    figure.height = fill ? '100%' : '';
    figure.boxSizing = fill ? 'border-box' : '';
    figure.display = fill ? 'flex' : '';
    figure.flexDirection = fill ? 'column' : '';
    node.style.flex = fill ? '1 1 0' : '';
  }
  applyCanvasStyles();

  let legendRooms: number[] = [];
  let fittedHeight = 0;
  let layoutWidth = 720;

  let resetFrames = true;

  function compileFrames(): FrameEvaluator {
    if (resetFrames) disposeScene();
    resetFrames = false;
    prepareSeekSourceState(node, config, {}, shell.tooltip,
      { effectiveViewSpec: route.from, sceneTransition: { scene: [] } }, true);
    const startFrame = captureDomFrame(node);
    drawView(node, target, config, {}, shell.tooltip, scenes, { previousViewSpec: source, seekable: true, transitionRoute: route });
    const scene = runtimeScene();
    if (!scene?.transitionProgress) throw new Error('VisDelta could not compile the transition: no seekable render was produced.');
    const controller = scene.transitionProgress;
    const phases = scene.seekSequence?.phases ?? [{ start: 0, end: 1, reverse: false }];
    const boundaries: Array<{ at: number; dom: DomFrame }> = [];
    const frames: PhaseFrame[] = phases.map((phase, index) => {
      if (index > 0) renderSeekPhase(scene, index);
      const evaluator = (scene.transitionProgress ?? controller).compile();
      const frame = {
        start: phase.start,
        end: phase.end,
        evaluator,
        dom: captureDomFrame(node),
        reverse: Boolean(phase.reverse)
      };
      if (index < phases.length - 1 && 'spec' in phase) {
        const endpoint = phase.reverse ? phase.transitionSource.effectiveViewSpec : phase.spec;
        if (phase.reverse) evaluator.progress(0, -1);
        clearSceneTransitionProgress(scene, { finish: !phase.reverse });
        prepareSeekSourceState(node, config, {}, shell.tooltip,
          { effectiveViewSpec: endpoint, sceneTransition: { scene: [] } }, true);
        boundaries.push({ at: phase.end, dom: captureDomFrame(node) });
      }
      return frame;
    });
    inspectionFrames = frames;
    // Save the clean endpoint (no zero-opacity exit marks/ticks), while keeping
    // detached nodes alive in the phase snapshots for later reverse seeks.
    const finalFrame = frames[frames.length - 1];
    if (finalFrame.reverse) finalFrame.evaluator.progress(0, -1);
    clearSceneTransitionProgress(scene, { finish: !finalFrame.reverse });
    prepareSeekSourceState(node, config, {}, shell.tooltip,
      { effectiveViewSpec: route.to, sceneTransition: { scene: [] } }, true);
    const endFrame = captureDomFrame(node);
    let activeFrame: DomFrame = endFrame;
    const activate = (frame: DomFrame) => {
      if (activeFrame !== frame) { frame.restore(); activeFrame = frame; }
    };
    return {
      progress(value, direction = 1) {
        if (value === 0) { startFrame.restore(); activeFrame = startFrame; return; }
        if (value === 1) { endFrame.restore(); activeFrame = endFrame; return; }
        const boundary = boundaries.find(candidate => Math.abs(value - candidate.at) < 1e-12);
        if (boundary) { activate(boundary.dom); return; }
        const frame = frames.find((candidate) => value <= candidate.end) ?? frames[frames.length - 1];
        activate(frame.dom);
        const local = (value - frame.start) / Math.max(Number.EPSILON, frame.end - frame.start);
        frame.evaluator.progress(
          frame.reverse ? 1 - local : local,
          frame.reverse ? -direction : direction
        );
      }
    };
  }

  return {
    root,
    view: node,
    stageCount() { return Math.max(1, routeStages); },
    stageOperations() {
      const operations = route.legs.map(leg => leg.operation);
      return canonical.reverse ? operations.reverse().map(operation => operation && ({
        ...operation,
        action: operation.action === 'insert' ? 'delete' : operation.action === 'delete' ? 'insert' : 'update',
        previous: operation.next, next: operation.previous,
        fromIndex: operation.toIndex, toIndex: operation.fromIndex
      } as DeclarationOperationChange)) : operations;
    },
    stageStates() {
      const pairs: Array<[ViewLayoutSpec, ViewLayoutSpec]> = route.legs.map(leg => [leg.from ?? leg.to, leg.to]);
      return canonical.reverse ? pairs.reverse().map(([from, to]) => [to, from]) : pairs;
    },
    async inspect() {
      const { inspectFrames } = await import('./inspection.js');
      if (!root.parentNode) throw new Error('This transition has been destroyed.');
      const restore = captureDomFrame(node);
      try {
        // Reconstruction renderers rebuild on every subsequent progress call.
        // Restore the exact DOM here instead of rendering a second replacement frame.
        if (!cacheFrames) compileFrames();
        return inspectFrames(inspectionFrames, canonical.reverse);
      } finally {
        restore.restore();
      }
    },
    commitMount() { previousChildren = []; },
    rollbackMount() {
      if (root.parentNode === host) host.replaceChildren(...previousChildren);
      previousChildren = [];
    },
    progress(value, direction = 0) {
      hideTooltip(shell.tooltip);
      if (layoutDirty) {
        const width = layoutWidth = node.clientWidth || 720;
        // Use the maximum legend room only to decide which chrome fits. The
        // displayed room follows the active route leg below.
        const sizing = { width, height: from.height ?? to.height ?? 500 };
        config.legendHeight = legendOutside ? legendBlockHeight(chartType, layoutStates, sizing) : 0;
        // Decide once per layout, never per animation frame. Restore all chrome
        // before measuring so growing the container restores it automatically.
        delete root.dataset.hideLegend;
        if (requestedHeight === 'auto' && shell.figure.clientHeight > 0) {
          // A readable canvas scales with the available width, capped at 200px.
          // Below that budget, decoration gives way in priority order.
          const minimumCanvas = Math.min(200, width / 2);
          const available = () => Math.round(shell.figure.clientHeight - (config.legendHeight ?? 0));
          if (available() < minimumCanvas) {
            config.legendHeight = 0;
            root.dataset.hideLegend = 'true';
          }
        }
        // "auto" reads the room the container gives the view, less the legend block.
        // A container with no height of its own gives none, and the chart keeps its own height.
        const room = requestedHeight === 'auto' ? node.clientHeight - config.legendHeight : 0;
        const fixedHeight = typeof requestedHeight === 'number' ? requestedHeight : room > 0 ? room : undefined;
        const baseHeight = fixedHeight ?? from.height ?? to.height ?? 500;
        config.margin = invariantTransitionMargin(chartType, layoutStates, width, baseHeight, legendOutside);
        config.height = fixedHeight != null || from.height != null || to.height != null ? baseHeight
          : Math.max(baseHeight, ...layoutStates.map(spec => chartType.defaultHeight?.(spec, {
            width, height: baseHeight, rows: applyTransforms(viewRows(spec.data, {}) as DataRow[], spec.transform ?? [])
          }, { ...spec.margin, ...config.margin }) ?? baseHeight));
        config.margin = invariantTransitionMargin(chartType, layoutStates, width, config.height, legendOutside);
        // Measure each complete route state, including the empty legend. The
        // active leg interpolates these rooms instead of reserving their maximum.
        legendRooms = layoutStates.map(spec => legendOutside && !root.dataset.hideLegend
          ? legendBlockHeight(chartType, [spec], sizing) : 0);
        fittedHeight = requestedHeight === 'auto' ? shell.figure.clientHeight : 0;
        layoutDirty = false;
      }
      const routeProgress = canonicalProgress(value);
      const legPosition = routeProgress * Math.max(1, legendRooms.length - 1);
      const legIndex = Math.min(Math.floor(legPosition), Math.max(0, legendRooms.length - 2));
      const fraction = legPosition - legIndex;
      const legendHeight = (legendRooms[legIndex] ?? 0) * (1 - fraction)
        + (legendRooms[legIndex + 1] ?? legendRooms[legIndex] ?? 0) * fraction;
      const height = fittedHeight > 0
        ? Math.max(1, fittedHeight - legendHeight)
        : config.height;
      let margin = config.margin;
      if (!legendOutside) {
        const before = invariantTransitionMargin(chartType, [layoutStates[legIndex]], layoutWidth, height!, false);
        const after = invariantTransitionMargin(chartType, [layoutStates[Math.min(legIndex + 1, layoutStates.length - 1)]], layoutWidth, height!, false);
        margin = { ...config.margin };
        for (const side of ['top', 'right'] as const) {
          margin[side] = Number(before[side]) * (1 - fraction) + Number(after[side]) * fraction;
        }
      }
      if (config.height !== height || config.legendHeight !== legendHeight
        || margin?.top !== config.margin?.top || margin?.right !== config.margin?.right) {
        config.height = height;
        config.legendHeight = legendHeight;
        config.margin = legendOutside
          ? invariantTransitionMargin(chartType, layoutStates, layoutWidth, height!, true) : margin;
        cached = null;
        inspectionFrames = [];
      }
      value = routeProgress;
      const canonicalDirection = (direction || 1) * (canonical.reverse ? -1 : 1);
      if (cacheFrames) {
        cached ??= compileFrames();
        cached.progress(value, canonicalDirection);
        return;
      }
      disposeScene();
      if (value === 0 || value === 1) {
        prepareSeekSourceState(node, config, {}, shell.tooltip,
          { effectiveViewSpec: value === 0 ? route.from : route.to, sceneTransition: { scene: [] } }, true);
      } else {
        drawView(node, target, config, {}, shell.tooltip, scenes, {
          previousViewSpec: source,
          seekable: true,
          transitionRoute: route
        });
        // The pair's progress is already normalized. Chart-local timing and
        // step order apply inside the plan.
        const scene = runtimeScene();
        if (scene && !applySeekSequence(scene, value, canonicalDirection)) {
          scene.transitionProgress?.progress(value, canonicalDirection);
        }
      }
    },
    resize({ width, height } = {}) {
      if (width != null) requestedWidth = width;
      if (height != null) requestedHeight = height;
      applyCanvasStyles();
      cached = null; inspectionFrames = [];
      resetFrames = true;
      layoutDirty = true;
    },
    follows() { return { width: typeof requestedWidth !== 'number', height: requestedHeight === 'auto' }; },
    destroy() { cached = null; inspectionFrames = []; disposeScene(); root.remove(); }
  };
}

/** One margin for both endpoints, so a clip edge never moves independently of its marks. */
function invariantTransitionMargin(chartType: ChartType, states: ViewLayoutSpec[], width: number, height: number, legendOutside = false): Partial<MarginSpec> {
  const margins = states.map(spec => {
    const sourceRows = viewRows(spec.data, {}) as DataRow[];
    const rows = applyTransforms(sourceRows, domainTransforms(spec.transform || []));
    return { ...chartType.defaultMargin(spec, { width, height, rows, legendOutside }), ...(spec.margin || {}) };
  });
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return Object.fromEntries(sides.map((side) => [
    side,
    Math.max(...margins.map(margin => Number(margin[side]) || 0))
  ])) as Partial<MarginSpec>;
}

/** The tallest legend block among a pair's states, measured with the pair's shared side margins. */
function legendBlockHeight(chartType: ChartType, states: ViewLayoutSpec[], size: { width: number; height: number }): number {
  if (!chartType.legendHeight) return 0;
  const shared = invariantTransitionMargin(chartType, states, size.width, size.height, true);
  return Math.max(0, ...states.map(spec => {
    const rows = applyTransforms(viewRows(spec.data, {}) as DataRow[], domainTransforms(spec.transform || []));
    return chartType.legendHeight!(spec, { ...size, rows, legendOutside: true }, { ...shared, ...(spec.margin || {}) });
  }));
}
