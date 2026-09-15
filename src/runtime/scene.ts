import { keyAccessor } from '../identity/semantic-key.js';
import { specState } from '../spec-meta.js';
import { clearSceneTransitionProgress } from '../transition-progress.js';
import { hasScene } from '../transitions/index.js';
import { markAxisInactive } from './marks.js';
import { motion } from './recorder.js';
import type { ProgressController } from './tracks.js';
import type { MotionTiming } from './recorder.js';
import { clamp } from './utils.js';
import type {
  ChartContext,
  ChartSceneContext,
  ChartSelection,
  D3Lib,
  DataRow,
  EncodingSpec,
  ViewSpec
} from '../types/index.js';

type RootTransition = MotionTiming;

export type SceneProgressController = ProgressController;

export interface SceneHostElement extends HTMLElement {
  __visDeltaScene?: RuntimeScene;
  __visDeltaMarkName?: Element;
}

export interface RuntimeScene extends ChartSceneContext {
  node: SceneHostElement;
  /** The injected D3 instance; motion() reads it through the mount element. */
  d3: D3Lib;
  frame: ChartSelection<SVGGElement>;
  detailLayer: ChartSelection<SVGGElement>;
  axisLayer: ChartSelection<SVGGElement>;
  empty: ChartSelection<HTMLDivElement>;
  previousSpec: ViewSpec | null;
  width: number;
  height: number;
  phaseTimer?: number | null;
  transitionProgress?: SceneProgressController | null;
  seekSequence?: unknown;
}

interface SceneViewConfig {
  height?: number;
}

interface SceneSelector {
  index?: number;
  select?: 'first' | 'last' | 'min' | 'max';
  by?: string;
  field?: string;
  equal?: unknown;
  value?: unknown;
  oneOf?: unknown[];
  gte?: unknown;
  gt?: unknown;
  lte?: unknown;
  lt?: unknown;
}

interface ScenePoint {
  row: DataRow;
  x: number;
  y: number;
}

interface LineAttributes {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface SceneChart extends ChartContext {
  scene: RuntimeScene;
  sceneTransition?: { scene: string[] };
  position?: { x(row: DataRow): number; y(row: DataRow): number };
}

let sceneIdentity = 0;

export function getScene(node: SceneHostElement, viewConfig: SceneViewConfig, d3: D3Lib): RuntimeScene {
  if (node.__visDeltaScene) return node.__visDeltaScene;
  const width = Math.max(60, node.clientWidth || 720);
  const height = viewConfig.height || 500;
  node.innerHTML = '';
  const svg = d3.select(node).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img');
  const frame = svg.append('g').attr('class', 'vd-frame');
  const grid = frame.append('g').attr('class', 'vd-grid');
  const markRoot = frame.append('g').attr('class', 'vd-mark-root');
  const scene: RuntimeScene = {
    d3,
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
    detailLayer: markRoot.append('g').attr('class', 'vd-scene-layer vd-detail-layer') as ChartSelection<SVGGElement>,
    axisLayer: frame.append('g').attr('class', 'vd-scene-layer vd-axis-layer') as ChartSelection<SVGGElement>,
    empty: d3.select(node).append('div').attr('class', 'vd-empty').style('display', 'none') as ChartSelection<HTMLDivElement>
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
  scene.grid.interrupt().selectAll('*').remove();
  scene.xAxis.interrupt().style('opacity', 0).selectAll('*').remove();
  scene.yAxis.interrupt().style('opacity', 0).selectAll('*').remove();
  markAxisInactive(scene.grid);
  markAxisInactive(scene.xAxis);
  markAxisInactive(scene.yAxis);
  scene.xLabel.interrupt().style('opacity', 0).text('');
  scene.yLabel.interrupt().style('opacity', 0).text('');
  scene.legend.interrupt().style('opacity', 0).selectAll('*').remove();
  scene.axisLayer?.interrupt().selectAll('*').remove();
  scene.detailLayer?.interrupt().selectAll('*').remove();
  scene.markLayers?.forEach((layer) => { layer.interrupt().selectAll('*').remove(); });
  scene.previousSpec = null;
}

export function applySceneTransitions(chart: SceneChart, rows: DataRow[], spec: ViewSpec): void {
  const sceneTypes = chart.sceneTransition?.scene || [];
  const state = specState(spec);
  chart.scene.node.dataset.sceneTransition = sceneTypes.join(' ');
  chart.scene.node.dataset.sceneState = Object.keys(state.sceneState || {}).join(' ');
  chart.scene.node.dataset.transitionSteps = chart.transitionPlan?.steps
    ? chart.transitionPlan.steps.map((step) => step.part).filter(Boolean).join(' ')
    : '';
  clearSceneLayer(chart.scene.detailLayer, chart.transition.base);
  applyAxisScene(chart, rows, spec);
}

function applyAxisScene(chart: SceneChart, rows: DataRow[], spec: ViewSpec): void {
  const enabled = hasScene(chart.sceneTransition, 'axis');
  const cue = specState(spec).axis?.['cue'];
  const layer = chart.scene.axisLayer;
  if (!enabled || !cue || !chart.position || !rows.length) { clearSceneLayer(layer, chart.transition.base); return; }
  const axisSpec: SceneSelector = cue === true
    ? { select: 'max', by: spec.encoding?.y?.field }
    : cue as SceneSelector;
  const row = pickSceneRow(rows, axisSpec, spec.encoding || {});
  const x = row ? chart.position.x(row) : NaN;
  const y = row ? chart.position.y(row) : NaN;
  const data: ScenePoint[] = row && Number.isFinite(x) && Number.isFinite(y) ? [{ row, x, y }] : [];
  layer.raise().interrupt().style('opacity', 1);
  joinAxisLine(layer, 'vd-axis-rule-x', data, chart.transition.base, (d) => ({ x1: d.x, x2: d.x, y1: 0, y2: chart.innerHeight }));
  joinAxisLine(layer, 'vd-axis-rule-y', data, chart.transition.base, (d) => ({ x1: 0, x2: chart.innerWidth, y1: d.y, y2: d.y }));
  layer.selectAll<SVGCircleElement, ScenePoint>('circle.vd-axis-dot')
    .data(data, (d) => sceneRowKey(d.row, spec))
    .join(
      (enter) => {
        const entered = enter.append('circle').attr('class', 'vd-axis-dot')
          .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', 0);
        motion(entered, chart.transition.base).attr('r', 5);
        return entered;
      },
      (update) => {
        motion(update, chart.transition.base).attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', 5);
        return update;
      },
      (exit) => { motion(exit, chart.transition.base).attr('r', 0).remove(); }
    );
}

function joinAxisLine(
  layer: ChartSelection<SVGGElement>,
  className: string,
  data: ScenePoint[],
  transition: RootTransition,
  attrs: (datum: ScenePoint) => LineAttributes
): void {
  layer.selectAll<SVGLineElement, ScenePoint>(`line.${className}`)
    .data(data, (d) => sceneRowKey(d.row))
    .join(
      (enter) => {
        const entered = enter.append('line').attr('class', `vd-axis-rule ${className}`)
          .attr('x1', (d) => attrs(d).x1).attr('x2', (d) => attrs(d).x2)
          .attr('y1', (d) => attrs(d).y1).attr('y2', (d) => attrs(d).y2)
          .style('opacity', 0);
        motion(entered, transition).style('opacity', 1);
        return entered;
      },
      (update) => {
        motion(update, transition)
          .attr('x1', (d) => attrs(d).x1).attr('x2', (d) => attrs(d).x2)
          .attr('y1', (d) => attrs(d).y1).attr('y2', (d) => attrs(d).y2)
          .style('opacity', 1);
        return update;
      },
      (exit) => { motion(exit, transition).style('opacity', 0).remove(); }
    );
}

function clearSceneLayer(layer: ChartSelection<SVGGElement>, transition: RootTransition): void {
  layer.interrupt().style('opacity', 1);
  motion(layer.selectAll('*'), transition).style('opacity', 0).remove();
}

function pickSceneRow(rows: DataRow[], selector: SceneSelector = {}, encoding: EncodingSpec = {}): DataRow | null {
  if (!rows.length) return null;
  if (Number.isFinite(selector.index)) return rows[clamp(selector.index!, 0, rows.length - 1)];
  if (selector.select === 'first') return rows[0];
  if (selector.select === 'last') return rows[rows.length - 1];
  if (selector.field || selector.equal != null || selector.value != null || selector.oneOf) {
    return rows.find((row) => rowMatchesScene(row, selector)) || null;
  }
  const field = selector.by || encoding.y?.field || encoding.x?.field;
  if (field && selector.select === 'min') {
    return rows.reduce((best, row) => (Number(row[field]) < Number(best[field]) ? row : best), rows[0]);
  }
  if (field) {
    return rows.reduce((best, row) => (Number(row[field]) > Number(best[field]) ? row : best), rows[0]);
  }
  return rows[rows.length - 1];
}

function rowMatchesScene(row: DataRow | null, selector: SceneSelector = {}, selectedRow: DataRow | null = null): boolean {
  if (!row) return false;
  if (selector.field) {
    const value = row[selector.field];
    if ('equal' in selector) return value === selector.equal;
    if ('value' in selector) return value === selector.value;
    if ('oneOf' in selector) return Boolean(selector.oneOf?.includes(value));
    if ('gte' in selector && (value as any) < (selector.gte as any)) return false;
    if ('gt' in selector && (value as any) <= (selector.gt as any)) return false;
    if ('lte' in selector && (value as any) > (selector.lte as any)) return false;
    if ('lt' in selector && (value as any) >= (selector.lt as any)) return false;
    return Boolean(value);
  }
  return selectedRow ? row === selectedRow : false;
}

function sceneRowKey(row: DataRow | null, spec: ViewSpec = {}): string {
  if (!row) return 'axis';
  const key = keyAccessor(spec, spec.encoding?.x?.field || spec.encoding?.y?.field);
  return String(key(row, 0));
}
