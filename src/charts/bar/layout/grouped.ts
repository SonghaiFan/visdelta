import { applyBarIdentity, barKeyAccessor } from '../keys.js';
import { cameraScale, cameraSize, focusCamera, viewSelection } from '../../../focus.js';
import {
  asRuntimeScale, bandwidth, barCategoryChannel, barMeasureChannel, barOrientationFromEncoding, barRendererKey,
  geometryBounds, scaled
} from './index.js';
import { specState } from '../../../spec-meta.js';
import { drawBarAxes } from '../axes.js';
import type { ChartRuntimeDeps } from '../../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../../runtime/marks.js';
import type { ChartContext, TransitionItemAction } from '../../../types/index.js';
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

interface GroupedGeom {
  x: RuntimeScale;
  y: RuntimeScale;
  /** Segment offset scale within a category band, along the category axis. */
  x1: RuntimeScale | null;
  y1: RuntimeScale | null;
  categoryField: string;
  segmentField: string;
  valueField: string;
  chart: ChartContext;
  horizontal: boolean;
}

export function createGroupedBarRenderer(deps: ChartRuntimeDeps, kit: BarRenderKit): BarLayoutRenderer {
  const { bindTooltip, channelDomain, colorScale, quantitativeDomain, themeValue } = deps;

  return function renderGroupedBar(chart, rows, spec, tooltip, d3, segmentFieldName) {
    const enc = spec.encoding || {};
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const orientation = barOrientationFromEncoding(enc);
    const horizontal = orientation === 'horizontal';
    const rendererOrientation = barRendererKey('grouped', orientation);
    const categoryChannel = barCategoryChannel(enc);
    const measureChannel = barMeasureChannel(enc);
    const categoryField = categoryChannel.field ?? '';
    const valueField = measureChannel.field ?? '';
    const segmentField = segmentFieldName ?? '';
    const state = specState(spec);
    const stateSegments = (state.sceneState?.detail?.segments || state.detail?.segments) as unknown[] | undefined;
    const selection = viewSelection(spec);
    const categories = channelDomain(rows, categoryChannel) as string[];
    const segments = channelDomain(rows, { field: segmentField, domain: stateSegments }) as string[];
    const color = colorScale(domainRows, enc.color, d3);
    const key = barKeyAccessor(chart, spec, [categoryField, segmentField]);
    const splitLineage = kit.splitLineage(chart);
    const zeroBaselineEnter = kit.baselineEnterPlan(chart, 'zero-baseline');
    const zeroBaselineExit = kit.baselineExitPlan(chart, 'zero-baseline');

    const categoryRange: [number, number] = horizontal ? [0, chart.innerHeight] : [0, chart.innerWidth];
    const baseCategoryBand = d3.scaleBand().domain(categories).range(categoryRange).padding(0.24);
    const baseCategoryScale = asRuntimeScale(baseCategoryBand);
    const baseSegmentScale = asRuntimeScale(d3.scaleBand().domain(segments)
      .range([0, baseCategoryBand.bandwidth()]).padding(0.08));
    const baseMeasureScale = asRuntimeScale(d3.scaleLinear()
      .domain(quantitativeDomain(domainRows, measureChannel, 0))
      .range(horizontal ? [0, chart.innerWidth] : [chart.innerHeight, 0]).nice());
    const baseX = horizontal ? baseMeasureScale : baseCategoryScale;
    const baseY = horizontal ? baseCategoryScale : baseMeasureScale;
    const baseX1 = horizontal ? null : baseSegmentScale;
    const baseY1 = horizontal ? baseSegmentScale : null;
    const baseGeom: GroupedGeom = {
      x: baseX, y: baseY, x1: baseX1, y1: baseY1,
      categoryField, segmentField, valueField, chart, horizontal
    };
    const baseGeometry = groupedSegmentGeometry(baseGeom);
    const camera = focusCamera(
      rows.map((row) => ({ datum: row, bounds: geometryBounds(baseGeometry, row) })),
      selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const categoryScale = cameraScale(baseCategoryScale, camera, horizontal ? 'y' : 'x');
    const measureScale = cameraScale(baseMeasureScale, camera, horizontal ? 'x' : 'y');
    const segmentScale = asRuntimeScale(d3.scaleBand().domain(segments)
      .range([0, bandwidth(categoryScale)]).padding(0.08));
    const x = horizontal ? measureScale : categoryScale;
    const y = horizontal ? categoryScale : measureScale;
    const x1 = horizontal ? null : segmentScale;
    const y1 = horizontal ? segmentScale : null;
    const geom: GroupedGeom = { x, y, x1, y1, categoryField, segmentField, valueField, chart, horizontal };
    const steps = kit.steps(chart, rendererOrientation, d3);
    const xAxisTransition = kit.axisTransition(steps, 'x') || chart.transition.base;
    const yAxisTransition = kit.axisTransition(steps, 'y') || chart.transition.base;
    const geometry = groupedSegmentGeometryContract(geom, splitLineage, zeroBaselineEnter, kit.sourceBaselineExit, zeroBaselineExit);

    chart.scales = { x, ...(x1 ? { x1 } : {}), y, ...(y1 ? { y1 } : {}), color, orientation: rendererOrientation };
    chart.camera = camera;
    chart.channels = enc;
    chart.position = {
      x: (d: BarDatum) => horizontal ? scaled(x, d[valueField]) : segmentCenter(x, x1, d, geom),
      y: (d: BarDatum) => horizontal ? segmentCenter(y, y1, d, geom) : scaled(y, d[valueField])
    };

    drawBarAxes(chart, x, y, enc, d3, deps, horizontal, {
      xTransition: xAxisTransition,
      yTransition: yAxisTransition
    });

    kit.renderBarJoin({
      chart, rows, spec, tooltip, d3, bindTooltip, key,
      category: (d) => d[categoryField],
      className: 'vd-bar vd-bar-segment vd-bar-grouped',
      orientation: rendererOrientation, rx: cameraSize(themeValue('--vd-bar-radius', 3), camera),
      fill: (d) => color(d),
      applyIdentity: applyBarIdentity, steps, geometry
    });
  };
}

/** Center of a segment along the category axis: category band + segment offset + half segment width. */
function segmentCenter(category: RuntimeScale, segment: RuntimeScale | null, d: BarDatum, geom: GroupedGeom): number {
  return scaled(category, d[geom.categoryField]) + segmentOffset(segment, d, geom) + segmentWidth(segment) / 2;
}

function segmentOffset(segment: RuntimeScale | null, d: BarDatum, geom: GroupedGeom): number {
  return segment ? scaled(segment, d[geom.segmentField]) : 0;
}

function segmentWidth(segment: RuntimeScale | null): number {
  return segment ? bandwidth(segment) : 0;
}

function groupedSegmentGeometryContract(
  geom: GroupedGeom,
  splitLineage: LineageStart | null,
  zeroBaselineEnter: TransitionItemAction | null,
  sourceBaselineExit: BarRenderKit['sourceBaselineExit'],
  exitPlan: TransitionItemAction | null
): BarGeometryContract {
  return {
    start: (d) => splitLineage?.start(d) || groupedSegmentEnterGeometry(d, geom, zeroBaselineEnter),
    target: groupedSegmentGeometry(geom),
    applyX: (selection) => applyGroupedSegmentX(selection, geom),
    applyY: (selection) => applyGroupedSegmentY(selection, geom),
    apply: (selection) => applyGroupedSegmentGeometry(selection, geom),
    exit: splitLineage ? null : (selection) => applyGroupedSegmentExitGeometry(selection, geom, sourceBaselineExit, exitPlan)
  };
}

function groupedSegmentEnterGeometry(d: BarDatum, geom: GroupedGeom, enterPlan: TransitionItemAction | null = null): RectGeometry {
  const { x, y, x1, y1, categoryField, valueField, horizontal } = geom;
  const fromZero = !enterPlan || enterPlan.from === 'zero-baseline';
  if (horizontal) {
    return {
      x: fromZero ? scaled(x, 0) : Math.min(scaled(x, 0), scaled(x, d[valueField])),
      y: scaled(y, d[categoryField]) + segmentOffset(y1, d, geom),
      width: 0, height: Math.max(1, segmentWidth(y1))
    };
  }
  return {
    x: scaled(x, d[categoryField]) + segmentOffset(x1, d, geom),
    y: fromZero ? scaled(y, 0) : Math.min(scaled(y, 0), scaled(y, d[valueField])),
    width: Math.max(1, segmentWidth(x1)), height: 0
  };
}

function applyGroupedSegmentGeometry(selection: BarMotion, geom: GroupedGeom): BarMotion {
  applyGroupedSegmentX(selection, geom);
  applyGroupedSegmentY(selection, geom);
  return selection;
}

function groupedSegmentGeometry(geom: GroupedGeom): TargetGeometry {
  const { x, y, x1, y1, categoryField, valueField, horizontal } = geom;
  if (horizontal) {
    return {
      x: (d) => Math.min(scaled(x, 0), scaled(x, d[valueField])),
      width: (d) => Math.abs(scaled(x, d[valueField]) - scaled(x, 0)),
      y: (d) => scaled(y, d[categoryField]) + segmentOffset(y1, d, geom),
      height: Math.max(1, segmentWidth(y1))
    };
  }
  return {
    x: (d) => scaled(x, d[categoryField]) + segmentOffset(x1, d, geom),
    width: Math.max(1, segmentWidth(x1)),
    y: (d) => Math.min(scaled(y, 0), scaled(y, d[valueField])),
    height: (d) => Math.abs(scaled(y, d[valueField]) - scaled(y, 0))
  };
}

function applyGroupedSegmentX(selection: BarMotion, geom: GroupedGeom): BarMotion {
  const { x, x1, categoryField, valueField, horizontal } = geom;
  if (horizontal) {
    return selection
      .attr('x', (d) => Math.min(scaled(x, 0), scaled(x, d[valueField])))
      .attr('width', (d) => Math.abs(scaled(x, d[valueField]) - scaled(x, 0)));
  }
  return selection
    .attr('x', (d) => scaled(x, d[categoryField]) + segmentOffset(x1, d, geom))
    .attr('width', Math.max(1, segmentWidth(x1)));
}

function applyGroupedSegmentY(selection: BarMotion, geom: GroupedGeom): BarMotion {
  const { y, y1, categoryField, valueField, horizontal } = geom;
  if (horizontal) {
    return selection
      .attr('y', (d) => scaled(y, d[categoryField]) + segmentOffset(y1, d, geom))
      .attr('height', Math.max(1, segmentWidth(y1)));
  }
  return selection
    .attr('y', (d) => Math.min(scaled(y, 0), scaled(y, d[valueField])))
    .attr('height', (d) => Math.abs(scaled(y, d[valueField]) - scaled(y, 0)));
}

function applyGroupedSegmentExitGeometry(
  selection: BarMotion,
  geom: GroupedGeom,
  sourceBaselineExit: BarRenderKit['sourceBaselineExit'],
  exitPlan: TransitionItemAction | null
): BarMotion {
  return sourceBaselineExit(selection, { horizontal: geom.horizontal, plan: exitPlan, value: (d) => d[geom.valueField] });
}
