import { createBarRenderer } from './render.js';
import { cloneSpec, uniqueTokens } from '../../runtime/utils.js';
import type {
  ChartRuntime,
  ChartType,
  IntermediateSpec,
  TransitionPlan,
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
    renderer,
    prepareSpec: prepareBarSpec,
    defaultMarkKey: (spec) => {
      const state = semanticBarState(spec);
      return [state.categoryField, state.segmentField].filter((field): field is string => Boolean(field));
    },
    resolveTransitionPlan: resolveBarTransitionPlan as (prev: BarSpec | null, next: BarSpec | null) => TransitionPlan,
    canonicalTransitionPair: canonicalBarTransitionPair,
    intermediateSpecs: barIntermediateSpecs as (prev: BarSpec, next: BarSpec) => IntermediateSpec<BarSpec>[],
    scenes: ['selection', 'axis', 'detail', 'mapping'],
    inspect: { transitionPlanKey: 'barTransitionPlan' }
  };
}

function prepareBarSpec(spec: BarSpec): BarSpec {
  if (spec.mark !== 'bar') return spec;

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
  for (const [channelName, channel] of Object.entries(encoding)) {
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
