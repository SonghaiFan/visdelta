import type {
  ChartRuntime,
  ChartType,
  ChartPlugin,
  ChartTransitionPolicy,
  CompilerContext,
  MarginSpec,
  Renderer,
  SpecCompiler,
  TransitionPlan,
  ViewSpec
} from '../types/index.js';
import { resolveChartPresentation } from './style.js';
import type { ChartPresentation, ChartStyleRuleDefinition } from './style.js';

export interface ChartTypeConfig<S extends ViewSpec = ViewSpec> {
  key: string;
  transitionEvaluation?: 'cached' | 'reconstruct';
  scenes?: string[];
  renderer?: Renderer<S>;
  presentation?: ChartStyleRuleDefinition;
  createRenderer?: (runtime: ChartRuntime, presentation: ChartPresentation) => Renderer<S>;
  createChart?: (runtime: ChartRuntime, presentation: ChartPresentation) => ChartType<S>;
  prepareSpec?: (spec: S) => S;
  defaults?: { margin?: (spec: S, runtime: ChartRuntime) => Partial<MarginSpec> };
  inspect?: Record<string, unknown>;
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
    const chartType = config.createChart
      ? config.createChart(runtime, resolveChartPresentation(config.presentation, runtime.theme))
      : createRuntimeChartType(config, runtime);

    return normalizeChartType<S>(
      {
        ...chartType,
        transitionEvaluation: config.transitionEvaluation ?? chartType.transitionEvaluation,
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
  runtime: ChartRuntime
): Partial<ChartType<S>> & { key: string } {
  const presentation = resolveChartPresentation(config.presentation, runtime.theme);
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
    defaultMargin: config.defaults?.margin
      ? (spec: S) => config.defaults!.margin!(spec, runtime)
      : config.presentation ? () => presentation.plot.margin : defaultMargin,
    inspect: config.inspect ?? {},
    scenes: config.scenes,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(String))];
}
