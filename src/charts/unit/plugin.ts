import { colorWarnings } from '../warnings.js';
import { unitPresentation, unitLayoutChannels } from './style.js';
import type { ChartPlugin } from '../../types/index.js';
import { createUnitSpecCompiler } from './compile.js';
import { createUnitRenderer } from './render.js';
import { defineChartType } from '../plugin.js';
import { canonicalUnitTransitionPair, resolveUnitTransitionPlan } from './state.js';
import type { UnitViewState } from './authoring.js';
import { createUnitDeclarationOperationCodec } from './declaration-operations.js';

export const plugin: ChartPlugin<UnitViewState> = defineChartType<UnitViewState>({
  key: 'unit',
  warnings: colorWarnings,
  declarationPlanning: true,
  declarationPlanningOrder: 'before-chart',
  transitionEvaluation: 'cached',
  scenes: ['selection', 'axis', 'mapping'],
  presentation: unitPresentation,
  layoutChannels: unitLayoutChannels,
  createRenderer: createUnitRenderer,
  createSpecCompiler: createUnitSpecCompiler,
  transition: {
    canonicalPair: canonicalUnitTransitionPair,
    plan: resolveUnitTransitionPlan,
    declarationOperations: createUnitDeclarationOperationCodec()
  }
});
