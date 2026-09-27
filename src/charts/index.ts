import { normalizeChartType as normalizeChartPlugin } from './plugin.js';
import type {
  ChartRuntime,
  ChartType,
  ChartPlugin,
  CompilerContext,
  SpecCompiler,
  ViewSpec
} from '../types/index.js';

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface ChartTypeRegistry {
  register<S extends ViewSpec>(chartType: ChartType<S>): this;
  get<S extends ViewSpec = ViewSpec>(markOrSpec: string | ViewSpec): ChartType<S> | undefined;
  has(markOrSpec: string | ViewSpec): boolean;
  types(): string[];
}

export function createChartTypeRegistry(): ChartTypeRegistry {
  const chartTypes = new Map<string, ChartType<ViewSpec>>();

  return {
    register(chartType) {
      const normalized = normalizeRegisteredChartType(chartType as unknown as ChartType<ViewSpec>);
      chartTypes.set(normalized.key, normalized);
      return this;
    },

    get(markOrSpec) {
      const key =
        typeof markOrSpec === 'object'
          ? resolveMarkRendererKey(markOrSpec)
          : normalizeMarkRendererKey(markOrSpec);
      return chartTypes.get(key) as ChartType<any> | undefined;
    },

    has(markOrSpec) {
      return Boolean(this.get(markOrSpec));
    },

    types() {
      return [...chartTypes.keys()].sort();
    }
  };
}

export interface SpecCompilerEntry {
  compiler: SpecCompiler;
  scenes: string[];
}

export function registerChartModules(
  registry: ChartTypeRegistry,
  modules: Array<{ plugin: ChartPlugin }>,
  runtime: ChartRuntime
): ChartTypeRegistry {
  for (const module of modules) {
    const chartType = chartTypeFromModule(module, runtime);
    registry.register(chartType);
  }
  return registry;
}

export function createSpecCompilerRegistry(
  modules: Array<{ plugin: ChartPlugin }>,
  context: CompilerContext = {}
): Record<string, SpecCompilerEntry> {
  const entries = modules
    .map((module) => {
      const plugin = pluginFromModule(module);
      const key = normalizeMarkRendererKey(plugin.key);
      const compiler = plugin.createSpecCompiler ? plugin.createSpecCompiler(context) : null;
      if (!key || !compiler) return null;
      return [
        key,
        {
          compiler,
          scenes: [...plugin.scenes],
        }
      ] as [string, SpecCompilerEntry];
    })
    .filter((entry): entry is [string, SpecCompilerEntry] => entry !== null);

  return Object.fromEntries(entries);
}

// ─── Mark key resolution ──────────────────────────────────────────────────────

export function normalizeMarkRendererKey(markOrRenderer: unknown): string {
  return normalizeMarkToken(String(markOrRenderer ?? ''));
}

export function normalizeChartType(type: unknown): string {
  return normalizeMarkRendererKey(type);
}

export function resolveMarkRendererKey(viewSpec: ViewSpec): string {
  return normalizeMarkRendererKey(viewSpec.mark);
}

export function resolveChartType(viewSpec: ViewSpec): string {
  return resolveMarkRendererKey(viewSpec);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function normalizeRegisteredChartType(chartType: ChartType<ViewSpec>): ChartType<ViewSpec> {
  const key = normalizeMarkRendererKey(chartType.key);
  if (!key) throw new Error('Chart type key is required.');
  const normalized = normalizeChartPlugin({ ...chartType, key });
  if (typeof normalized.renderer !== 'function') {
    throw new Error(`Chart type "${key}" must provide a renderer function.`);
  }
  return { ...normalized, key };
}

function chartTypeFromModule(
  module: { plugin: ChartPlugin },
  runtime: ChartRuntime
): ChartType<ViewSpec> {
  const plugin = pluginFromModule(module);
  if (typeof plugin.createChartType === 'function') {
    return plugin.createChartType(runtime) as ChartType<ViewSpec>;
  }
  throw new Error('Chart module must export plugin.createChartType(runtime).');
}

function pluginFromModule(module: { plugin?: ChartPlugin }): ChartPlugin {
  if (!module.plugin) throw new Error('Chart module must export plugin.');
  return module.plugin;
}

function normalizeMarkToken(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}
