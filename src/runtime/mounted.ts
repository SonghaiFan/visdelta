import type { Visualization } from '../core.js';
import type { TransitionOptions } from '../transition.js';

export interface MountedController {
  destroy(): void;
}

export interface MountedVisualization {
  visualization: Visualization;
  options: TransitionOptions;
  controller: MountedController;
}

const mounted = new WeakMap<Element, MountedVisualization>();

export function registerMounted(
  target: Element,
  visualization: Visualization,
  options: TransitionOptions,
  controller: MountedController
) {
  mounted.set(target, { visualization, options, controller });
}

export function mountedAt(target: Element): MountedVisualization | undefined {
  return mounted.get(target);
}

export function unregisterMounted(target: Element, controller: MountedController) {
  if (mounted.get(target)?.controller === controller) mounted.delete(target);
}
