import type { ViewSpec } from '../types/index.js';
import { specDatumKey, specObjectKey } from '../spec-meta.js';
import { compileLineage, correspondLineage } from './lineage.js';

/**
 * Compile the provenance relation between two complete visualization states.
 * Keeping this outside `delta()` lets the runtime consume the exact same
 * relation instead of reconstructing mark correspondence in a renderer.
 */
export function viewLineageCorrespondence(source: ViewSpec, target: ViewSpec) {
  const sourceRows = inlineRows(source.data);
  const targetRows = inlineRows(target.data);
  if (!sourceRows || !targetRows) return null;
  const from = compileLineage(sourceRows, source.transform ?? [], {
    key: specDatumKey(source) ?? undefined,
    grain: markGrain(source)
  });
  const to = compileLineage(targetRows, target.transform ?? [], {
    key: specDatumKey(target) ?? undefined,
    grain: markGrain(target)
  });
  return correspondLineage(from, to, {
    fromField: measureField(source),
    toField: measureField(target)
  });
}

function inlineRows(data: ViewSpec['data']): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const values = data && typeof data === 'object' ? (data as { values?: unknown }).values : null;
  return Array.isArray(values) ? values as Record<string, unknown>[] : null;
}

function markGrain(spec: ViewSpec): string[] {
  const key = specObjectKey(spec);
  return typeof key === 'string' ? [key] : Array.isArray(key) ? [...key] : [];
}

function measureField(spec: ViewSpec): string | undefined {
  const channels = Object.values(spec.encoding ?? {})
    .flatMap((channel) => Array.isArray(channel) ? channel : [channel]);
  return channels.find((channel) => channel?.type === 'quantitative')?.field;
}
