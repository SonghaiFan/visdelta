import { distributionOptions, distributionRows, validateDistributionOptions } from './layout/distribution.js';
import { chartError } from '../../edit-errors.js';
import { validateFacetLayout } from '../facet-layout.js';
import { canonicalFacetPair } from '../facet-motion.js';
import { createRepeatedBarRenderer } from './repeat-render.js';
import { createBarRenderer } from './render.js';
import { cloneSpec, uniqueTokens } from '../../runtime/utils.js';
import type {
  ChartRuntime,
  ChartType,
  IntermediateSpec,
  ViewSpec
} from '../../types/index.js';
import type { ChartPresentation } from '../style.js';
import {
  canonicalBarTransitionPair,
  barIntermediateSpecs,
  resolveBarTransitionPlan
} from './state.js';
import { semanticBarState } from './semantic.js';

export interface BarSpec extends ViewSpec {
  mark: 'bar';
}

export function createBarChart(runtime: ChartRuntime, presentation: ChartPresentation): Omit<ChartType<BarSpec>, 'defaultMargin'> {
  const renderer = createBarRenderer(runtime, presentation);

  return {
    key: 'bar',
    renderer: createRepeatedBarRenderer(runtime, presentation, renderer, prepareBarSpec),
    prepareSpec: prepareBarSpec,
    defaultMarkKey: (spec) => {
      const state = semanticBarState(spec);
      return [state.categoryField, state.segmentField].filter((field): field is string => Boolean(field));
    },
    resolveTransitionPlan: (prev, next) => Boolean(prev?.encoding?.facet) !== Boolean(next?.encoding?.facet) ? {} : resolveBarTransitionPlan(prev, next),
    canonicalTransitionPair: (from, to) => {
      if (!from.encoding?.facet && !to.encoding?.facet) return canonicalBarTransitionPair(from, to);
      if (from.encoding?.facet?.field === to.encoding?.facet?.field && from.encoding?.facet && JSON.stringify(from.facetLayout) !== JSON.stringify(to.facetLayout)) return canonicalFacetPair(from,to);
      // Repeated flips replay one canonical geometry route in either direction.
      // Prefer the endpoint carrying authored vertical axis controls; otherwise
      // the horizontal endpoint carries the flip order.
      if (from.encoding?.facet && to.encoding?.facet &&
          JSON.stringify(from.facetLayout) === JSON.stringify(to.facetLayout) &&
          semanticBarState(from).orientation !== semanticBarState(to).orientation) {
        const vertical = semanticBarState(from).orientation === 'vertical' ? from : to;
        const target = semanticBarState(vertical).axis ? vertical : (vertical === from ? to : from);
        return target === to ? { from, to, reverse: false } : { from: to, to: from, reverse: true };
      }
      return { from, to, reverse: false };
    },
    intermediateSpecs: (from, to) => from.encoding?.facet || to.encoding?.facet ? [] : barIntermediateSpecs(from, to) as IntermediateSpec<BarSpec>[],
    scenes: ['selection', 'axis', 'detail', 'mapping']
  };
}

function prepareBarSpec(spec: BarSpec): BarSpec {
  if (spec.mark !== 'bar') return spec;
  if (spec.encoding?.facet) validateFacetLayout((spec.facetLayout ?? {}) as import('../../facet.js').FacetLayout);

  const distribution = distributionOptions(spec);
  if (distribution || semanticBarState(spec).layout === 'diverging') {
    const facts = semanticBarState(spec);
    validateDistributionOptions(facts.layout, distribution);
    const measure = spec.encoding?.[facts.orientation === 'horizontal' ? 'x' : 'y'];
    if (!facts.segmentField || spec.encoding?.facet || measure?.domain || measure?.scale
      || (spec.transform ?? []).some(t => Object.keys(t).some(key => !['aggregate','filter','sort'].includes(key)))
      || (spec.transform ?? []).some(t => (t.aggregate as import('../../types/index.js').AggregateTransform | undefined)?.fields?.some(f => f.op !== 'sum' || f.field !== facts.measureField || f.as !== facts.measureField))) {
      throw chartError('UNSUPPORTED_EDIT_STATE', 'Distribution layout requires tidy counts, a sum at the same value field, automatic linear domains and no facets.',
        'Use one complete row per question/response, including zeros; remove fold, custom domains, nonlinear scales and facet before applying this layout.', {chartType:'bar',method:'layout'});
    }
    const raw = Array.isArray(spec.data) ? spec.data : (spec.data as {values?: unknown[]})?.values;
    if (raw) distributionRows(raw as import('./render-pattern.js').BarDatum[], facts.categoryField!, facts.segmentField!, facts.measureField!, facts.layout, distribution!);
  }
  const next = cloneSpec(spec) as BarSpec;
  const enc = (next.encoding ?? {}) as Record<string, { type?: string; field?: string; aggregate?: string | boolean; timeUnit?: string }>;
  inferChannelTypes(enc);
  const timeUnitTransforms = timeUnitTransformsFromEncoding(enc);
  const aggregate = aggregateTransformFromEncoding(enc);

  if (timeUnitTransforms.length || aggregate) {
    next.transform = [
      ...(next.transform ?? []),
      ...timeUnitTransforms,
      ...(aggregate ? [{ aggregate }] : [])
    ];
  }

  return next;
}

function timeUnitTransformsFromEncoding(
  encoding: Record<string, { field?: string; timeUnit?: string; type?: string }>
): Array<{ timeUnit: { field: string; unit: string; as: string } }> {
  return Object.values(encoding).flatMap((channel) => {
    if (!channel?.timeUnit || !channel.field) return [];
    const as = `${channel.field}_${channel.timeUnit}`;
    const transform = {
      timeUnit: { field: channel.field, unit: channel.timeUnit, as }
    };
    channel.field = as;
    delete channel.timeUnit;
    return [transform];
  });
}

function inferChannelTypes(
  encoding: Record<string, { field?: string; type?: string; aggregate?: string | boolean }>
): void {
  for (const channel of Object.values(encoding)) {
    if (!channel || typeof channel !== 'object' || !channel.field || channel.type) continue;
    if (channel.aggregate) {
      channel.type = 'quantitative';
    } else {
      channel.type = 'nominal';
    }
  }
}

function aggregateTransformFromEncoding(
  encoding: Record<string, { field?: string; type?: string; aggregate?: string | boolean }>
): { groupby: string[]; fields: Array<{ op: string; field?: string; as: string }> } | null {
  const measureEntry = (['x', 'y'] as const).find((ch) => encoding[ch]?.aggregate);
  if (!measureEntry) return null;

  const measure = encoding[measureEntry];
  if (!measure) return null;

  const as = measure.field ?? `${measure.aggregate}_value`;
  const groupby = uniqueTokens(
    (['x', 'y', 'color', 'xOffset', 'yOffset'] as const)
      .filter((ch) => ch !== measureEntry)
      .map((ch) => encoding[ch]?.field)
  );
  const op = measure.aggregate === true ? 'count' : (measure.aggregate as string);
  const fieldSpec: { op: string; field?: string; as: string } = { op, as };
  if (measure.field) fieldSpec.field = measure.field;

  delete measure.aggregate;
  measure.field = as;
  measure.type = 'quantitative';

  return { groupby, fields: [fieldSpec] };
}
