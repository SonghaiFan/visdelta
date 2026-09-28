/** Optional chart construction tools; none register or import a chart family. */
export * from './toolkit/geometry.js';
export * from './toolkit/topology.js';
export * from './toolkit/matching.js';
export * from './toolkit/transition-policy.js';
export { BaseChart } from './charts/base.js';
export { setCartesianState } from './toolkit/cartesian.js';
export type { ChartPosition } from './toolkit/cartesian.js';
export { bandOrLinear, quantitativeScale, position, niceExtent, quantitativeDomain, channelDomain } from './toolkit/scales.js';
export { easeFor, staggerDelay } from './toolkit/motion-timing.js';
export { pickCategoricalColors } from './toolkit/palette.js';
export type { RuntimeScale, RenderChannel, RenderDatum, ScaleOptions } from './runtime/render-types.js';
export * from './charts/compiler-utils.js';
export { resolvePlotStyle, resolveChartPresentation, responsiveTickCount, directionalAxisTitle } from './charts/style.js';
export type { ChartPresentation, ChartPresentationDefinition, ChartStyleRule, ChartStyleRuleDefinition } from './charts/style.js';
