import * as core from './index.js';
import type { Visualization, TransitionOptions } from './transition.js';

export { applyDeclarationEdits, declarationEdits, planDeclarationTransition,
  correspondMarks, markKeyValue, resolveMarkIdentity } from './index.js';
export type { DeclarationEdit, DeclarationValue, DeclarationPlan, DeclarationPlanOptions, DeclarationStage, CanonicalDeclarationOperation, DeclarationCodecResult, DeclarationOperationChange, DeclarationOperationCodec } from './index.js';

export { area, availableChartTypes, bar, buildGroupingTree, compileLineage, correspondLineage, createBarGrainDeclarationOperationCodec, D3_AREA_CURVE_NAMES, D3_CURVE_NAMES, delta, detectDataTypes, diffViewStates, defineChartType, lineageMarkKey,
  chartStylePresets, darkChartStyle, defineChartStyle, d3ChartStyle, editorialChartStyle, line, paperChartStyle, point, registerChartType, registerChartModule, unit,
  resolveEncodingTypes, UNIT_LAYOUTS, viewLineageCorrespondence, visualizationSpec, visualizationWarnings } from './index.js';

export function transition(from: Visualization, to: Visualization, options: TransitionOptions) {
  return core.transition(from, to, options);
}

export function sequence(states: readonly Visualization[], options: TransitionOptions) {
  return core.sequence(states, options);
}

// Only global installation differs from the ESM entry.
const browserApi = { ...core, transition, sequence };
(globalThis as unknown as Record<string, unknown>)['VisDelta'] = browserApi;

export type { VisualizationWarning, ChartWarningInspector } from './index.js';
