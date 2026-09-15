import type { BaseType, Selection } from 'd3-selection';
import { matchesSelection, viewHighlight } from '../../focus.js';
import { DIVIDER_DRAW_PROGRESS } from '../detail-timing.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RenderDatum } from '../../runtime/marks.js';
import { motion } from '../../runtime/recorder.js';
import type { Motion, MotionTiming } from '../../runtime/recorder.js';
import { select } from 'd3-selection';
import type {
  ChartContext,
  StaggerSpec,
  TransitionItemAction,
  TransitionStep,
  ViewSpec
} from '../../types/index.js';

// ─── Shared bar types ─────────────────────────────────────────────────────────

/** A plotted bar row. Stacked layouts add the segment's stack extent. */
export interface BarDatum extends RenderDatum {
  __stack0?: number;
  __stack1?: number;
}

export type BarKey = (this: Element, d: BarDatum, i: number) => string | number;
export type BarRectSelection = Selection<SVGRectElement, BarDatum, BaseType, unknown>;
export type BarMotion = Motion<SVGRectElement, BarDatum>;
/** A live selection or recorded motion: anything that takes a numeric attr write. */
export interface RectAttrWriter {
  attr(name: string, value: number): unknown;
}

export interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GeometryValue = number | ((d: BarDatum) => number);

/** Per-property target geometry; constant when it does not depend on the datum. */
export interface TargetGeometry {
  x: GeometryValue;
  y: GeometryValue;
  width: GeometryValue;
  height: GeometryValue;
}

/** What a bar layout tells the shared join about its rectangles. */
export interface BarGeometryContract {
  /** Where an entering bar starts (null: at its target). */
  start(d: BarDatum): RectGeometry | null;
  target: TargetGeometry;
  applyX(target: BarMotion): unknown;
  applyY(target: BarMotion): unknown;
  apply(target: BarMotion): unknown;
  /** Geometry for a leaving bar, or null to leave it in place. */
  exit: ((target: BarMotion) => unknown) | null;
}

export interface BarSteps {
  chart: ChartContext;
  ordered: TransitionStep[];
  duration: number;
  startDelay: number;
  ease: MotionTiming['ease'];
  stagger: StaggerSpec | number | undefined;
  begin(selection: BarRectSelection): BarMotion;
}

export interface LineageStart {
  start(d: BarDatum): RectGeometry | null;
}

export interface SourceBaselineExitOptions {
  horizontal?: boolean;
  plan?: TransitionItemAction | null;
  value?: ((d: BarDatum) => unknown) | null;
}

export interface BarJoinOptions {
  chart: ChartContext;
  rows: BarDatum[];
  spec: ViewSpec;
  tooltip: HTMLElement;
  bindTooltip: ChartRuntimeDeps['bindTooltip'];
  key: BarKey;
  category: (d: BarDatum) => unknown;
  className: string;
  orientation: string;
  rx?: number;
  fill: (d: BarDatum) => string;
  geometry: BarGeometryContract;
  steps: BarSteps | null;
  applyIdentity: (selection: BarRectSelection, spec: ViewSpec, key: BarKey, category: (d: BarDatum) => unknown) => unknown;
}

export interface BarSeamOptions {
  chart: ChartContext;
  path?: string;
  startPath?: string;
  draw?: boolean;
}

export type BarRenderKit = ReturnType<typeof createBarRenderKit>;

type MarkGeometry = { x: BarGeometryContract['applyX']; y: BarGeometryContract['applyY'] };

export function createBarRenderKit(deps: ChartRuntimeDeps) {
  const { easeFor, staggerDelay, themeValue } = deps;

  function steps(chart: ChartContext, rendererOrientation: string): BarSteps | null {
    const plan = chart.transitionPlan;
    if (!plan?.steps?.length) return null;
    if (plan.target?.renderer !== rendererOrientation) return null;
    const ordered = plan.steps.filter((step) =>
      (step.part === 'x' || step.part === 'y') &&
      step.changes.includes('marks'));
    if (!ordered.length) return null;
    const timing = plan.timing || {};
    const duration = chart.transition.scaleDuration || timing.duration || chart.transition.duration || 0;
    const ease = easeFor(timing.ease || chart.transition.ease);
    return {
      chart,
      ordered,
      duration,
      startDelay: chart.transition.exitDuration || 0,
      ease,
      stagger: chart.camera?.bounds ? undefined : timing.stagger,
      // First step of a mark sequence.
      begin(selection) {
        return motion(selection, { delay: 0, duration, ease });
      }
    };
  }

  function applyMarkSteps(
    selection: BarRectSelection,
    steps: BarSteps,
    spec: ViewSpec,
    markGeometry: MarkGeometry,
    baseAttrs?: (target: BarMotion) => unknown
  ): void {
    let current: BarMotion | null = null;
    steps.ordered.forEach((step, index) => {
      const applyMarks = step.part === 'x' ? markGeometry.x : step.part === 'y' ? markGeometry.y : undefined;
      if (!applyMarks) return;
      current = index === 0
        ? steps.begin(selection)
            .delay((d, i) => steps.startDelay + staggerDelay(spec, d, i, steps.stagger))
        : current!.transition().duration(steps.duration).ease(steps.ease);
      if (index === 0 && baseAttrs) baseAttrs(current);
      applyMarks(current);
    });
  }

  function axisTransition(steps: BarSteps | null, part: 'x' | 'y'): MotionTiming | null {
    if (!steps?.ordered?.length) return null;
    const index = steps.ordered.findIndex((step) =>
      step.part === part && step.changes.includes('axis'));
    if (index < 0) return null;
    return { delay: steps.startDelay + index * steps.duration, duration: steps.duration, ease: steps.ease };
  }

  return {
    applyMarkSteps,
    axisTransition,
    baselineEnterPlan,
    baselineExitPlan,
    barSelectionOpacity,
    collapseLineage,
    renderBarJoin,
    renderBarSeams,
    setRectGeometry,
    splitLineage,
    sourceBaselineExit,
    steps
  };

  function renderBarJoin(options: BarJoinOptions): void {
    const {
      chart, rows, spec, tooltip, bindTooltip, key, category, className, orientation,
      rx = 3, fill, geometry, steps
    } = options;
    const startGeometry = geometry.start;
    const targetGeometry = geometry.target;
    const markGeometry: MarkGeometry = { x: geometry.applyX, y: geometry.applyY };
    const applyGeometry = geometry.apply;
    const exitGeometry = geometry.exit;
    const dimOpacity = themeValue('--vd-dim-opacity', 0.22);
    // A focus change is one rigid camera move. Per-mark staggering would bend
    // the coordinate system: bars would temporarily leave the shared axis
    // baseline even though neither their data nor identity changed.
    const delay = chart.camera?.bounds
      ? () => 0
      : (d: BarDatum, i: number) => staggerDelay(spec, d, i);

    chart.g.selectAll<SVGRectElement, BarDatum>('rect.vd-bar')
      .data(rows, key)
      .join(
        (enter) => {
          const entered = enter
            .append('rect')
            .attr('class', className)
            .attr('data-orientation', orientation)
            .call(options.applyIdentity, spec, key, category)
            .attr('rx', rx)
            .attr('fill', fill)
            .style('opacity', 0)
            .call(bindTooltip, spec, tooltip)
            .each(function(d) { setRectGeometry(select(this), startGeometry(d)); });
          motion(entered, chart.transition.enter || chart.transition.base)
            .delay((d, i) => (chart.transition.enterDelay || 0) + delay(d, i))
            .style('opacity', (d) => barSelectionOpacity(d, spec, dimOpacity))
            .attr('x', targetGeometry.x)
            .attr('y', targetGeometry.y)
            .attr('width', targetGeometry.width)
            .attr('height', targetGeometry.height);
          return entered;
        },
        (update) => {
          const prepared = update
            .attr('class', className)
            .attr('data-orientation', orientation)
            .call(options.applyIdentity, spec, key, category)
            .call(bindTooltip, spec, tooltip);
          if (steps) {
            applyMarkSteps(prepared, steps, spec, markGeometry,
              (target) => target.style('opacity', (d) => barSelectionOpacity(d, spec, dimOpacity)).attr('fill', fill));
            return prepared;
          }
          motion(prepared, chart.transition.base)
            .delay((d, i) => (chart.transition.exitDuration || 0) + delay(d, i))
            .style('opacity', (d) => barSelectionOpacity(d, spec, dimOpacity))
            .call(applyGeometry)
            .attr('fill', fill);
          return prepared;
        },
        (exit) => {
          // A filtered/deleted bar leaves in the coordinate system where it
          // was read. Only after it is gone may the shared scale move.
          const leaving = motion(exit, chart.transition.exit || chart.transition.base).style('opacity', 0);
          if (exitGeometry && !chart.transition.exitFirst) exitGeometry(leaving);
          leaving.remove();
          return exit;
        }
      );
  }

  function renderBarSeams({ chart, path = '', startPath = path, draw = false }: BarSeamOptions): void {
    const seams = chart.g.selectAll<SVGPathElement, string>('path.vd-bar-seam').data(path ? [path] : []);
    motion(seams.exit(), chart.transition.base).style('opacity', 0).remove();
    const seam = seams.enter().append('path')
      .attr('class', 'vd-bar-seam')
      .style('opacity', 0)
      .attr('d', startPath)
      .merge(seams);
    if (!draw) return;
    const total = chart.transition.duration || 0;
    const drawDuration = Math.max(1, total * DIVIDER_DRAW_PROGRESS);
    motion(seam, chart.transition.base)
      .duration(drawDuration)
      .style('opacity', 1)
      .attr('d', (d) => d)
      .transition()
      .duration(Math.max(1, total - drawDuration))
      .style('opacity', 0)
      .remove();
  }
}

export function setRectGeometry(selection: RectAttrWriter, geometry: RectGeometry | null): void {
  const rect = geometry || { x: 0, y: 0, width: 0, height: 0 };
  selection.attr('x', rect.x);
  selection.attr('y', rect.y);
  selection.attr('width', Math.max(0, rect.width));
  selection.attr('height', Math.max(0, rect.height));
}

export function collapseLineage(chart: ChartContext, parentField: string | undefined): LineageStart | null {
  const enterPlan = chart.transitionPlan?.enter;
  if (enterPlan?.mode !== 'parent-child-lineage' || enterPlan.from !== 'child-bounds' || !parentField) return null;
  const bounds = new Map<string, RectGeometry>();
  chart.g.selectAll<SVGRectElement, unknown>('rect.vd-bar').each(function() {
    const node = this;
    const parent = node.dataset.category || parentFromChildKey(node.dataset.key);
    const box = rectGeometry(node);
    if (!parent || !box) return;
    const current = bounds.get(parent);
    bounds.set(parent, current ? unionRect(current, box) : box);
  });
  if (!bounds.size) return null;
  return { start(d) { return bounds.get(String(d[parentField])) || null; } };
}

export function splitLineage(chart: ChartContext): LineageStart | null {
  const enterPlan = chart.transitionPlan?.enter;
  if (enterPlan?.mode !== 'parent-child-lineage' || enterPlan.from !== 'parent-bounds' || !enterPlan.parentKey) return null;
  const parentKey = enterPlan.parentKey;
  const bounds = new Map<string, RectGeometry>();
  chart.g.selectAll<SVGRectElement, unknown>('rect.vd-bar').each(function() {
    const node = this;
    const parent = node.dataset.category || node.dataset.key;
    const box = rectGeometry(node);
    if (parent && box) bounds.set(parent, box);
  });
  return {
    start(d) { return bounds.get(String(d[parentKey])) || null; }
  };
}

export function baselineEnterPlan(chart: ChartContext, from: string): TransitionItemAction | null {
  const enterPlan = chart.transitionPlan?.enter;
  return enterPlan?.mode === 'baseline' && enterPlan.from === from ? enterPlan : null;
}

export function baselineExitPlan(chart: ChartContext, to: string): TransitionItemAction | null {
  const exitPlan = chart.transitionPlan?.exit;
  return exitPlan?.mode === 'baseline' && exitPlan.to === to ? exitPlan : null;
}

export function sourceBaselineExit(
  selection: BarMotion,
  { horizontal = false, plan = null, value = null }: SourceBaselineExitOptions = {}
): BarMotion {
  return selection
    .attr('x', function(d) {
      const rect = currentRect(this);
      const sourceHorizontal = sourceRectIsHorizontal(this, plan, horizontal);
      if (!sourceHorizontal) return rect.x;
      return sourceValue(d, value) < 0 ? rect.x + rect.width : rect.x;
    })
    .attr('width', function() { return sourceRectIsHorizontal(this, plan, horizontal) ? 0 : currentRect(this).width; })
    .attr('y', function(d) {
      const rect = currentRect(this);
      const sourceHorizontal = sourceRectIsHorizontal(this, plan, horizontal);
      if (sourceHorizontal) return rect.y;
      return sourceValue(d, value) < 0 ? rect.y : rect.y + rect.height;
    })
    .attr('height', function() { return sourceRectIsHorizontal(this, plan, horizontal) ? currentRect(this).height : 0; });
}

function currentRect(node: Element): RectGeometry {
  return {
    x: Number(node.getAttribute('x')) || 0,
    y: Number(node.getAttribute('y')) || 0,
    width: Number(node.getAttribute('width')) || 0,
    height: Number(node.getAttribute('height')) || 0
  };
}

function sourceRectIsHorizontal(node: Element, plan: TransitionItemAction | null, fallbackHorizontal: boolean): boolean {
  const orientation = String(node.getAttribute('data-orientation') || plan?.sourceOrientation || '');
  if (orientation.includes('horizontal')) return true;
  if (orientation.includes('vertical')) return false;
  return fallbackHorizontal;
}

function sourceValue(d: BarDatum, value: SourceBaselineExitOptions['value']): number {
  if (typeof value !== 'function') return 1;
  const resolved = Number(value(d));
  return Number.isFinite(resolved) ? resolved : 1;
}

export function barSelectionOpacity(row: BarDatum, spec: ViewSpec = {}, dimOpacity = 0.22): number {
  const selection = viewHighlight(spec);
  if (selection?.mode !== 'highlight' || !(selection.filters?.length || selection.filter)) return 1;
  return matchesSelection(row.__row || row, selection) ? 1 : Number(selection.opacity ?? dimOpacity);
}

function rectGeometry(node: Element): RectGeometry | null {
  const x = rectNumber(node, 'x'), y = rectNumber(node, 'y');
  const width = rectNumber(node, 'width'), height = rectNumber(node, 'height');
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function rectNumber(node: Element, attr: string): number {
  const value = Number(node.getAttribute(attr));
  return Number.isFinite(value) ? value : NaN;
}

function unionRect(a: RectGeometry, b: RectGeometry): RectGeometry {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function parentFromChildKey(key = ''): string | null {
  return String(key).includes('|') ? String(key).split('|')[0] : null;
}
