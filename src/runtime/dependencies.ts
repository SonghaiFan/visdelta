import * as aq from 'arquero';
import * as d3 from 'd3';
import type { D3Lib, RuntimeOptions } from '../types/index.js';

/**
 * The single runtime shared by all VisDelta charts.
 *
 * These are deliberately library-owned module singletons, not browser globals:
 * authors should never need to thread D3 or Arquero through a chart state.
 * Optional overrides remain useful for embedding hosts and tests.
 */
export const runtimeD3: D3Lib = d3;
export const runtimeAq = aq as unknown as Record<string, unknown>;

export function resolveRuntime<T extends Partial<RuntimeOptions>>(options: T = {} as T) {
  return {
    ...options,
    d3: options.d3 ?? runtimeD3,
    aq: options.aq ?? runtimeAq
  };
}
