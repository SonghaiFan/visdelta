import type { Visualization } from 'visdelta/transition';

/** What every module in `examples/` exports. */
export interface ExampleModule {
  from?: Visualization;
  to?: Visualization;
  states?: readonly Visualization[];
}

/**
 * Lazy loaders, one per example, so each page downloads only the chart
 * modules it renders. Keep in sync with `examples/registry.ts`;
 * `scripts/verify-examples.mjs` fails the build when they disagree.
 */
export const exampleLoaders: Record<string, () => Promise<ExampleModule>> = {
  'area-split': () => import('@/examples/area-split'),
  'area-stream': () => import('@/examples/area-stream'),
  'bar-color': () => import('@/examples/bar-color'),
  'bar-filter': () => import('@/examples/bar-filter'),
  'bar-flip': () => import('@/examples/bar-flip'),
  'bar-focus': () => import('@/examples/bar-focus'),
  'bar-grouped-split': () => import('@/examples/bar-grouped-split'),
  'bar-highlight': () => import('@/examples/bar-highlight'),
  'bar-layout': () => import('@/examples/bar-layout'),
  'bar-remap': () => import('@/examples/bar-remap'),
  'bar-repeat': () => import('@/examples/bar-repeat'),
  'bar-sort': () => import('@/examples/bar-sort'),
  'bar-split': () => import('@/examples/bar-split'),
  'bar-story': () => import('@/examples/bar-story'),
  'line-add': () => import('@/examples/line-add'),
  'line-curve': () => import('@/examples/line-curve'),
  'line-split': () => import('@/examples/line-split'),
  'pie-donut': () => import('@/examples/pie-donut'),
  'point-log': () => import('@/examples/point-log'),
  'point-remap': () => import('@/examples/point-remap'),
  'unit-layout': () => import('@/examples/unit-layout'),
  'unit-value': () => import('@/examples/unit-value'),
};

export function exampleStates(module: ExampleModule): readonly Visualization[] {
  if (module.states) return module.states;
  if (module.from && module.to) return [module.from, module.to];
  throw new Error('An example must export `from` and `to`, or `states`.');
}
