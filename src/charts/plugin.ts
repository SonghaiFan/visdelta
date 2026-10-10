import type {
  ChartRuntime,
  ChartType,
  ChartPlugin,
  ChartTransitionPolicy,
  CompilerContext,
  EncodingSpec,
  MarginSpec,
  Renderer,
  SpecCompiler,
  TransitionPlan,
  ViewSpec
} from '../types/index.js';
import { resolveChartPresentation } from './style.js';
import type { ChartPresentation, ChartPresentationDefinition } from './style.js';

export interface ChartTypeConfig<S extends ViewSpec = ViewSpec> {
  key: string;
  transitionEvaluation?: 'cached' | 'reconstruct';
  declarationPlanning?: boolean;
  scenes?: string[];
  renderer?: Renderer<S>;
  presentation?: ChartPresentationDefinition;
  /** Channels actually shown by the renderer (e.g. a layout-generated group axis). */
  layoutChannels?: (spec: S) => EncodingSpec;
  defaultMarkKey?: ChartType<S>['defaultMarkKey'];
  createRenderer?: (runtime: ChartRuntime, presentation: ChartPresentation) => Renderer<S>;
  createChart?: (runtime: ChartRuntime, presentation: ChartPresentation) => Omit<ChartType<S>, 'defaultMargin'>;
  prepareSpec?: (spec: S) => S;
  transition?: {
    plan?: ChartTransitionPolicy<S>['resolveTransitionPlan'];
    canonicalPair?: ChartTransitionPolicy<S>['canonicalTransitionPair'];
    intermediateSpecs?: ChartTransitionPolicy<S>['intermediateSpecs'];
  };
  createSpecCompiler?: (context: CompilerContext) => SpecCompiler;
}

export function defineChartType<S extends ViewSpec = ViewSpec>(
  config: ChartTypeConfig<S>
): ChartPlugin<S> {
  if (!config.key) throw new Error('Chart type plugin requires a key.');

  const { createSpecCompiler } = config;
  const scenes = uniqueStrings(config.scenes ?? []);

  function createChartType(runtime: ChartRuntime): ChartType<S> {
    const presentation = resolveChartPresentation(config.presentation, runtime.theme);
    const chartType = config.createChart
      ? config.createChart(runtime, presentation)
      : createRuntimeChartType(config, runtime, presentation);

    return normalizeChartType<S>(
      {
        ...chartType,
        defaultMargin: (spec, viewport) => viewport
          ? runtime.layoutMargins(config.layoutChannels?.(spec) ?? spec.encoding ?? {}, viewport, presentation.plot)
          : presentation.plot.margin,
        transitionEvaluation: config.transitionEvaluation ?? chartType.transitionEvaluation,
        declarationPlanning: config.declarationPlanning ?? chartType.declarationPlanning,
        defaultMarkKey: chartType.defaultMarkKey ?? config.defaultMarkKey,
        key: chartType.key || config.key,
        scenes: chartType.scenes ?? scenes,
      },
      createSpecCompiler
    );
  }

  return {
    key: config.key,
    scenes,
    createChartType,
    ...(createSpecCompiler ? { createSpecCompiler } : {})
  };
}

export function identityPrepare<S extends ViewSpec>(spec: S): S {
  return spec;
}

export function emptyTransitionPlan(): TransitionPlan {
  return {};
}

export function defaultMargin(): Partial<MarginSpec> {
  return {};
}

export function normalizeChartType<S extends ViewSpec = ViewSpec>(
  chartType: Partial<ChartType<S>> & { key: string },
  createSpecCompiler?: ((context: CompilerContext) => SpecCompiler) | null
): ChartType<S> {
  const prepareSpec = chartType.prepareSpec ?? identityPrepare;
  const resolveTransitionPlan = chartType.resolveTransitionPlan ?? emptyTransitionPlan;
  const renderer = chartType.renderer;
  if (!renderer) throw new Error(`Chart type "${chartType.key}" must provide a renderer function.`);

  const scenes = uniqueStrings([...(chartType.scenes ?? [])]);

  return {
    ...chartType,
    scenes,
    renderer,
    prepareSpec,
    resolveTransitionPlan,
    defaultMargin: chartType.defaultMargin ?? defaultMargin,
    ...(createSpecCompiler ? { createSpecCompiler } : {})
  } as ChartType<S>;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function createRuntimeChartType<S extends ViewSpec>(
  config: ChartTypeConfig<S>,
  runtime: ChartRuntime,
  presentation: ChartPresentation
): Partial<ChartType<S>> & { key: string } {
  const renderer = config.createRenderer
    ? config.createRenderer(runtime, presentation)
    : config.renderer;

  return {
    key: config.key,
    renderer,
    prepareSpec: config.prepareSpec ?? identityPrepare,
    resolveTransitionPlan: config.transition?.plan ?? emptyTransitionPlan,
    canonicalTransitionPair: config.transition?.canonicalPair,
    intermediateSpecs: config.transition?.intermediateSpecs,
    scenes: config.scenes,
    defaultMarkKey: config.defaultMarkKey,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(String))];
}
