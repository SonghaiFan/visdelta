// @ts-nocheck — D3 frame snapshots are private to this surface.
import { renderChartShell } from './chart-shell.js';
import { createViewRenderer } from './view-renderer.js';
import { resolveTarget } from './target.js';
import { inferTransition } from '../grammar/infer-transition.js';
import { captureDomFrame } from './dom-frame.js';
import { hideTooltip } from './marks.js';
import { VISDELTA_TRANSITION_NAME, clearSceneTransitionProgress } from '../transition-progress.js';
import type { AnyRecord } from '../types/index.js';
import type { ChartTypeRegistry } from '../charts/index.js';

export function createTransitionSurface(from: AnyRecord, to: AnyRecord, options: AnyRecord, chartTypes: ChartTypeRegistry) {
  const { d3, aq } = options;
  const { drawView, prepareSeekSourceState, compileTransitionSource,
    renderSeekPhase, applySeekSequence } = createViewRenderer(chartTypes);
  const chartType = chartTypes.get(from);
  if (!chartType) throw new Error(`Unsupported chart type: ${from.mark}`);
  const canonical = chartType.canonicalTransitionPair?.(from, to) ?? { from, to, reverse: false };
  const source = canonical.from;
  const target = canonical.to;
  const canonicalProgress = value => canonical.reverse ? 1 - value : value;
  const host = resolveTarget(options.target || '#app');
  const root = document.createElement('div');
  const styleKey = String(options.chartStyle?.key || 'd3').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  root.className = `vd-transition-root vd-style-${styleKey}`;
  root.dataset.chartStyle = styleKey;
  const shell = renderChartShell(root, 'main');
  const node = shell.views.main as any;
  const config = {
    height: options.height ?? from.height ?? to.height ?? 500,
    margin: invariantTransitionMargin(chartType, source, target)
  };
  const scenes = { scene: inferTransition(source, target) };
  // Cache only when the selected chart type explicitly opts into reusable-frame
  // contract. Unspecified/custom renderers use the reconstruction bridge.
  const cacheFrames = chartType.transitionEvaluation === 'cached' && options.reconstruct !== true;
  let cached = null;
  const disposeScene = () => {
    const scene = node.__visDeltaScene;
    if (scene) {
      clearSceneTransitionProgress(scene, { finish: false });
      if (scene.phaseTimer) window.clearTimeout(scene.phaseTimer);
    }
    d3.select(node).selectAll('*').interrupt().interrupt(VISDELTA_TRANSITION_NAME);
    node.replaceChildren();
    delete node.__visDeltaScene;
  };
  let previousChildren = [...host.childNodes];
  host.replaceChildren(root);

  function compileFrames() {
    disposeScene();
    prepareSeekSourceState(node, config, {}, shell.tooltip, d3, aq, compileTransitionSource(source));
    const startFrame = captureDomFrame(node);
    drawView(node, target, config, {}, shell.tooltip, d3, aq, scenes, { previousViewSpec: source, seekable: true });
    const scene = node.__visDeltaScene;
    const phases = scene.seekSequence?.phases ?? [{ start: 0, end: 1 }];
    const frames = phases.map((phase, index) => {
      if (index > 0) renderSeekPhase(scene, index);
      const evaluator = scene.transitionProgress.compile();
      return {
        start: phase.start,
        end: phase.end,
        evaluator,
        dom: captureDomFrame(node),
        reverse: phase.reverse
      };
    });
    // Save the clean endpoint (no zero-opacity exit marks/ticks), while keeping
    // detached nodes alive in the phase snapshots for later reverse seeks.
    clearSceneTransitionProgress(scene, { finish: true });
    prepareSeekSourceState(node, config, {}, shell.tooltip, d3, aq, compileTransitionSource(target));
    const endFrame = captureDomFrame(node);
    let activeFrame = endFrame;
    const activate = (frame) => {
      if (activeFrame !== frame) { frame.restore(); activeFrame = frame; }
    };
    return {
      progress(value, direction = 1) {
        if (value === 0) { startFrame.restore(); activeFrame = startFrame; return; }
        if (value === 1) { endFrame.restore(); activeFrame = endFrame; return; }
        const frame = frames.find(frame => value <= frame.end) ?? frames[frames.length - 1];
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
    view: node as Element,
    commitMount() { previousChildren = []; },
    rollbackMount() {
      if (root.parentNode === host) host.replaceChildren(...previousChildren);
      previousChildren = [];
    },
    progress(value: number, direction = 0) {
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
        const scene = node.__visDeltaScene;
        if (!applySeekSequence(scene, value, canonicalDirection)) {
          scene.transitionProgress?.progress(value, canonicalDirection);
        }
      }
    },
    resize() { cached = null; },
    destroy() { cached = null; disposeScene(); root.remove(); }
  };
}

function invariantTransitionMargin(chartType, source, target) {
  const resolve = spec => ({ ...chartType.defaultMargin(spec), ...(spec.margin || {}) });
  const a = resolve(source);
  const b = resolve(target);
  return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [
    side,
    Math.max(Number(a[side]) || 0, Number(b[side]) || 0)
  ]));
}
