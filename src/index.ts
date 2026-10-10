// Convenience exports only. Builders carry their modules; importing this
// entry never installs a default set of chart types into the runtime.

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
export { createBarGrainDeclarationOperationCodec } from './charts/bar/declaration-operations.js';
export type { AreaLayout, AreaStackOffset, AreaStackOrder, AreaStreamOptions, AreaViewState, D3AreaCurveName, D3CurveName, UnitLayout, UnitLayoutOptions, UnitValueOptions, UnitViewState } from "./grammar/index.js";
export { defineChartType } from "./charts/plugin.js";
export { chartStylePresets, darkChartStyle, defineChartStyle, d3ChartStyle, paperChartStyle } from "./charts/style.js";
export type { ChartGridStyle, ChartLegendPosition, ChartStyleDefinition, ChartStyleModule, ChartStyleRule, ChartStyleRuleDefinition } from "./charts/style.js";
export { transition } from "./transition.js";
export { sequence } from "./sequence.js";
export { buildGroupingTree, compileLineage, correspondLineage, correspondMarks, delta, diffViewStates, lineageMarkKey, markKeyValue, resolveMarkIdentity, viewLineageCorrespondence, visualizationSpec } from "./core.js";
export { detectDataTypes, resolveEncodingTypes } from "./data/types.js";
export type { Visualization } from "./core.js";
export { declarationEdits, applyDeclarationEdits } from './core.js';
export type { DeclarationEdit, DeclarationValue } from './core.js';
export { planDeclarationTransition } from './core.js';
export type { DeclarationPlan, DeclarationPlanOptions, DeclarationStage, CanonicalDeclarationOperation, DeclarationCodecResult, DeclarationOperationChange, DeclarationOperationCodec } from './core.js';
export type { MarkCorrespondence, MarkEndpoint, MarkIdentity, MarkKeySpec, MarkMatch } from "./core.js";
export type { CorrespondenceOptions, DatumKey, DatumKeySpec, GroupingTreeNode, LineageAtom, LineageCapability, LineageCompileOptions, LineageComponent, LineageContribution, LineageCorrespondence, LineageEdge, LineageOperation, LineageRow, LineageTable } from "./core.js";
export type { ChannelType, ConnectorSpec, DeltaResult, GrainDescription, GrainMeasure, StateChange, StateChangeCategory } from "./types/index.js";
export type { TransitionOptions, PlayOptions, VisualizationTransition } from "./transition.js";
export type { SequenceOptions, SequencePlayOptions, VisualizationSequence } from "./sequence.js";
