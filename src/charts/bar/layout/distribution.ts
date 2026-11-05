import { specState } from '../../../spec-meta.js';
import { chartError } from '../../../edit-errors.js';
import type { BarLayout, BarLayoutOptions, ViewSpec } from '../../../types/index.js';
import type { BarDatum } from '../render-pattern.js';

export type DistributionOptions = Pick<BarLayoutOptions, 'normalize' | 'segments' | 'negative' | 'neutral' | 'positive'>;
export function distributionOptions(spec: ViewSpec): DistributionOptions | null {
  const state = specState(spec);
  return (state.sceneState?.detail?.offset ?? state.detail?.offset ?? state.axis?.stack ?? null) as DistributionOptions | null;
}
function invalid(message: string): never {
  throw chartError('INVALID_EDIT_ARGUMENTS', `Bar distribution: ${message}`,
    'Declare every response category once, supply finite nonnegative counts for every category in each question, and use a positive total.',
    { chartType: 'bar', method: 'layout' });
}
export function validateDistributionOptions(layout: BarLayout, options: DistributionOptions | null): string[] | null {
  if (!options && layout !== 'diverging') return null;
  if (!options) invalid('diverging requires negative, neutral and positive declarations.');
  if (options.normalize !== undefined && !['none', 'percent'].includes(options.normalize)) invalid('normalize must be none or percent.');
  let segments: string[];
  if (layout === 'diverging') {
    if (!Array.isArray(options.negative) || !options.negative.length || !Array.isArray(options.positive) || !options.positive.length
      || !(options.neutral === null || typeof options.neutral === 'string')) invalid('declare nonempty negative and positive arrays and neutral as one category or null.');
    if (options.segments !== undefined) invalid('diverging order comes from negative, neutral, positive; omit segments.');
    segments = [...options.negative, ...(options.neutral === null ? [] : [options.neutral!]), ...options.positive];
  } else {
    if (layout !== 'stacked') invalid('distribution options require stacked or diverging.');
    if (options.negative !== undefined || options.neutral !== undefined || options.positive !== undefined) invalid('stacked uses segments instead of side declarations.');
    if (!Array.isArray(options.segments) || !options.segments.length) invalid('normalized stacked layout requires explicit segments in display order.');
    segments = options.segments;
  }
  if (segments.some(value => typeof value !== 'string' || !value.trim()) || new Set(segments).size !== segments.length) invalid('categories must be nonempty, unique and disjoint.');
  return segments;
}

/** Geometry-only layout: preserves each source row and its count, including neutral. */
export function distributionRows(rows: BarDatum[], categoryField: string, segmentField: string, valueField: string,
  layout: BarLayout, options: DistributionOptions): Array<BarDatum & { __stack0: number; __stack1: number }> {
  const segments = validateDistributionOptions(layout, options)!;
  if (!rows.length) invalid('no response rows.');
  const groups = new Map<unknown, Map<string, BarDatum>>();
  for (const row of rows) {
    if (row[categoryField] == null) invalid(`missing question field ${categoryField}.`);
    const segment = row[segmentField];
    if (typeof segment !== 'string' || !segments.includes(segment)) invalid(`unknown response category ${String(segment)}.`);
    const value = row[valueField];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid(`${valueField} must be a finite nonnegative number; signed stacks use ordinary stacked layout.`);
    let group = groups.get(row[categoryField]);
    if (!group) groups.set(row[categoryField], group = new Map());
    if (group.has(segment)) invalid(`duplicate ${segment} in ${String(row[categoryField])}; aggregate the tidy counts explicitly.`);
    group.set(segment, row);
  }
  return [...groups.entries()].flatMap(([category, group]) => {
    if (group.size !== segments.length) invalid(`missing response categories for ${String(category)}; supply explicit zero rows.`);
    const total = segments.reduce((sum, segment) => sum + Number(group.get(segment)![valueField]), 0);
    if (!Number.isFinite(total) || total <= 0) invalid(`total for ${String(category)} must be greater than zero.`);
    const factor = options.normalize === 'percent' ? 1 / total : 1;
    const neutral = layout === 'diverging' && options.neutral !== null ? Number(group.get(options.neutral!)![valueField]) * factor : 0;
    const negative = layout === 'diverging' ? options.negative!.reduce((sum, segment) => sum + Number(group.get(segment)![valueField]) * factor, 0) : 0;
    let position = -negative - neutral / 2;
    return segments.map(segment => {
      const row = group.get(segment)!;
      const start = position;
      position += Number(row[valueField]) * factor;
      return { ...row, __stack0: start, __stack1: position, __distributionShare: Number(row[valueField]) / total, __distributionTotal: total };
    });
  });
}
