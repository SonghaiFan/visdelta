import type { TransformSpec } from '../types/index.js';
import { validateTransforms } from './validate.js';
import { applyTransformOperation, type TransformRow } from './transform-operations.js';

type Row = TransformRow;

export function applyTransforms(source: Row[], transforms: TransformSpec[] = []): Row[] {
  validateTransforms(transforms);
  if (!transforms.length) return source.map(row => ({ ...row }));
  const fields = [...new Set(source.flatMap(row => Object.keys(row)))];
  let rows = source.map(row => Object.fromEntries(fields.map(field => [field, row[field]])));
  for (const transform of transforms) rows = applyTransformOperation(rows, transform);
  return rows;
}
