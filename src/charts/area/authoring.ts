import type { ViewSpec } from '../../types/index.js';
import { ChartState, colorFrom, normalizeDataSource } from '../authoring.js';
import { compileViewWithCompiler } from '../compile-view.js';
import { createAreaSpecCompiler } from './compile.js';
import { chartModule as areaModule } from './module.js';
import { D3_AREA_CURVE_NAMES, isD3AreaCurveName } from '../curve.js';
import type { D3AreaCurveName } from '../curve.js';

const AREA_SPEC_COMPILER = createAreaSpecCompiler();

export interface AreaViewState extends ViewSpec {
  mark: 'area';
  baseline?: number;
  connect?: 'adjacent' | 'across';
  curve?: D3AreaCurveName;
}

export type AreaLayout = 'stacked' | 'stream';
export type AreaStackOffset = 'none' | 'expand' | 'diverging' | 'silhouette' | 'wiggle';
export type AreaStackOrder = 'none' | 'reverse' | 'appearance' | 'ascending' | 'descending' | 'insideOut';

export interface AreaStreamOptions {
  /** D3 stack offset; wiggle is the default streamgraph baseline. */
  offset?: AreaStackOffset;
  /** D3 stack order; insideOut is the default streamgraph layer order. */
  order?: AreaStackOrder;
}

/** Describe a band across an ordered x field. */
export function area(data?: unknown): AreaState {
  return new AreaState({
    data: normalizeDataSource(data) as AreaViewState['data'],
    mark: 'area',
    encoding: {}
  });
}

export class AreaState extends ChartState<AreaViewState> {
  chartModule() {
    return areaModule;
  }

  protected override compileSpec(spec: ViewSpec): ViewSpec {
    return compileViewWithCompiler(spec, { scene: [] }, AREA_SPEC_COMPILER);
  }

  /** Set the value from which an ordinary area grows. Defaults to zero. */
  baseline(value: number): this {
    if (!Number.isFinite(value)) throw new Error('Area baseline must be a finite number.');
    return this.with({ baseline: value });
  }

  /** Shape both Area boundaries with an exact D3 curve export name. */
  curve(value: D3AreaCurveName): this {
    if (!isD3AreaCurveName(value)) {
      throw new Error(
        `Area curve must be a D3 curve that supports areas: ${D3_AREA_CURVE_NAMES.join(', ')}.`
      );
    }
    return this.with({ curve: value });
  }

  /** Preserve filtered gaps, or explicitly connect the surviving observations. */
  connect(value: 'adjacent' | 'across'): this {
    if (value !== 'adjacent' && value !== 'across') {
      throw new Error('Area connect must be "adjacent" or "across".');
    }
    return this.with({ connect: value });
  }

  /** Split each x total into stacked parts. Color remains an explicit choice. */
  breakdown(field: string, options: Record<string, unknown> = {}): this {
    if (!field) throw new Error('Area breakdown needs a field name.');
    return this.replaceState('detail', {
        mode: 'stacked',
        series: field,
        ...(options['color']
          ? Array.isArray(options['color'])
            ? { color: { range: options['color'] as unknown[] } }
            : { color: colorFrom(options['color'] as string) }
          : {})
    }, 'detail') as this;
  }

  /** Arrange stacked layers from a fixed baseline or as a configurable streamgraph. */
  layout(value: AreaLayout, options: AreaStreamOptions = {}): this {
    if (value !== 'stacked' && value !== 'stream') {
      throw new Error('Area layout must be "stacked" or "stream".');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('Area stream options must be an object.');
    }
    const detail = (this.state.detail as Record<string, unknown> | undefined) || {};
    if (detail['mode'] !== 'stacked' || !detail['series']) {
      throw new Error('Area layout requires .breakdown("field") first.');
    }
    if (value === 'stacked' && Object.keys(options).length) {
      throw new Error('Area stack offset and order options require .layout("stream", options).');
    }
    const offset = options.offset ?? 'wiggle';
    const order = options.order ?? 'insideOut';
    if (!AREA_STACK_OFFSETS.has(offset)) {
      throw new Error(`Area stream offset must be one of: ${[...AREA_STACK_OFFSETS].join(', ')}.`);
    }
    if (!AREA_STACK_ORDERS.has(order)) {
      throw new Error(`Area stream order must be one of: ${[...AREA_STACK_ORDERS].join(', ')}.`);
    }
    const { offset: _offset, order: _order, ...rest } = detail;
    return this.replaceState('detail', {
      ...rest,
      // DetailSpec predates chart-owned layouts and names only BarLayout.
      // Keep the shared Core contract unchanged; the Area compiler resolves
      // this chart-local value before it reaches rendering.
      layout: value as 'stacked',
      ...(value === 'stream' ? { offset, order } : {})
    }, 'detail') as this;
  }

  /** Combine stacked parts into one total at every x value. */
  rollup(options: Record<string, unknown> = {}): this {
    const series = (this.state.detail as Record<string, unknown> | undefined)?.['series'];
    return this.replaceState('detail', {
        mode: 'single',
        ...(series ? { series } : {}),
        op: String(options['op'] ?? 'sum'),
        ...(options['as'] ? { as: String(options['as']) } : {}),
        ...(options['color'] ? { color: colorFrom(options['color'] as string) } : {})
    }, 'detail') as this;
  }
}

const AREA_STACK_OFFSETS = new Set<AreaStackOffset>([
  'none', 'expand', 'diverging', 'silhouette', 'wiggle'
]);
const AREA_STACK_ORDERS = new Set<AreaStackOrder>([
  'none', 'reverse', 'appearance', 'ascending', 'descending', 'insideOut'
]);
