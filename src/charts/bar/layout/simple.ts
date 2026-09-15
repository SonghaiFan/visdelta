import { applyBarIdentity, barKeyAccessor } from '../keys.js';
import { cameraScale, cameraSize, focusCamera, viewSelection } from '../../../focus.js';
import {
  asRuntimeScale, bandwidth, barCategoryChannel, barMeasureChannel, barOrientationFromEncoding,
  geometryBounds, resolveGeometry as resolve, scaled
} from './index.js';
import { drawBarAxes } from '../axes.js';
import type { ChartRuntimeDeps } from '../../../runtime/chart-deps.js';
import type { RuntimeScale } from '../../../runtime/marks.js';
import type { ChartContext, ViewSpec } from '../../../types/index.js';
import type {
  BarDatum,
  BarGeometryContract,
  BarMotion,
  BarRenderKit,
  LineageStart,
  RectGeometry,
  TargetGeometry
} from '../render-pattern.js';
import type { TransitionItemAction } from '../../../types/index.js';
import { scaleBand, scaleLinear } from 'd3-scale';

export type BarLayoutRenderer = (
  chart: ChartContext,
  rows: BarDatum[],
  spec: ViewSpec,
  tooltip: HTMLElement,
  segmentField?: string | null
) => void;

interface SimpleGeom {
  x: RuntimeScale;
  y: RuntimeScale;
  categoryField: string;
  valueField: string;
  chart: ChartContext;
  horizontal: boolean;
  position: ChartRuntimeDeps['position'];
}

export function createSimpleBarRenderer(deps: ChartRuntimeDeps, kit: BarRenderKit): BarLayoutRenderer {
  const { bandOrLinear, bindTooltip, channelDomain, colorScale, position, quantitativeDomain, themeValue } = deps;

  return function renderSimpleBar(chart, rows, spec, tooltip) {
    const enc = spec.encoding || {};
    const domainRows = chart.domainRows?.length ? chart.domainRows : rows;
    const orientation = barOrientationFromEncoding(enc);
    const horizontal = orientation === 'horizontal';
    const categoryChannel = barCategoryChannel(enc);
    const measureChannel = barMeasureChannel(enc);
    const categoryField = categoryChannel.field ?? '';
    const valueField = measureChannel.field ?? '';
    const key = barKeyAccessor(chart, spec, categoryField || valueField);
    const selection = viewSelection(spec);
    const categoryRange: [number, number] = horizontal ? [0, chart.innerHeight] : [0, chart.innerWidth];

    const baseCategoryScale = horizontal
      ? asRuntimeScale(scaleBand().domain(channelDomain(rows, categoryChannel) as string[]).range(categoryRange).padding(0.22))
      : bandOrLinear(rows, categoryChannel, categoryRange);
    const baseMeasureScale = asRuntimeScale(scaleLinear()
      .domain(quantitativeDomain(domainRows, measureChannel, 0))
      .range(horizontal ? [0, chart.innerWidth] : [chart.innerHeight, 0]).nice());
    const baseX = horizontal ? baseMeasureScale : baseCategoryScale;
    const baseY = horizontal ? baseCategoryScale : baseMeasureScale;
    const baseGeom: SimpleGeom = { x: baseX, y: baseY, categoryField, valueField, chart, horizontal, position };
    const baseGeometry = simpleBarGeometry(baseGeom);
    const camera = focusCamera(
      rows.map((row) => ({ datum: row, bounds: geometryBounds(baseGeometry, row) })),
      selection,
      { width: chart.innerWidth, height: chart.innerHeight }
    );
    const x = cameraScale(baseX, camera, 'x');
    const y = cameraScale(baseY, camera, 'y');
    const color = colorScale(domainRows, enc.color);
    const geom: SimpleGeom = { x, y, categoryField, valueField, chart, horizontal, position };
    const steps = kit.steps(chart, orientation);
    const xAxisTransition = kit.axisTransition(steps, 'x') || chart.transition.base;
    const yAxisTransition = kit.axisTransition(steps, 'y') || chart.transition.base;
    const collapseLineage = kit.collapseLineage(chart, categoryField);
    const zeroBaselineExit = kit.baselineExitPlan(chart, 'zero-baseline');
    const geometry = simpleBarGeometryContract(geom, collapseLineage, kit.sourceBaselineExit, zeroBaselineExit);

    chart.scales = { x, y, color, orientation };
    chart.camera = camera;
    chart.channels = enc;
    chart.position = {
      x: (d: BarDatum) => horizontal ? scaled(x, d[valueField]) : position(x, d[categoryField]),
      y: (d: BarDatum) => horizontal ? position(y, d[categoryField]) : scaled(y, d[valueField])
    };

    drawBarAxes(chart, x, y, enc, deps, horizontal, {
      xTransition: xAxisTransition,
      yTransition: yAxisTransition
    });

    kit.renderBarJoin({
      chart, rows, spec, tooltip, bindTooltip, key,
      category: (d) => d[categoryField],
      className: 'vd-bar', orientation, rx: cameraSize(themeValue('--vd-bar-radius', 3), camera),
      fill: (d) => color(d),
      applyIdentity: applyBarIdentity, steps, geometry
    });
  };
}



function simpleBarGeometryContract(
  geom: SimpleGeom,
  collapseLineage: LineageStart | null,
  sourceBaselineExit: BarRenderKit['sourceBaselineExit'],
  exitPlan: TransitionItemAction | null
): BarGeometryContract {
  return {
    start: (d) => collapseLineage?.start(d) || simpleBarEnterGeometry(d, geom),
    target: simpleBarGeometry(geom),
    applyX: (selection) => applySimpleBarX(selection, geom),
    applyY: (selection) => applySimpleBarY(selection, geom),
    apply: (selection) => applySimpleBarGeometry(selection, geom),
    exit: collapseLineage ? null : (selection) => applySimpleBarExitGeometry(selection, geom, sourceBaselineExit, exitPlan)
  };
}

function simpleBarEnterGeometry(d: BarDatum, geom: SimpleGeom): RectGeometry {
  const target = simpleBarGeometry(geom);
  if (geom.horizontal) {
    return { x: scaled(geom.x, 0), y: resolve(target.y, d), width: 0, height: resolve(target.height, d) };
  }
  return { x: resolve(target.x, d), y: scaled(geom.y, 0), width: resolve(target.width, d), height: 0 };
}

function applySimpleBarGeometry(selection: BarMotion, geom: SimpleGeom): BarMotion {
  applySimpleBarX(selection, geom);
  applySimpleBarY(selection, geom);
  return selection;
}

function simpleBarGeometry(geom: SimpleGeom): TargetGeometry {
  const { x, y, categoryField, valueField, horizontal, position } = geom;
  if (horizontal) {
    return {
      x: (d) => Math.min(scaled(x, 0), scaled(x, d[valueField])),
      y: (d) => scaled(y, d[categoryField]),
      width: (d) => Math.abs(scaled(x, d[valueField]) - scaled(x, 0)),
      height: Math.max(1, bandwidth(y))
    };
  }
  const width = simpleCategoryWidth(x);
  return {
    x: (d) => position(x, d[categoryField]) - width / 2,
    y: (d) => Math.min(scaled(y, 0), scaled(y, d[valueField])),
    width: Math.max(1, width),
    height: (d) => Math.abs(scaled(y, d[valueField]) - scaled(y, 0))
  };
}

function applySimpleBarX(selection: BarMotion, geom: SimpleGeom): BarMotion {
  const { x, categoryField, valueField, horizontal, position } = geom;
  if (horizontal) {
    return selection
      .attr('x', (d) => Math.min(scaled(x, 0), scaled(x, d[valueField])))
      .attr('width', (d) => Math.abs(scaled(x, d[valueField]) - scaled(x, 0)));
  }
  const width = simpleCategoryWidth(x);
  return selection
    .attr('x', (d) => position(x, d[categoryField]) - width / 2)
    .attr('width', Math.max(1, width));
}

function applySimpleBarY(selection: BarMotion, geom: SimpleGeom): BarMotion {
  const { y, categoryField, valueField, horizontal } = geom;
  if (horizontal) {
    return selection
      .attr('y', (d) => scaled(y, d[categoryField]))
      .attr('height', Math.max(1, bandwidth(y)));
  }
  return selection
    .attr('y', (d) => Math.min(scaled(y, 0), scaled(y, d[valueField])))
    .attr('height', (d) => Math.abs(scaled(y, d[valueField]) - scaled(y, 0)));
}

function applySimpleBarExitGeometry(
  selection: BarMotion,
  geom: SimpleGeom,
  sourceBaselineExit: BarRenderKit['sourceBaselineExit'],
  exitPlan: TransitionItemAction | null
): BarMotion {
  return sourceBaselineExit(selection, { horizontal: geom.horizontal, plan: exitPlan, value: (d) => d[geom.valueField] });
}


function simpleCategoryWidth(scale: RuntimeScale): number {
  return typeof scale.bandwidth === 'function' ? scale.bandwidth() : 10;
}


