import type { ViewSpec } from '../types/index.js';
import { getSpecMeta, serializeViewSpec } from '../spec-meta.js';
import { compileViewWithCompiler } from '../charts/compile-view.js';
import type { SpecCompilerEntry } from '../charts/index.js';

interface SceneTransition {
  scene: string[];
  [slot: string]: unknown;
}

export function resolveSceneTransition(
  viewSpec: ViewSpec = {},
  stepTransition: { scene?: string[] } = {},
  compilerEntry?: { scenes: readonly string[] }
): SceneTransition {
  const supported = compilerEntry?.scenes ?? [];
  const scene = [...new Set(stepTransition.scene ?? [])].filter(token => supported.includes(token));
  const state = getSpecMeta(viewSpec).state ?? {};
  return { ...Object.fromEntries(scene.map(slot => [slot, state[slot] ?? null])), scene };
}

export function compileViewSpec(viewSpec: ViewSpec, sceneTransition: SceneTransition, compilerEntry?: SpecCompilerEntry): ViewSpec {
  if (!compilerEntry?.compiler) return viewSpec;
  return serializeViewSpec(compileViewWithCompiler(viewSpec, sceneTransition, compilerEntry.compiler));
}

export function hasScene(sceneTransition: SceneTransition | null | undefined, type: string): boolean {
  return Boolean(sceneTransition?.scene.includes(type));
}
