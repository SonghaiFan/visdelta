import { unitPresentation } from './style.js';
import type { ChartPlugin } from '../../types/index.js';
import { createUnitSpecCompiler } from './compile.js';
import { createUnitRenderer } from './render.js';
import { defineChartType } from '../plugin.js';
import { canonicalUnitTransitionPair, resolveUnitTransitionPlan } from './state.js';
import type { UnitViewState } from './authoring.js';

export const plugin: ChartPlugin<UnitViewState> = defineChartType<UnitViewState>({
  key: 'unit',
  transitionEvaluation: 'cached',
  scenes: ['selection', 'axis', 'mapping'],
  presentation: unitPresentation,
  createRenderer: createUnitRenderer,
  createSpecCompiler: createUnitSpecCompiler,
  transition: {
    canonicalPair: canonicalUnitTransitionPair,
    plan: resolveUnitTransitionPlan
  }
});
