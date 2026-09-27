import type { ViewSpec } from '../types/index.js';
import type { ChartTypeRegistry, SpecCompilerEntry } from '../charts/index.js';
import { serializeViewSpec } from '../spec-meta.js';
import {
  compileViewSpec,
  resolveSceneTransition
} from '../transitions/index.js';

export interface StepTransition {
  scene?: string[];
}

export interface CompileResult {
  sceneTransition: ReturnType<typeof resolveSceneTransition>;
  effectiveViewSpec: ViewSpec | null;
}

export function createViewCompiler(chartTypes: ChartTypeRegistry) {
  const entries = new Map<string, SpecCompilerEntry>();
  for (const key of chartTypes.types()) {
    const chartType = chartTypes.get(key)!;
    const compiler = chartType.createSpecCompiler?.({});
    if (compiler) entries.set(key, { compiler, scenes: [...chartType.scenes] });
  }
  return { compileEffectiveView, compileTransitionSource };

function compileEffectiveView(viewSpec: ViewSpec, stepTransition: StepTransition = {}): CompileResult {
  const entry = entries.get(chartTypes.get(viewSpec)?.key ?? '');
  const authoredViewSpec = serializeViewSpec(viewSpec);
  const sceneTransition = resolveSceneTransition(authoredViewSpec, stepTransition, entry ?? chartTypes.get(viewSpec));
  const effectiveViewSpec = compileViewSpec(
    authoredViewSpec,
    sceneTransition,
    entry
  );
  return { sceneTransition, effectiveViewSpec: serializeViewSpec(effectiveViewSpec) };
}

function compileTransitionSource(viewSpec: ViewSpec | null | undefined, stepTransition: StepTransition = {}): CompileResult {
  if (!viewSpec || !(viewSpec as Record<string, unknown>)['mark']) {
    return { effectiveViewSpec: null, sceneTransition: { scene: [], selection: null, axis: null, detail: null } };
  }
  return compileEffectiveView(viewSpec, stepTransition);
}
}
