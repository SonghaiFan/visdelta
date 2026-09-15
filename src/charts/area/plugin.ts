import type { ChannelSpec, ChartPlugin } from '../../types/index.js';
import { createDefaultTransitionPlan } from '../transition-plan.js';
import { defineChartType } from '../plugin.js';
import type { AreaViewState } from './authoring.js';
import { createAreaSpecCompiler } from './compile.js';
import { createAreaRenderer } from './render.js';
import { areaObservationChange, areaState, canonicalAreaTransitionPair } from './state.js';
import { chartStyle } from '../style.js';

/** Area-specific plan fields read by the renderer. */
export interface AreaTransitionPlanExtension {
  observation?: { mode: string; addedKeys: string[]; removedKeys: string[]; reason: string };
  detailChange?: { mode: 'split'; reason: string };
}

export const plugin: ChartPlugin<AreaViewState> = defineChartType<AreaViewState>({
  key: 'area',
  transitionEvaluation: 'cached',
  scenes: ['selection', 'axis', 'detail', 'mapping'],
  defaults: {
    margin: (_spec, deps) => chartStyle(deps).charts.area.margin
  },
  createRenderer: createAreaRenderer,
  createSpecCompiler: createAreaSpecCompiler,
  transition: {
    canonicalPair: canonicalAreaTransitionPair,
    plan: (previousSpec, nextSpec) => {
      const plan = createDefaultTransitionPlan(previousSpec, nextSpec, {
        reason: 'area-default-plan'
      }) as ReturnType<typeof createDefaultTransitionPlan> & AreaTransitionPlanExtension;
      const previous = previousSpec
        ? areaState(previousSpec, previousSpec.encoding)
        : null;
      const next = nextSpec
        ? areaState(nextSpec, nextSpec.encoding)
        : null;
      if (previous?.mode === 'single' && next?.mode === 'stacked') {
        plan.detailChange = {
          mode: 'split',
          reason: 'draw-area-dividers-before-revealing-layers'
        };
        plan.reason = 'split-area-detail';
      }
      const observation = previousSpec && nextSpec
        ? areaObservationChange(previousSpec, nextSpec)
        : null;
      if (observation && observation.mode !== 'remove') {
        plan.observation = {
          ...observation,
          reason: observation.mode === 'add'
            ? 'grow-area-observations'
            : 'add-and-remove-area-observations'
        };
        plan.reason = observation.mode === 'add'
          ? 'add-area-observations'
          : 'add-and-remove-area-observations';
      }
      return plan;
    }
  }
});
