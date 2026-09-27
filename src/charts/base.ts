import type { RenderDatum, RuntimeScale } from '../runtime/marks.js';
import type { ChartContext, ChartRuntime, EncodingSpec, ViewSpec } from '../types/index.js';
import type { ChartPresentation } from './style.js';

/** Row accessors a chart publishes for scene helpers (axis cues, focus). */
export interface ChartPosition {
  x(row: RenderDatum): number;
  y(row: RenderDatum): number;
}

export abstract class BaseChart<S extends ViewSpec = ViewSpec> {
  protected readonly runtime: ChartRuntime;
  protected readonly presentation: ChartPresentation;

  /** Official and external renderers receive the same public services. */
  constructor(runtime: ChartRuntime, presentation: ChartPresentation) {
    this.runtime = runtime;
    this.presentation = presentation;
  }

  renderer(): (chart: ChartContext, rows: RenderDatum[], spec: S, tooltip: HTMLElement) => void {
    return this.render.bind(this);
  }

  abstract render(
    chart: ChartContext,
    rows: RenderDatum[],
    spec: S,
    tooltip: HTMLElement
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
    options: { duration?: number } = {}
  ): void {
    const transition = chart.transition.base;
    this.runtime.drawGrid(chart, y, transition, options);
    this.runtime.drawXAxis(chart, x, enc.x?.title, transition, options);
    this.runtime.drawYAxis(chart, y, enc.y?.title, transition, options);
  }
}
