import { createChartTypeRegistry, normalizeMarkRendererKey } from '../charts/index.js';
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
  registrations.set(key, { kind: 'type', chartType: { ...chartType, key } });
}

export function registerChartModule(module: { plugin: ChartPlugin<any> } | ChartModule<any>): void {
  if ('plugin' in module) {
    const key = registrationKey(module.plugin.key);
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
    case 'plugin': return registration.plugin.createChartType(runtime);
    case 'module': return undefined;
  }
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
    chartType = loaded.plugin.createChartType(runtime);
  }

  if (!chartType) throw new Error(`Unsupported chart type: ${key}`);
  const registry = createChartTypeRegistry();
  registry.register(chartType);
  return registry;
}
