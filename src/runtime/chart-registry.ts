import { createChartTypeRegistry, normalizeMarkRendererKey } from '../charts/index.js';
import { normalizeChartType } from '../charts/plugin.js';
import type { ChartModule } from '../charts/module.js';
import type { ChartRuntime, ChartType, ChartPlugin, ViewSpec } from '../types/index.js';
import { DEFAULT_CHART_RUNTIME } from './chart-runtime.js';

type Registration =
  | { kind: 'type'; chartType: ChartType<any> }
  | { kind: 'plugin'; plugin: ChartPlugin<any> }
  | { kind: 'module'; module: ChartModule<any> };

// One descriptor per normalized key. Explicit registration replaces whichever
// form was registered before it; plugin factories stay host-scoped and lazy.
const registrations = new Map<string, Registration>();

function registrationKey(key: unknown): string {
  const normalized = normalizeMarkRendererKey(key);
  if (!normalized) throw new Error('Chart registration key is required.');
  return normalized;
}

export function registerChartType(chartType: ChartType<any>): void {
  const key = registrationKey(chartType.key);
  const normalized = normalizeChartType({ ...chartType, key });
  if (typeof normalized.renderer !== 'function') {
    throw new Error(`Chart type "${key}" must provide a renderer function.`);
  }
  registrations.set(key, { kind: 'type', chartType: normalized });
}

export function registerChartModule(module: { plugin: ChartPlugin<any> } | ChartModule<any>): void {
  if ('plugin' in module) {
    const key = registrationKey(module.plugin.key);
    if (typeof module.plugin.createChartType !== 'function') {
      throw new Error('Chart module must export plugin.createChartType(runtime).');
    }
    registrations.set(key, { kind: 'plugin', plugin: module.plugin });
    return;
  }
  const key = registrationKey(module.key);
  registrations.set(key, { kind: 'module', module });
}

function instantiate(registration: Registration | undefined, runtime: ChartRuntime): ChartType<any> | undefined {
  if (!registration) return undefined;
  switch (registration.kind) {
    case 'type': return registration.chartType;
    case 'plugin': return createPluginChartType(registration.plugin, registration.plugin.key, runtime);
    case 'module': return undefined;
  }
}

function createPluginChartType(plugin: ChartPlugin<any>, expectedKey: string, runtime: ChartRuntime): ChartType<any> {
  const normalizedExpectedKey = registrationKey(expectedKey);
  const chartType = plugin.createChartType(runtime);
  const actualKey = registrationKey(chartType.key);
  if (actualKey !== normalizedExpectedKey) {
    throw new Error(`Chart plugin "${normalizedExpectedKey}" created chart type "${actualKey}".`);
  }
  return chartType;
}

export function availableChartTypes(): string[] {
  return [...registrations.keys()].sort();
}

export async function transitionRegistry(
  spec: ViewSpec,
  runtime: ChartRuntime = DEFAULT_CHART_RUNTIME,
  localModules: ChartModule<any>[] = []
) {
  const key = normalizeMarkRendererKey(spec.mark);
  const localModule = localModules.find(candidate => normalizeMarkRendererKey(candidate.key) === key);

  let chartType: ChartType<any> | undefined;
  while (!chartType) {
    const registration = registrations.get(key);
    if (registration && registration.kind !== 'module') {
      chartType = instantiate(registration, runtime);
      break;
    }

    // Per-transition modules historically take precedence over registered lazy
    // modules. Explicit chart types and plugins above still override both.
    const module = localModule ?? (registration?.kind === 'module' ? registration.module : undefined);
    if (!module) throw new Error(`Unsupported chart type: ${key}`);
    let loaded: Awaited<ReturnType<typeof module.load>>;
    try {
      loaded = await module.load();
    } catch (error) {
      // A stale load failure must not hide a replacement registered while it
      // was pending. Retry with the current descriptor before surfacing it.
      if (registrations.get(key) !== registration) continue;
      throw error;
    }

    // Check staleness before validating the loaded module: the result may be
    // invalid for this key but irrelevant because a newer registration won.
    if (registrations.get(key) !== registration) continue;
    const pluginKey = registrationKey(loaded.plugin.key);
    if (pluginKey !== key) {
      throw new Error(`Chart module "${key}" loaded plugin "${pluginKey}".`);
    }
    chartType = createPluginChartType(loaded.plugin, key, runtime);
  }

  if (!chartType) throw new Error(`Unsupported chart type: ${key}`);
  const registry = createChartTypeRegistry();
  registry.register(chartType);
  return registry;
}
