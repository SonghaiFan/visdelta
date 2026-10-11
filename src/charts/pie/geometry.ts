import { pie as d3Pie } from 'd3-shape';
import type { PieViewState } from './authoring.js';
import { markKeyValue, resolveMarkIdentity } from '../../identity/mark-correspondence.js';
import type { RenderDatum } from '../../runtime/render-types.js';

export function pieSlices(rows: RenderDatum[], spec: PieViewState) {
  const field = spec.encoding?.angle?.field;
  if (!field) throw new Error('Pie needs a quantitative value field: .value("field").');
  const identity = resolveMarkIdentity(spec, spec.encoding?.color?.field ?? spec.encoding?.label?.field ?? null);
  const keys = rows.map((row, index) => identity ? markKeyValue(row, identity, index) : String(index));
  if (new Set(keys).size !== rows.length) throw new Error('Pie needs one row per slice key; aggregate repeated categories explicitly.');
  const values = rows.map(row => row[field]);
  if (values.some(value => value == null || !Number.isFinite(Number(value)) || Number(value) < 0)) {
    throw new Error('Pie values must be finite, nonnegative numbers.');
  }
  const total = values.reduce<number>((sum, value) => sum + Number(value), 0);
  if (rows.length && (!(total > 0) || !Number.isFinite(total))) throw new Error('Pie requires a finite positive total.');
  return d3Pie<RenderDatum>().sort(null).value(row => Number(row[field]))(rows)
    .map((slice, index) => ({ ...slice, key: keys[index], share: slice.value / total, __row: slice.data }));
}
