import { createChartTypeRegistry, normalizeMarkRendererKey, registerChartModules } from '../charts/index.js';
import type { ChartModule } from '../charts/module.js';
import type { ChartRuntime, ChartType, ChartPlugin, ViewSpec } from '../types/index.js';
import { DEFAULT_CHART_RUNTIME } from './chart-runtime.js';

// Explicit registrations are shared process-wide. Each transition takes a
// registry snapshot so a later registration cannot change its compiled frames.
export const chartRegistry = createChartTypeRegistry();
const factories = new Map<string, { chartType: ChartType<any>; plugin: ChartPlugin<any> }>();
const modules = new Map<string, ChartModule<any>>();

export function registerChartType(chartType: ChartType<any>): void {
  chartRegistry.register(chartType);
  factories.delete(chartRegistry.get(chartType.key)!.key);
}

export function registerChartModule(module: { plugin: ChartPlugin<any> } | ChartModule<any>): void {
  if ('plugin' in module) {
    registerChartModules(chartRegistry, [module], DEFAULT_CHART_RUNTIME);
    const chartType = chartRegistry.get(module.plugin.key)!;
    factories.set(chartType.key, { chartType, plugin: module.plugin });
    return;
  }
  const key = normalizeMarkRendererKey(module.key);
  if (!key) throw new Error('Chart module key is required.');
  modules.set(key, module);
}

function instantiate(key: string, runtime: ChartRuntime) {
  const chartType = chartRegistry.get(key);
  const factory = chartType && factories.get(chartType.key);
  return factory && factory.chartType === chartType ? factory.plugin.createChartType(runtime) : chartType;
}

export function snapshotChartRegistry(runtime: ChartRuntime) {
  const registry = createChartTypeRegistry();
  for (const key of chartRegistry.types()) registry.register(instantiate(key, runtime)!);
  return registry;
}

export function availableChartTypes(): string[] {
  return [...new Set([...modules.keys(), ...chartRegistry.types()])].sort();
}

export async function transitionRegistry(
  spec: ViewSpec,
  runtime: ChartRuntime = DEFAULT_CHART_RUNTIME,
  localModules: ChartModule<any>[] = []
) {
  const key = normalizeMarkRendererKey(spec.mark);
  let chartType: ChartType<any> | undefined = instantiate(key, runtime);
  if (!chartType) {
    const module = localModules.find(candidate => normalizeMarkRendererKey(candidate.key) === key)
      ?? modules.get(key);
    if (!module) throw new Error(`Unsupported chart type: ${key}`);
    const loaded = await module.load();
    const pluginKey = normalizeMarkRendererKey(loaded.plugin.key);
    if (pluginKey !== key) {
      throw new Error(`Chart module "${key}" loaded plugin "${pluginKey}".`);
    }
    // Honor an explicit registration made while the module was loading.
    chartType = instantiate(key, runtime) ?? loaded.plugin.createChartType(runtime);
  }
  const registry = createChartTypeRegistry();
  if (!chartType) throw new Error(`Unsupported chart type: ${key}`);
  registry.register(chartType);
  return registry;
}
