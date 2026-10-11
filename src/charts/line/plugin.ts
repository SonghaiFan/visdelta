import { facetDefaultHeight } from '../facet-layout.js';
import { createRepeatedLineRenderer } from './repeat-render.js';
import { facetGroups } from '../facet.js';
import { canonicalFacetPair } from '../facet-motion.js';
import { validateFacetLayout } from '../facet-layout.js';
import { chartWarnings } from './warnings.js';
import { linePresentation } from './style.js';
import type { ChartPlugin } from '../../types/index.js';
import type { TransitionSpec } from '../../types/index.js';
import { specTransition } from '../../spec-meta.js';
import { defaultTransition } from '../../timing.js';
import { createLineSpecCompiler } from './compile.js';
import { createLineRenderer } from './render.js';
import { createDefaultTransitionPlan } from '../transition-plan.js';
import { defineChartType } from '../plugin.js';
import type { LineViewState } from './authoring.js';
import { canonicalLineTransitionPair, lineIntermediateSpecs, lineObservationChange, lineSeriesKey, lineState } from './state.js';
import { specState } from '../../spec-meta.js';
import { createLineDeclarationOperationCodec } from './declaration-operations.js';

export interface LineTransitionPlanExtension {
  timing?: TransitionSpec;
  observation?: {
    mode: 'add' | 'add-and-remove';
    addedKeys: string[];
    removedKeys: string[];
    reason: string;
  };
}

export const plugin: ChartPlugin<LineViewState> = defineChartType<LineViewState>({
  key: 'line',
  defaultHeight: facetDefaultHeight,
  warnings: (spec, rows) => spec.encoding?.facet?.field
    ? facetGroups(rows, spec.encoding.facet.field).flatMap(group => chartWarnings(spec, group.rows).map(hint => ({ ...hint, message: `${group.label}: ${hint.message}` })))
    : chartWarnings(spec, rows),
  layoutChannels: spec => ({ x: spec.encoding?.x, y: spec.encoding?.y, ...(spec.encoding?.facet ? {} : { color: spec.encoding?.color }) }),
  prepareSpec: spec => { validateFacetLayout(spec.facetLayout ?? {}); return spec; },
  declarationPlanning: true,
  declarationPlanningOrder: 'before-chart',
  scenes: ['selection', 'axis', 'detail', 'mapping'],
  presentation: linePresentation,
  createRenderer: (runtime, presentation) => createRepeatedLineRenderer(runtime, presentation, createLineRenderer(runtime, presentation), resolveLineTransitionPlan),
  createSpecCompiler: createLineSpecCompiler,
  // One observation per x within each series.
  defaultMarkKey: (spec) => {
    const x = spec.encoding?.x?.field;
    const series = lineSeriesKey(lineState(spec, spec.encoding));
    return x ? (series ? [x, series] : x) : null;
  },
  transition: {
    canonicalPair: (from, to) => {
      if (Boolean(from.encoding?.facet) !== Boolean(to.encoding?.facet)) return from.encoding?.facet ? { from: to, to: from, reverse: true } : { from, to, reverse: false };
      if (from.encoding?.facet?.field && from.encoding.facet.field === to.encoding?.facet?.field && JSON.stringify(from.facetLayout) !== JSON.stringify(to.facetLayout)) return canonicalFacetPair(from, to);
      return canonicalLineTransitionPair(from, to);
    },
    declarationOperations: createLineDeclarationOperationCodec(),
    intermediateSpecs: (from, to) => from.encoding?.facet || to.encoding?.facet ? [] : lineIntermediateSpecs(from, to),
    plan: resolveLineTransitionPlan
  }
});

function resolveLineTransitionPlan(previousSpec: LineViewState | null, nextSpec: LineViewState | null) {
  const plan: ReturnType<typeof createDefaultTransitionPlan> & LineTransitionPlanExtension = {
    ...createDefaultTransitionPlan(previousSpec, nextSpec, { reason: 'line-default-plan' }),
    ...(previousSpec && nextSpec ? {
      timing: defaultTransition({
        ...specTransition(previousSpec),
        ...specTransition(nextSpec)
      })
    } : {})
  };
  const observation = previousSpec && nextSpec
    ? lineObservationChange(previousSpec, nextSpec)
    : null;
  if (observation?.mode === 'add-and-remove') plan.membershipTiming = 'simultaneous';
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
