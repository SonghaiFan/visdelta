import type { AxisSpec, ViewSpec } from '../../types/index.js';
import { ChartState, colorFrom, normalizeDataSource } from '../authoring.js';
import { compileViewWithCompiler } from '../compile-view.js';
import { createLineSpecCompiler } from './compile.js';
import { D3_CURVE_NAMES, isD3CurveName } from './curve.js';
import type { D3CurveName } from './curve.js';
import { chartModule as lineModule } from './module.js';

const LINE_SPEC_COMPILER = createLineSpecCompiler();

export interface LineViewState extends ViewSpec {
  mark: 'line';
  curve?: D3CurveName;
  connect?: 'adjacent' | 'across';
  strokeWidth?: number;
  pointSize?: number;
}

export function line(data?: unknown): LineState {
  return new LineState({ data: normalizeDataSource(data) as LineViewState['data'], mark: 'line', encoding: {} });
}

export class LineState extends ChartState<LineViewState> {
  chartModule() {
    return lineModule;
  }

  protected override compileSpec(spec: ViewSpec): ViewSpec {
    return compileViewWithCompiler(spec, { scene: [] }, LINE_SPEC_COMPILER);
  }

  curve(value: D3CurveName): this {
    if (!isD3CurveName(value)) {
      throw new Error(`Line curve must be a D3 curve name: ${D3_CURVE_NAMES.join(', ')}.`);
    }
    return this.with({ curve: value });
  }

  connect(value: 'adjacent' | 'across'): this {
    if (value !== 'adjacent' && value !== 'across') {
      throw new Error('Line connect must be "adjacent" or "across".');
    }
    return this.with({ connect: value });
  }

  strokeWidth(value: number): this {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Line width must be a positive finite number.');
    }
    return this.with({ strokeWidth: value });
  }

  pointSize(value: number): this {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Line point size must be a nonnegative finite number.');
    }
    return this.with({ pointSize: value });
  }

  flip(options: Record<string, unknown> = {}): this {
    return this.axis({
      flip: true,
      ...(options['x'] ? { x: options['x'] } : {}),
      ...(options['y'] ? { y: options['y'] } : {}),
      ...(options['order'] ? { order: options['order'] as Array<'x' | 'y'> } : {}),
      ...(options['duration'] != null ? { duration: options['duration'] as number } : {}),
      ...(options['stagger'] ? { stagger: options['stagger'] as AxisSpec['stagger'] } : {})
    });
  }

  breakdown(field: string, options: Record<string, unknown> = {}): this {
    return this.replaceState('detail', {
        mode: 'series',
        series: field,
        ...(options['color']
          ? Array.isArray(options['color'])
            ? { color: { range: options['color'] as unknown[] } }
            : { color: colorFrom(options['color'] as string) }
          : {})
    }, { captureResetBaseline: true }) as this;
  }

  rollup(options: Record<string, unknown> = {}): this {
    const series = (this.state.detail as Record<string, unknown> | undefined)?.['series'];
    return this.replaceState('detail', {
        mode: 'single',
        ...(series ? { series } : {}),
        op: String(options['op'] ?? 'sum'),
        ...(options['as'] ? { as: String(options['as']) } : {}),
        ...(options['color'] ? { color: colorFrom(options['color'] as string) } : {})
    }, { captureResetBaseline: true }) as this;
  }
}
