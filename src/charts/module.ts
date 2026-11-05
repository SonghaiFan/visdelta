import type { FluentEdit } from '../fluent-edits.js';
import type { ChartPlugin, ViewSpec } from '../types/index.js';

export interface LoadedChartModule<S extends ViewSpec = ViewSpec> {
  plugin: ChartPlugin<S>;
}

/** A lightweight reference that loads one chart implementation on demand. */
export interface ChartModule<S extends ViewSpec = ViewSpec> {
  key: string;
  load(): Promise<LoadedChartModule<S>>;
  /** Advertised fluent methods, not a guarantee that every state/argument is valid. */
  editMethods?: readonly string[];
  /** Derive one endpoint; runtime validates it before acceptance. resolvedSource contains actual data. */
  edit?(spec: S, calls: readonly FluentEdit[], resolvedSource: S): Promise<S>;
}

export function defineChartModule<S extends ViewSpec = ViewSpec>(
  module: ChartModule<S>
): ChartModule<S> {
  const key = String(module?.key ?? '').replace(/\s+/g, '').toLowerCase();
  if (!key) throw new Error('Chart module key is required.');
  if (typeof module.load !== 'function') throw new Error(`Chart module "${key}" requires load().`);
  return Object.freeze({ key, load: module.load,
    ...(module.edit ? { edit: module.edit,
      ...(module.editMethods ? { editMethods: Object.freeze([...module.editMethods]) } : {}),
    } : {}),
  });
}
