import * as core from './index.js';
import type { Visualization, TransitionOptions } from './transition.js';

export { area, availableChartTypes, bar, buildGroupingTree, compileLineage, correspondLineage, D3_AREA_CURVE_NAMES, D3_CURVE_NAMES, delta, detectDataTypes, diffViewStates, defineChartType, lineageMarkKey,
  chartStylePresets, darkChartStyle, defineChartStyle, d3ChartStyle, line, paperChartStyle, point, registerChartType, registerChartModule, unit,
  resolveEncodingTypes, select, UNIT_LAYOUTS, viewLineageCorrespondence, visualizationSpec } from './index.js';

type BrowserOptions = Record<string, unknown>;
function dependencies(options: BrowserOptions): BrowserOptions {
  const globals = globalThis as unknown as Record<string, unknown>;
  return { ...options, d3: options.d3 ?? globals['d3'],
    aq: options.aq ?? globals['aq'] };
}

export function transition(from: Visualization, to: Visualization, options: Partial<TransitionOptions> = {}) {
  return core.transition(from, to, { ...options, ...dependencies(options) } as TransitionOptions);
}

export function sequence(states: readonly Visualization[], options: Partial<TransitionOptions> = {}) {
  return core.sequence(states, { ...options, ...dependencies(options) } as TransitionOptions);
}

export function mount(visualization: Visualization, options: Partial<TransitionOptions> = {}) {
  return core.mount(visualization, { ...options, ...dependencies(options) } as TransitionOptions);
}

// Only dependency lookup and global installation differ from the ESM entry.
const browserApi = { ...core, transition, sequence, mount };
(globalThis as unknown as Record<string, unknown>)['VisDelta'] = browserApi;
(globalThis as unknown as Record<string, unknown>)['vd'] = browserApi;
