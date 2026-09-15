/** Plugin registration without importing built-in chart renderers. */
export { defineChartType } from './charts/plugin.js';
export { chartStylePresets, darkChartStyle, defineChartStyle, d3ChartStyle, paperChartStyle } from './charts/style.js';
export { defineChartModule } from './charts/module.js';
export {
  ChartState,
  channelFrom,
  colorFrom,
  normalizeDataSource,
  selectorFrom
} from './charts/authoring.js';
export { compileViewWithCompiler } from './charts/compile-view.js';
export { motion } from './runtime/recorder.js';
export { directionalEase } from './runtime/tracks.js';
export type { Motion, MotionTiming } from './runtime/recorder.js';
export { detectDataTypes, resolveEncodingTypes } from './data/types.js';
export { registerChartType, registerChartModule, availableChartTypes } from './runtime/chart-registry.js';
export type { ChartTypeConfig } from './charts/plugin.js';
export type { ChartGridStyle, ChartLegendPosition, ChartStyleDefinition, ChartStyleModule, ChartStyleRule, ChartStyleRuleDefinition } from './charts/style.js';
export type { ChartModule, LoadedChartModule } from './charts/module.js';
export type { ChartPlugin, ChartType, ChartTransitionPolicy, IntermediateSpec, CanonicalTransitionPair, TransitionPlan, ChartDeps, ViewSpec, Renderer, SpecCompiler } from './types/index.js';
