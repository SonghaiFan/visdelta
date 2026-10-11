import { ChartState, normalizeDataSource } from '../authoring.js';
import type { ChannelSpec, ViewSpec } from '../../types/index.js';
import { chartModule } from './module.js';

export interface PieViewState extends ViewSpec {
  mark: 'pie';
  innerRadius?: number;
  labels?: 'inside' | 'outside' | 'none';
}

/** One nonnegative, finite quantitative value per keyed slice. */
export function pie(data?: unknown): PieState {
  return new PieState({ mark: 'pie', data: normalizeDataSource(data) as ViewSpec['data'], encoding: {} });
}
export class PieState extends ChartState<PieViewState> {
  chartModule() { return chartModule; }
  value(field: string | ChannelSpec, options: Partial<ChannelSpec> = {}): this {
    return this.channel('angle', field, { type: 'quantitative', ...options });
  }
  label(field: string | ChannelSpec): this {
    return this.channel('label', field, { type: 'nominal' });
  }
  /** Hole radius as a fraction of the available outer radius. */
  innerRadius(fraction: number): this {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) throw new Error('Pie innerRadius must be a fraction from 0 (inclusive) to 1 (exclusive).');
    return this.with({ innerRadius: fraction });
  }
  labels(position: 'inside' | 'outside' | 'none'): this {
    if (!['inside', 'outside', 'none'].includes(position)) throw new Error('Pie labels must be inside, outside or none.');
    return this.with({ labels: position });
  }
}
