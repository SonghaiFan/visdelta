import { chartWarnings } from './warnings.js';
import { pointPresentation } from './style.js';
import type { ChartPlugin } from '../../types/index.js';
import { createPointSpecCompiler } from './compile.js';
import { createPointRenderer } from './render.js';
import { createDefaultTransitionPlan } from '../transition-plan.js';
import { defineChartType } from '../plugin.js';
import type { PointViewState } from './authoring.js';
import { canonicalPointTransitionPair, pointIntermediateSpecs } from './state.js';
import { createPointDeclarationOperationCodec } from './declaration-operations.js';

export const plugin: ChartPlugin<PointViewState> = defineChartType<PointViewState>({
  key: 'point',
  warnings: chartWarnings,
  declarationPlanning: true,
  declarationPlanningOrder: 'before-chart',
  transitionEvaluation: 'cached',
  scenes: ['selection', 'axis', 'detail', 'mapping'],
  // Two readable header rows: legend first, then the upward y-axis title.
  presentation: pointPresentation,
  createRenderer: createPointRenderer,
  createSpecCompiler: createPointSpecCompiler,
  defaultMarkKey: (spec) => spec.encoding?.x?.field || spec.encoding?.y?.field || null,
  transition: {
    canonicalPair: canonicalPointTransitionPair,
    declarationOperations: createPointDeclarationOperationCodec(),
    intermediateSpecs: pointIntermediateSpecs,
    plan: (previousSpec, nextSpec) =>
      createDefaultTransitionPlan(previousSpec, nextSpec, { reason: 'point-default-plan' })
  }
});
