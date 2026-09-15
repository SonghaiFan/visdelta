import type { ChartRuntimeDeps } from '../runtime/chart-deps.js';
import type { RenderDatum, RuntimeScale } from '../runtime/marks.js';
import type { ChartContext, ChartDeps, D3Lib, EncodingSpec, ViewSpec } from '../types/index.js';

/** Row accessors a chart publishes for scene helpers (axis cues, focus). */
export interface ChartPosition {
  x(row: RenderDatum): number;
  y(row: RenderDatum): number;
}

export abstract class BaseChart<S extends ViewSpec = ViewSpec> {
  protected readonly deps: ChartRuntimeDeps;

  /**
   * Built-in charts always receive the full runtime helper object; the public
   * `ChartDeps` is the supported subset plugins may depend on.
   */
  constructor(deps: ChartDeps) {
    this.deps = deps as ChartRuntimeDeps;
  }

  renderer(): (chart: ChartContext, rows: RenderDatum[], spec: S, tooltip: HTMLElement, d3: D3Lib) => void {
    return this.render.bind(this);
  }

  abstract render(
    chart: ChartContext,
    rows: RenderDatum[],
    spec: S,
    tooltip: HTMLElement,
    d3: D3Lib
  ): void;

  protected setCartesianState(
    chart: ChartContext,
    enc: EncodingSpec,
    scales: Record<string, unknown>,
    position: ChartPosition
  ): void {
    chart.scales = { ...scales, orientation: 'cartesian' };
    chart.channels = enc;
    chart.position = position;
  }

  protected drawCartesianAxes(
    chart: ChartContext,
    x: RuntimeScale | null,
    y: RuntimeScale | null,
    enc: EncodingSpec,
    d3: D3Lib,
    options: { duration?: number } = {}
  ): void {
    const transition = chart.transition.base;
    this.deps.drawGrid(chart, y, d3, transition, options);
    this.deps.drawXAxis(chart, x, enc.x?.title, d3, transition, options);
    this.deps.drawYAxis(chart, y, enc.y?.title, d3, transition, options);
  }
}
