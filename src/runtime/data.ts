import type { TransformSpec } from '../types/index.js';
import type { D3Runtime } from '../types/d3-runtime.js';
import { dataName } from '../spec-meta.js';
type AnyRecord = Record<string, unknown>;

export async function loadData(dataSpec: Record<string, unknown>, d3: Pick<D3Runtime, 'csv' | 'json' | 'autoType'>): Promise<Record<string, unknown[]>> {
  if (!d3) {
    throw new Error('VisDelta data loading requires its D3 runtime.');
  }
  const entries = await Promise.all(
    Object.entries(dataSpec).map(async ([name, source]) => {
      if (Array.isArray(source)) return [name, source];
      const src = source as AnyRecord;
      if (Array.isArray(src['values'])) return [name, src['values']];
      if (!src['url']) return [name, []];

      if ((src['type'] || 'csv') === 'csv') {
        const rows = await d3.csv(src['url'] as string, d3.autoType);
        return [name, rows];
      }

      if (src['type'] === 'json') {
        const rows = await d3.json(src['url'] as string);
        return [name, Array.isArray(rows) ? rows : (rows as AnyRecord)['values'] || []];
      }

      throw new Error(`Unsupported data type for "${name}": ${src['type']}`);
    })
  );
  return Object.fromEntries(entries) as Record<string, unknown[]>;
}

export function viewRows(
  dataSpec: unknown,
  datasets: Record<string, unknown[]>
): unknown[] {
  if (Array.isArray(dataSpec)) return dataSpec;
  if (Array.isArray((dataSpec as AnyRecord)?.['values'])) return (dataSpec as AnyRecord)['values'] as unknown[];
  const name = dataName(dataSpec);
  return name ? (datasets[name] || []) : [];
}

export function domainTransforms(transforms: TransformSpec[] = []): TransformSpec[] {
  // Domain inference uses the full, unsorted data lineage. Display-only
  // filtering/limiting/sorting must not reassign categorical palette slots or
  // reorder the legend. Marks still use the complete transform pipeline.
  // Keep fold/bin/timeUnit/aggregate: these define the values being encoded.
  return transforms.filter((transform) => {
    const t = transform as AnyRecord;
    return !('filter' in t) && !('limit' in t) && !('sort' in t);
  });
}
