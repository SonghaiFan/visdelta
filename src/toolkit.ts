/** Optional chart construction tools; none register or import a chart family. */
export * from './toolkit/geometry.js';
export * from './toolkit/topology.js';
export * from './toolkit/matching.js';
export * from './toolkit/transition-policy.js';
export { BaseChart } from './charts/base.js';
export type { ChartPosition } from './charts/base.js';
export * from './charts/compiler-utils.js';
export { resolvePlotStyle, resolveChartPresentation, responsiveTickCount, directionalAxisTitle } from './charts/style.js';
export type { ChartPresentation, ChartStyleRule, ChartStyleRuleDefinition } from './charts/style.js';
