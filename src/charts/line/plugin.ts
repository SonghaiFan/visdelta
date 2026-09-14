import type { ChartPlugin } from '../../types/index.js';
import { createLineSpecCompiler } from './compile.js';
import { createLineRenderer } from './render.js';
import { createDefaultTransitionPlan } from '../transition-plan.js';
import { defineChartType } from '../plugin.js';
import type { LineViewState } from './authoring.js';
import { canonicalLineTransitionPair, lineIntermediateSpecs, lineObservationChange } from './state.js';
import { specState } from '../../spec-meta.js';
import { chartStyle } from '../style.js';

interface LineTransitionPlanExtension {
  observation?: {
    mode: 'add' | 'add-and-remove';
    addedKeys: string[];
    removedKeys: string[];
    reason: string;
  };
}

export const plugin: ChartPlugin<LineViewState> = defineChartType<LineViewState>({
  key: 'line',
  scenes: ['selection', 'axis', 'detail', 'mapping'],
  defaults: {
    margin: (_spec, deps) => chartStyle(deps).charts.line.margin
  },
  createRenderer: createLineRenderer,
  createSpecCompiler: createLineSpecCompiler,
  transition: {
    canonicalPair: canonicalLineTransitionPair,
    intermediateSpecs: lineIntermediateSpecs,
    plan: (previousSpec, nextSpec) => {
      const plan = createDefaultTransitionPlan(previousSpec, nextSpec, {
        reason: 'line-default-plan'
      }) as ReturnType<typeof createDefaultTransitionPlan> & LineTransitionPlanExtension;
      const observation = previousSpec && nextSpec
        ? lineObservationChange(previousSpec, nextSpec)
        : null;
      if (observation && observation.mode !== 'remove') {
        plan.observation = {
          mode: observation.mode,
          addedKeys: observation.addedKeys,
          removedKeys: observation.removedKeys,
          reason: observation.mode === 'add'
            ? 'line-reaches-observation-before-point-appears'
            : 'line-adds-and-removes-observations'
        };
        plan.reason = observation.mode === 'add'
          ? 'add-line-observations'
          : 'add-and-remove-line-observations';
      }
      const detail = nextSpec
        ? specState(nextSpec).sceneState?.detail as Record<string, unknown> | undefined
        : undefined;
      if (detail?.['stage'] === 'zipper-attractor') {
        plan.reason = 'prepare-line-zipper';
      } else if (detail?.['stage'] === 'zipper-preview') {
        plan.reason = 'zip-line-series-with-reference';
      } else if (previousSpec && nextSpec) {
        const previousDetail = specState(previousSpec).sceneState?.detail as Record<string, unknown> | undefined;
        if (previousDetail?.['stage'] === 'zipper-preview') plan.reason = 'remove-line-reference';
      }
      return plan;
    }
  }
});
