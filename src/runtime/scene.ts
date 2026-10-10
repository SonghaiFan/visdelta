import { specState } from '../spec-meta.js';
import { clearSceneTransitionProgress } from '../transition-progress.js';
import { markAxisInactive } from './axis-motion.js';
import type { ProgressController } from './tracks.js';
import { select } from 'd3-selection';
import type {
  ChartContext,
  ChartSceneContext,
  ChartSelection,
  ViewSpec
} from '../types/index.js';

export type SceneProgressController = ProgressController;

export interface SceneHostElement extends HTMLElement {
  __visDeltaScene?: RuntimeScene;
}

export interface RuntimeScene extends ChartSceneContext {
  node: SceneHostElement;
  /** The library-owned D3 runtime; motion() reads it through the mount element. */
  frame: ChartSelection<SVGGElement>;
  empty: ChartSelection<HTMLDivElement>;
  previousSpec: ViewSpec | null;
  width: number;
  height: number;
  transitionProgress?: SceneProgressController | null;
  seekSequence?: unknown;
}

interface SceneViewConfig {
  height?: number;
}

interface SceneChart extends ChartContext {
  scene: RuntimeScene;
  sceneTransition?: { scene: string[] };
}

let sceneIdentity = 0;

export function getScene(node: SceneHostElement, viewConfig: SceneViewConfig): RuntimeScene {
  if (node.__visDeltaScene) return node.__visDeltaScene;
  const width = Math.max(60, node.clientWidth || 720);
  const height = viewConfig.height || 500;
  node.innerHTML = '';
  const svg = select(node).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img');
  const frame = svg.append('g').attr('class', 'vd-frame');
  const grid = frame.append('g').attr('class', 'vd-grid');
  const markRoot = frame.append('g').attr('class', 'vd-mark-root');
  const scene: RuntimeScene = {
    clipIdentity: ++sceneIdentity,
    node,
    svg: svg as ChartSelection<SVGSVGElement>,
    frame: frame as ChartSelection<SVGGElement>,
    grid: grid as ChartSelection<SVGGElement>,
    markRoot: markRoot as ChartSelection<SVGGElement>,
    xAxis: svg.append('g').attr('class', 'vd-axis vd-x-axis') as ChartSelection<SVGGElement>,
    yAxis: svg.append('g').attr('class', 'vd-axis vd-y-axis') as ChartSelection<SVGGElement>,
    xLabel: svg.append('text').attr('class', 'vd-axis-label vd-x-label') as ChartSelection<SVGTextElement>,
    yLabel: svg.append('text').attr('class', 'vd-axis-label vd-y-label') as ChartSelection<SVGTextElement>,
    legend: svg.append('g').attr('class', 'vd-legend') as ChartSelection<SVGGElement>,
    markLayers: new Map<string, ChartSelection<SVGGElement>>(),
    previousSpec: null,
    width,
    height,
    empty: select(node).append('div').attr('class', 'vd-empty').style('display', 'none') as ChartSelection<HTMLDivElement>
  };
  node.__visDeltaScene = scene;
  return scene;
}

export function resizeScene(scene: RuntimeScene, width: number, height: number): void {
  scene.width = width;
  scene.height = height;
  scene.svg.attr('viewBox', `0 0 ${width} ${height}`);
}

export function resetSceneToEmptySource(scene: RuntimeScene): void {
  clearSceneTransitionProgress(scene, { finish: false });
  scene.grid.selectAll('*').remove();
  scene.xAxis.style('opacity', 0).selectAll('*').remove();
  scene.yAxis.style('opacity', 0).selectAll('*').remove();
  markAxisInactive(scene.grid);
  markAxisInactive(scene.xAxis);
  markAxisInactive(scene.yAxis);
  scene.xLabel.style('opacity', 0).text('');
  scene.yLabel.style('opacity', 0).text('');
  scene.legend.style('opacity', 0).selectAll('*').remove();
  scene.markLayers?.forEach((layer) => { layer.selectAll('*').remove(); });
  scene.previousSpec = null;
}

export function recordSceneDiagnostics(chart: SceneChart, spec: ViewSpec): void {
  const sceneTypes = chart.sceneTransition?.scene || [];
  const state = specState(spec);
  chart.scene.node.dataset.sceneTransition = sceneTypes.join(' ');
  chart.scene.node.dataset.sceneState = Object.keys(state.sceneState || {}).join(' ');
  chart.scene.node.dataset.transitionSteps = chart.transitionPlan?.steps
    ? chart.transitionPlan.steps.map((step) => step.part).filter(Boolean).join(' ')
    : '';
}
