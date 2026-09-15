// A standalone, seekable surface for one canonical chart pair. It mounts its
// own root under the host, compiles the pair into per-phase frame evaluators,
// and answers progress(value, direction) from DOM snapshots plus those
// evaluators. Nothing here depends on a timer.
import { renderChartShell } from './chart-shell.js';
import { createViewRenderer } from './view-renderer.js';
import type { ViewConfig, ViewLayoutSpec, ViewRuntimeScene } from './view-renderer.js';
import { resolveTarget } from './target.js';
import { inferTransition } from '../grammar/infer-transition.js';
import { captureDomFrame } from './dom-frame.js';
import type { DomFrame } from './dom-frame.js';
import { hideTooltip } from './marks.js';
import { clearSceneTransitionProgress } from '../transition-progress.js';
import type { SceneHostElement } from './scene.js';
import type { FrameEvaluator } from './tracks.js';
import type { ChartType, D3Lib, MarginSpec, RuntimeOptions } from '../types/index.js';
import type { ChartTypeRegistry } from '../charts/index.js';
import type { applyTransforms } from '../data/transforms.js';

type ArqueroRuntime = NonNullable<Parameters<typeof applyTransforms>[2]>;

export interface TransitionSurfaceOptions extends RuntimeOptions {
  d3: D3Lib;
  height?: number;
  /** Force the reconstruction bridge even for chart types that allow cached frames. */
  reconstruct?: boolean;
}

export interface TransitionSurface {
  readonly view: Element;
  commitMount(): void;
  rollbackMount(): void;
  progress(value: number, direction?: number): void;
  resize(): void;
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
  const { d3 } = options;
  // The public option is an opaque runtime bag; the resolved runtime always supplies Arquero.
  const aq = options.aq as unknown as ArqueroRuntime;
  const { drawView, prepareSeekSourceState, compileTransitionSource,
    renderSeekPhase, applySeekSequence } = createViewRenderer(chartTypes);
  const chartType = chartTypes.get(from);
  if (!chartType) throw new Error(`Unsupported chart type: ${String(from.mark)}`);
  const canonical = chartType.canonicalTransitionPair?.(from, to) ?? { from, to, reverse: false };
  const source = canonical.from;
  const target = canonical.to;
  const canonicalProgress = (value: number) => canonical.reverse ? 1 - value : value;
  const host = resolveTarget(options.target || '#app');
  const root = document.createElement('div');
  const styleKey = String(options.chartStyle?.key || 'd3').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  root.className = `vd-transition-root vd-style-${styleKey}`;
  root.dataset.chartStyle = styleKey;
  const shell = renderChartShell(root, 'main');
  const node = shell.views.main as SceneHostElement;
  const config: ViewConfig = {
    height: options.height ?? from.height ?? to.height ?? 500,
    margin: invariantTransitionMargin(chartType, source, target)
  };
  const scenes = { scene: inferTransition(source, target) };
  // Cache only when the selected chart type explicitly opts into reusable-frame
  // contract. Unspecified/custom renderers use the reconstruction bridge.
  const cacheFrames = chartType.transitionEvaluation === 'cached' && options.reconstruct !== true;
  let cached: FrameEvaluator | null = null;
  const runtimeScene = () => node.__visDeltaScene as ViewRuntimeScene | undefined;
  const disposeScene = () => {
    const scene = runtimeScene();
    if (scene) {
      clearSceneTransitionProgress(scene, { finish: false });
      if (scene.phaseTimer) window.clearTimeout(scene.phaseTimer);
    }
    d3.select(node).selectAll('*').interrupt();
    node.replaceChildren();
    delete node.__visDeltaScene;
  };
  let previousChildren: Node[] = Array.from(host.childNodes);
  host.replaceChildren(root);

  function compileFrames(): FrameEvaluator {
    disposeScene();
    prepareSeekSourceState(node, config, {}, shell.tooltip, d3, aq, compileTransitionSource(source));
    const startFrame = captureDomFrame(node);
    drawView(node, target, config, {}, shell.tooltip, d3, aq, scenes, { previousViewSpec: source, seekable: true });
    const scene = runtimeScene();
    if (!scene?.transitionProgress) throw new Error('VisDelta could not compile the transition: no seekable render was produced.');
    const controller = scene.transitionProgress;
    const phases = scene.seekSequence?.phases ?? [{ start: 0, end: 1, reverse: false }];
    const frames: PhaseFrame[] = phases.map((phase, index) => {
      if (index > 0) renderSeekPhase(scene, index);
      const evaluator = (scene.transitionProgress ?? controller).compile();
      return {
        start: phase.start,
        end: phase.end,
        evaluator,
        dom: captureDomFrame(node),
        reverse: Boolean(phase.reverse)
      };
    });
    // Save the clean endpoint (no zero-opacity exit marks/ticks), while keeping
    // detached nodes alive in the phase snapshots for later reverse seeks.
    clearSceneTransitionProgress(scene, { finish: true });
    prepareSeekSourceState(node, config, {}, shell.tooltip, d3, aq, compileTransitionSource(target));
    const endFrame = captureDomFrame(node);
    let activeFrame: DomFrame = endFrame;
    const activate = (frame: DomFrame) => {
      if (activeFrame !== frame) { frame.restore(); activeFrame = frame; }
    };
    return {
      progress(value, direction = 1) {
        if (value === 0) { startFrame.restore(); activeFrame = startFrame; return; }
        if (value === 1) { endFrame.restore(); activeFrame = endFrame; return; }
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
    view: node,
    commitMount() { previousChildren = []; },
    rollbackMount() {
      if (root.parentNode === host) host.replaceChildren(...previousChildren);
      previousChildren = [];
    },
    progress(value, direction = 0) {
      hideTooltip(shell.tooltip);
      value = canonicalProgress(value);
      const canonicalDirection = (direction || 1) * (canonical.reverse ? -1 : 1);
      if (cacheFrames) {
        cached ??= compileFrames();
        cached.progress(value, canonicalDirection);
        return;
      }
      disposeScene();
      if (value === 0 || value === 1) {
        const endpoint = compileTransitionSource(value === 0 ? source : target);
        prepareSeekSourceState(node, config, {}, shell.tooltip, d3, aq, endpoint);
      } else {
        drawView(node, target, config, {}, shell.tooltip, d3, aq, scenes, {
          previousViewSpec: source,
          seekable: true
        });
        // The pair's progress is already normalized. Chart-local timing and
        // step order apply inside the plan.
        const scene = runtimeScene();
        if (scene && !applySeekSequence(scene, value, canonicalDirection)) {
          scene.transitionProgress?.progress(value, canonicalDirection);
        }
      }
    },
    resize() { cached = null; },
    destroy() { cached = null; disposeScene(); root.remove(); }
  };
}

/** One margin for both endpoints, so a clip edge never moves independently of its marks. */
function invariantTransitionMargin(chartType: ChartType, source: ViewLayoutSpec, target: ViewLayoutSpec): Partial<MarginSpec> {
  const resolve = (spec: ViewLayoutSpec): Partial<MarginSpec> => ({ ...chartType.defaultMargin(spec), ...(spec.margin || {}) });
  const a = resolve(source);
  const b = resolve(target);
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return Object.fromEntries(sides.map((side) => [
    side,
    Math.max(Number(a[side]) || 0, Number(b[side]) || 0)
  ])) as Partial<MarginSpec>;
}
