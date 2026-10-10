import type { TransformSpec } from '../types/index.js';
import { dataName } from '../spec-meta.js';
import { autoType } from 'd3-dsv';
import { csv, json } from 'd3-fetch';
type AnyRecord = Record<string, unknown>;

export async function loadData(dataSpec: Record<string, unknown>): Promise<Record<string, unknown[]>> {
  const entries = await Promise.all(
    Object.entries(dataSpec).map(async ([name, source]) => {
      if (Array.isArray(source)) return [name, source];
      const src = source as AnyRecord;
      if (Array.isArray(src['values'])) return [name, src['values']];
      if (!src['url']) return [name, []];

      if ((src['type'] || 'csv') === 'csv') {
        const rows = await csv(src['url'] as string, autoType);
        return [name, rows];
      }

      if (src['type'] === 'json') {
        const rows = await json(src['url'] as string);
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
  // Domain inference uses the full, unsorted data lineage. A trailing
  // filter/limit/sort is display-only and must not reassign categorical
  // palette slots or reorder the legend. Upstream subsets are different:
  // aggregate and bin derive new values from their input population, so their
  // filters and limits are part of the value definition and must survive.
  const populationTransformAfter = (index: number) => transforms
    .slice(index + 1)
    .some((transform) => {
      const value = transform as AnyRecord;
      return 'aggregate' in value || 'bin' in value;
    });
  const consequentialLimitAfter = (index: number) => transforms
    .slice(index + 1)
    .some((transform, offset) => {
      const value = transform as AnyRecord;
      return 'limit' in value && populationTransformAfter(index + offset + 1);
    });

  return transforms.filter((transform, index) => {
    const t = transform as AnyRecord;
    if ('filter' in t || 'limit' in t) return populationTransformAfter(index);
    if ('sort' in t) return consequentialLimitAfter(index);
    return true;
  });
}
