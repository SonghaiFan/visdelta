import type { SpecCompiler, ViewSpec } from '../types/index.js';
import { getSpecMeta, serializeViewSpec } from '../spec-meta.js';
import { cloneViewSpec } from './compiler-utils.js';

export interface SceneTransitionInput {
  scene?: string[];
  [slot: string]: unknown;
}

/** Execute only the ordered state slots explicitly declared by a compiler. */
export function compileViewWithCompiler(
  viewSpec: ViewSpec,
  sceneTransition: SceneTransitionInput,
  compiler: SpecCompiler
): ViewSpec {
  const context = { rendererKey: String(viewSpec.mark ?? '') };
  const state = getSpecMeta(cloneViewSpec(viewSpec)).state ?? {};
  const consumed: string[] = [];
  const order = compiler.stateOrder;
  if (!Array.isArray(order) || new Set(order).size !== order.length) {
    throw new Error('A compiler must declare a unique stateOrder.');
  }
  // Validate before executing any handlers.
  for (const slot of order) {
    if (typeof compiler.operations[slot] !== 'function') {
      throw new Error(`Compiler state slot "${slot}" requires an operation.`);
    }
  }
  let compiled = compiler.base(cloneViewSpec(viewSpec), context);
  for (const slot of order) {
    const value = state[slot] ?? sceneTransition[slot];
    if (value == null) continue;
    compiled = compiler.operations[slot](compiled, value, context);
    consumed.push(slot);
  }
  const next = cloneViewSpec(compiled);
  for (const slot of consumed) {
    if (next.meta?.state) delete next.meta.state[slot];
  }
  if (next.meta?.state && !Object.keys(next.meta.state).length) delete next.meta.state;
  if (Array.isArray(next.transform) && !next.transform.length) delete next.transform;
  if (next.encoding && !Object.keys(next.encoding).length) delete next.encoding;
  return serializeViewSpec(next);
}
