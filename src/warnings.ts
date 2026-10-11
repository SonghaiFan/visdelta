import { createViewCompiler } from './runtime/view-compile.js';
import { visualizationChartModule, visualizationSpec } from './core.js';
import type { Visualization } from './core.js';
import { transitionRegistry } from './runtime/chart-registry.js';
import { applyTransforms } from './data/transforms.js';
import { resolveSpecDataTypes } from './data/types.js';
import { viewRows } from './runtime/data.js';
import type { VisualizationWarning } from './types/index.js';

/** Inspect final transformed data without rendering or changing the declaration. */
export async function visualizationWarnings(input: Visualization,
  datasets: Record<string, unknown[]> = {}): Promise<VisualizationWarning[]> {
  const spec = visualizationSpec(input);
  const module = visualizationChartModule(input);
  const registry = await transitionRegistry(spec, undefined, module ? [module] : []);
  const chart = registry.get(spec)!;
  const compiled = createViewCompiler(registry).compileEffectiveView(spec).effectiveViewSpec!;
  const prepared = chart.prepareSpec(resolveSpecDataTypes(compiled, viewRows(compiled.data, datasets)));
  const rows = applyTransforms(viewRows(prepared.data, datasets) as Record<string, unknown>[], prepared.transform ?? []);
  return chart.warnings?.(prepared, rows) ?? [];
}
