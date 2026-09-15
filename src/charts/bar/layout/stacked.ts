import { applyBarIdentity, barKeyAccessor } from '../keys.js';
import { cameraScale, cameraSize, focusCamera, viewSelection } from '../../../focus.js';
import {
  asRuntimeScale, bandwidth, barCategoryChannel, barMeasureChannel, barOrientationFromEncoding, barRendererKey,
  geometryBounds, resolveGeometry, scaled
} from './index.js';
import { specState } from '../../../spec-meta.js';
import { drawBarAxes } from '../axes.js';
import type { ChartRuntimeDeps } from '../../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../../runtime/marks.js';
import type { ChannelSpec, ChartContext, D3Lib, TransitionItemAction } from '../../../types/index.js';
import type {
  BarDatum,
  BarGeometryContract,
  BarMotion,
  BarRenderKit,
  LineageStart,
  RectGeometry,
  TargetGeometry
} from '../render-pattern.js';
import type { BarLayoutRenderer } from './simple.js';

interface StackedGeom {
  x: RuntimeScale;
  y: RuntimeScale;
  categoryField: string;
  valueField: string;
  chart: ChartContext;
  horizontal: boolean;
}

/** A bar row with its resolved stack extent. */
type StackedDatum = BarDatum & { __stack0: number; __stack1: number };

export function createStackedBarRenderer(deps: ChartRuntimeDeps, kit: BarRenderKit): BarLayoutRenderer {
  const { bindTooltip, channelDomain, colorScale, position, themeValue } = deps;

  return function renderStackedBar(chart, rows, spec, tooltip, d3, segmentFieldName) {
    const enc = spec.encoding || {};
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const orientation = barOrientationFromEncoding(enc);
    const horizontal = orientation === 'horizontal';
    const rendererOrientation = barRendererKey('stacked', orientation);
    const categoryChannel = barCategoryChannel(enc);
    const measureChannel = barMeasureChannel(enc);
    const categoryField = categoryChannel.field ?? '';
    const valueField = measureChannel.field ?? '';
    const segmentField = segmentFieldName ?? '';
    const state = specState(spec);
    const stateSegments = (state.sceneState?.detail?.segments || state.detail?.segments) as unknown[] | undefined;
    const selection = viewSelection(spec);
    const categories = channelDomain(rows, categoryChannel) as string[];
    // A display sort may reorder categories, but must not silently reorder the
    // stack's segment meaning. Domain rows deliberately exclude sort/filter.
    const segments = channelDomain(domainRows, { field: segmentField, domain: stateSegments });
    const color = colorScale(domainRows, enc.color, d3);
    const key = barKeyAccessor(chart, spec, [categoryField, segmentField]);
    const splitLineage = kit.splitLineage(chart);
    const stackBaseEnter = kit.baselineEnterPlan(chart, 'stack-base');
    const stackBaseExit = kit.baselineExitPlan(chart, 'stack-base');

    const categoryRange: [number, number] = horizontal ? [0, chart.innerHeight] : [0, chart.innerWidth];
    const stackedRows = stackBarRows(rows, categoryField, segmentField, valueField, segments);
    const domainStackedRows = stackBarRows(domainRows, categoryField, segmentField, valueField, segments);
    const stackDomain = stackedValueDomain(domainStackedRows, measureChannel, d3);
    const baseCategoryScale = asRuntimeScale(d3.scaleBand().domain(categories).range(categoryRange).padding(0.24));
    const baseMeasureScale = asRuntimeScale(d3.scaleLinear().domain(stackDomain)
      .range(horizontal ? [0, chart.innerWidth] : [chart.innerHeight, 0]).nice());
    const baseX = horizontal ? baseMeasureScale : baseCategoryScale;
    const baseY = horizontal ? baseCategoryScale : baseMeasureScale;
    const baseGeom: StackedGeom = { x: baseX, y: baseY, categoryField, valueField, chart, horizontal };
    const baseGeometry = stackedSegmentGeometry(baseGeom);
    const camera = focusCamera(
      stackedRows.map((row) => ({ datum: row, bounds: geometryBounds(baseGeometry, row) })),
      selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const categoryScale = cameraScale(baseCategoryScale, camera, horizontal ? 'y' : 'x');
    const measureScale = cameraScale(baseMeasureScale, camera, horizontal ? 'x' : 'y');
    const x = horizontal ? measureScale : categoryScale;
    const y = horizontal ? categoryScale : measureScale;
    const geom: StackedGeom = { x, y, categoryField, valueField, chart, horizontal };
    const steps = kit.steps(chart, rendererOrientation, d3);
    const xAxisTransition = kit.axisTransition(steps, 'x') || chart.transition.base;
    const yAxisTransition = kit.axisTransition(steps, 'y') || chart.transition.base;
    const geometry = stackedSegmentGeometryContract(geom, splitLineage, stackBaseEnter, stackBaseExit, kit.sourceBaselineExit);

    chart.scales = { x, y, color, orientation: rendererOrientation };
    chart.camera = camera;
    chart.channels = enc;
    chart.position = {
      x: (d: BarDatum) => horizontal ? scaled(x, stackMidpoint(d)) : position(x, d[categoryField]),
      y: (d: BarDatum) => horizontal ? position(y, d[categoryField]) : scaled(y, stackMidpoint(d))
    };

    drawBarAxes(chart, x, y, enc, d3, deps, horizontal, {
      xTransition: xAxisTransition,
      yTransition: yAxisTransition
    });

    kit.renderBarJoin({
      chart, rows: stackedRows, spec, tooltip, d3, bindTooltip, key,
      category: (d) => d[categoryField],
      className: 'vd-bar vd-bar-segment vd-bar-stacked',
      orientation: rendererOrientation, rx: cameraSize(themeValue('--vd-bar-radius', 3), camera),
      fill: (d) => color(d),
      applyIdentity: applyBarIdentity, steps, geometry
    });

    const seamRows = stackedInternalSeams(stackedRows, categoryField);
    kit.renderBarSeams({
      chart,
      d3,
      path: splitLineage ? stackedSeamPath(seamRows, geom) : '',
      startPath: stackedSeamPath(seamRows, geom, true),
      draw: Boolean(splitLineage)
    });
  };
}

function stack0(d: BarDatum): number {
  return Number(d.__stack0) || 0;
}

function stack1(d: BarDatum): number {
  return Number(d.__stack1) || 0;
}

function stackMidpoint(d: BarDatum): number {
  return (stack0(d) + stack1(d)) / 2;
}

function stackedSegmentGeometryContract(
  geom: StackedGeom,
  splitLineage: LineageStart | null,
  stackBaseEnter: TransitionItemAction | null,
  stackBaseExit: TransitionItemAction | null,
  sourceBaselineExit: BarRenderKit['sourceBaselineExit']
): BarGeometryContract {
  const target = stackedSegmentGeometry(geom);
  return {
    // When an aggregate parent splits, establish the final child boundaries
    // immediately. The render kit reveals the child fills over the old parent,
    // so the motion reads as a cut instead of two rectangles shrinking inward.
    start: (d) => splitLineage ? materializeRect(target, d) : stackedSegmentEnterGeometry(d, geom, stackBaseEnter),
    target,
    applyX: (selection) => applyStackedSegmentX(selection, geom),
    applyY: (selection) => applyStackedSegmentY(selection, geom),
    apply: (selection) => applyStackedSegmentGeometry(selection, geom),
    exit: splitLineage ? null : (selection) => applyStackedSegmentExitGeometry(selection, geom, stackBaseExit, sourceBaselineExit)
  };
}

function materializeRect(geometry: TargetGeometry, datum: BarDatum): RectGeometry {
  return {
    x: resolveGeometry(geometry.x, datum),
    y: resolveGeometry(geometry.y, datum),
    width: resolveGeometry(geometry.width, datum),
    height: resolveGeometry(geometry.height, datum)
  };
}

function stackedSegmentEnterGeometry(d: BarDatum, geom: StackedGeom, enterPlan: TransitionItemAction | null = null): RectGeometry {
  const { x, y, categoryField, horizontal } = geom;
  const base = stackSegmentBase(d, enterPlan);
  if (horizontal) {
    return { x: scaled(x, base), y: scaled(y, d[categoryField]), width: 0, height: Math.max(1, bandwidth(y)) };
  }
  return { x: scaled(x, d[categoryField]), y: scaled(y, base), width: Math.max(1, bandwidth(x)), height: 0 };
}

function applyStackedSegmentGeometry(selection: BarMotion, geom: StackedGeom): BarMotion {
  applyStackedSegmentX(selection, geom);
  applyStackedSegmentY(selection, geom);
  return selection;
}

function stackedSegmentGeometry(geom: StackedGeom): TargetGeometry {
  const { x, y, categoryField, horizontal } = geom;
  if (horizontal) {
    return {
      x: (d) => Math.min(scaled(x, stack0(d)), scaled(x, stack1(d))),
      width: (d) => Math.abs(scaled(x, stack1(d)) - scaled(x, stack0(d))),
      y: (d) => scaled(y, d[categoryField]),
      height: Math.max(1, bandwidth(y))
    };
  }
  return {
    x: (d) => scaled(x, d[categoryField]),
    width: Math.max(1, bandwidth(x)),
    y: (d) => Math.min(scaled(y, stack0(d)), scaled(y, stack1(d))),
    height: (d) => Math.abs(scaled(y, stack1(d)) - scaled(y, stack0(d)))
  };
}

function applyStackedSegmentX(selection: BarMotion, geom: StackedGeom): BarMotion {
  const { x, categoryField, horizontal } = geom;
  if (horizontal) {
    return selection
      .attr('x', (d) => Math.min(scaled(x, stack0(d)), scaled(x, stack1(d))))
      .attr('width', (d) => Math.abs(scaled(x, stack1(d)) - scaled(x, stack0(d))));
  }
  return selection
    .attr('x', (d) => scaled(x, d[categoryField]))
    .attr('width', Math.max(1, bandwidth(x)));
}

function applyStackedSegmentY(selection: BarMotion, geom: StackedGeom): BarMotion {
  const { y, categoryField, horizontal } = geom;
  if (horizontal) {
    return selection
      .attr('y', (d) => scaled(y, d[categoryField]))
      .attr('height', Math.max(1, bandwidth(y)));
  }
  return selection
    .attr('y', (d) => Math.min(scaled(y, stack0(d)), scaled(y, stack1(d))))
    .attr('height', (d) => Math.abs(scaled(y, stack1(d)) - scaled(y, stack0(d))));
}

function applyStackedSegmentExitGeometry(
  selection: BarMotion,
  geom: StackedGeom,
  exitPlan: TransitionItemAction | null,
  sourceBaselineExit: BarRenderKit['sourceBaselineExit']
): BarMotion {
  return sourceBaselineExit(selection, { horizontal: geom.horizontal, plan: exitPlan, value: stackSegmentValue });
}

function stackSegmentBase(d: BarDatum, plan: TransitionItemAction | null = null): number {
  const anchor = plan?.baseline?.anchor;
  return anchor ? Number(d[anchor]) || 0 : stack0(d);
}

function stackSegmentValue(d: BarDatum): number {
  if (Number.isFinite(Number(d.__stack0)) && Number.isFinite(Number(d.__stack1))) {
    return Number(d.__stack1) - Number(d.__stack0);
  }
  return 1;
}

function stackBarRows(
  rows: BarDatum[],
  categoryField: string,
  segmentField: string,
  valueField: string,
  segments: unknown[]
): StackedDatum[] {
  const positiveOffsets = new Map<unknown, number>();
  const negativeOffsets = new Map<unknown, number>();
  const segmentIndex = new Map(segments.map((segment, index) => [segment, index] as const));

  return rows.slice().sort((a, b) => {
    const cat = String(a[categoryField]).localeCompare(String(b[categoryField]));
    if (cat !== 0) return cat;
    return (segmentIndex.get(a[segmentField]) || 0) - (segmentIndex.get(b[segmentField]) || 0);
  }).map((row) => {
    const category = row[categoryField];
    const value = Number(row[valueField]) || 0;
    const offsets = value < 0 ? negativeOffsets : positiveOffsets;
    const start = offsets.get(category) || 0;
    const end = start + value;
    offsets.set(category, end);
    return { ...row, __stack0: start, __stack1: end };
  });
}

function stackedInternalSeams(rows: StackedDatum[], categoryField: string): StackedDatum[] {
  const negative = (d: StackedDatum) => d.__stack0 < 0 || d.__stack1 < 0;
  return rows.filter((row, index) => {
    const next = rows[index + 1];
    return next && row[categoryField] === next[categoryField] && negative(row) === negative(next);
  });
}

function stackedSeamPath(rows: StackedDatum[], geom: StackedGeom, collapsed = false): string {
  const { x, y, categoryField, horizontal } = geom;
  return rows.map((d) => {
    if (horizontal) {
      const edge = scaled(x, d.__stack1), start = scaled(y, d[categoryField]), middle = start + bandwidth(y) / 2;
      return `M${edge},${collapsed ? middle : start}V${collapsed ? middle : start + bandwidth(y)}`;
    }
    const edge = scaled(y, d.__stack1), start = scaled(x, d[categoryField]), middle = start + bandwidth(x) / 2;
    return `M${collapsed ? middle : start},${edge}H${collapsed ? middle : start + bandwidth(x)}`;
  }).join('');
}

function stackedValueDomain(rows: StackedDatum[], measureChannel: ChannelSpec, d3: D3Lib): number[] {
  if (Array.isArray(measureChannel.domain)) return measureChannel.domain as number[];
  const values = rows.flatMap((row) => [row.__stack0, row.__stack1]);
  const min = Math.min(0, d3.min(values) ?? 0);
  const max = Math.max(0, d3.max(values) ?? 1);
  return min === max ? [0, max || 1] : [min, max];
}
