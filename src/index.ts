import { builtInChartModules } from './charts/builtins.js';
import { registerChartModule as registerBuiltInChartModule } from './runtime/chart-registry.js';

builtInChartModules.forEach(registerBuiltInChartModule);

export {
  availableChartTypes,
  registerChartType,
  registerChartModule
} from "./runtime/chart-registry.js";
export {
  area,
  bar,
  D3_AREA_CURVE_NAMES,
  D3_CURVE_NAMES,
  line,
  point,
  unit,
  UNIT_LAYOUTS
} from "./grammar/index.js";
export type { D3AreaCurveName, D3CurveName, UnitLayout, UnitLayoutOptions, UnitViewState } from "./grammar/index.js";
export { defineChartType } from "./charts/plugin.js";
export { chartStylePresets, darkChartStyle, defineChartStyle, d3ChartStyle, paperChartStyle } from "./charts/style.js";
export type { ChartGridStyle, ChartLegendPosition, ChartStyleDefinition, ChartStyleModule, ChartStyleRule, ChartStyleRuleDefinition } from "./charts/style.js";
export { transition } from "./transition.js";
export { sequence } from "./sequence.js";
export { mount, select } from "./select.js";
export { buildGroupingTree, compileLineage, correspondLineage, delta, diffViewStates, lineageMarkKey, viewLineageCorrespondence, visualizationSpec } from "./core.js";
export { detectDataTypes, resolveEncodingTypes } from "./data/types.js";
export type { Visualization } from "./core.js";
export type { CorrespondenceOptions, DatumKey, DatumKeySpec, GroupingTreeNode, LineageAtom, LineageCapability, LineageCompileOptions, LineageContribution, LineageCorrespondence, LineageEdge, LineageRow, LineageTable } from "./core.js";
export type { ChannelType } from "./types/index.js";
export type { TransitionOptions, PlayOptions, VisualizationTransition } from "./transition.js";
export type { SequenceOptions, SequencePlayOptions, VisualizationSequence } from "./sequence.js";
export type { LiveChart, LiveMotion, LiveSequenceMotion, PendingSequence, PendingUpdate } from "./select.js";
