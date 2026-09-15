import type { ViewSpec } from '../../types/index.js';
import { ChartState, normalizeDataSource } from '../authoring.js';
import { compileViewWithCompiler } from '../compile-view.js';
import { createUnitSpecCompiler } from './compile.js';
import { chartModule as unitModule } from './module.js';

const UNIT_SPEC_COMPILER = createUnitSpecCompiler();

export interface UnitViewState extends ViewSpec {
  mark: 'unit';
  unit?: Record<string, unknown>;
}

export const UNIT_LAYOUTS = ['grid', 'force', 'bar', 'beeswarm'] as const;
export type UnitLayout = typeof UNIT_LAYOUTS[number];

export interface UnitLayoutOptions {
  columns?: number;
  radius?: number;
}

export interface UnitValueOptions {
  /** The quantity represented by one unit circle. Defaults to 1. */
  unitValue?: number;
  /** Maximum number of circles rendered across the chart. */
  maxUnits?: number;
}

export function unit(data?: unknown): UnitState {
  return new UnitState({ data: normalizeDataSource(data) as UnitViewState['data'], mark: 'unit', encoding: {}, unit: {} });
}

export class UnitState extends ChartState<UnitViewState> {
  chartModule() {
    return unitModule;
  }

  protected override compileSpec(spec: ViewSpec): ViewSpec {
    return compileViewWithCompiler(spec, { scene: [] }, UNIT_SPEC_COMPILER, { axis: 'layout' });
  }

  value(field: string, options: UnitValueOptions = {}): this {
    if (!field) throw new Error('Unit value requires a field name.');
    if (options.unitValue != null && (!Number.isFinite(options.unitValue) || options.unitValue <= 0)) {
      throw new Error('Unit unitValue must be a positive finite number.');
    }
    if (options.maxUnits != null && (!Number.isInteger(options.maxUnits) || options.maxUnits <= 0)) {
      throw new Error('Unit maxUnits must be a positive integer.');
    }
    return this.with({
      unit: {
        ...(this.state['unit'] as Record<string, unknown> || {}),
        value: field,
        ...(options.unitValue != null ? { unitValue: options.unitValue } : {}),
        ...(options.maxUnits != null ? { maxUnits: options.maxUnits } : {})
      }
    });
  }

  columns(value: number): this {
    assertPositiveInteger(value, 'Unit columns');
    return withUnitAxis(this, { columns: value });
  }

  radius(value: number): this {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Unit radius must be a positive finite number.');
    }
    return withUnitAxis(this, { radius: value });
  }

  /** Declare categorical membership without silently choosing a layout or color. */
  group(field: string): this {
    if (!field) throw new Error('Unit group requires a field name.');
    return withUnitAxis(this, { group: field });
  }

  /** Choose how the same keyed units are arranged. */
  layout(name: UnitLayout, options: UnitLayoutOptions = {}): this {
    if (!UNIT_LAYOUTS.includes(name)) {
      throw new Error(`Unit layout must be one of: ${UNIT_LAYOUTS.join(', ')}.`);
    }
    if (options.columns != null) assertPositiveInteger(options.columns, 'Unit columns');
    if (options.radius != null && (!Number.isFinite(options.radius) || options.radius <= 0)) {
      throw new Error('Unit radius must be a positive finite number.');
    }
    return withUnitAxis(this, {
      layout: name,
      ...(options.columns != null ? { columns: options.columns } : {}),
      ...(options.radius != null ? { radius: options.radius } : {})
    });
  }
}

function withUnitAxis<T extends UnitState>(state: T, axis: Record<string, unknown>): T {
  return state.axis(axis);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}
