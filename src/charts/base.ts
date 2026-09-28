import type { RenderDatum } from '../runtime/render-types.js';
import type { ChartContext, ChartRuntime, ViewSpec } from '../types/index.js';
import type { ChartPresentation } from './style.js';

/** Optional class adapter; chart state and coordinate systems remain external. */
export abstract class BaseChart<S extends ViewSpec = ViewSpec> {
  constructor(
    protected readonly runtime: ChartRuntime,
    protected readonly presentation: ChartPresentation
  ) {}

  renderer(): (chart: ChartContext, rows: RenderDatum[], spec: S, tooltip: HTMLElement) => void {
    return this.render.bind(this);
  }

  abstract render(chart: ChartContext, rows: RenderDatum[], spec: S, tooltip: HTMLElement): void;
}
