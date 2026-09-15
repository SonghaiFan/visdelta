import type { CurveFactory } from 'd3-shape';
/** Exact curve factory names exported by D3 7. */
export const D3_CURVE_NAMES = [
  'curveBasis',
  'curveBasisClosed',
  'curveBasisOpen',
  'curveBumpX',
  'curveBumpY',
  'curveBundle',
  'curveCardinal',
  'curveCardinalClosed',
  'curveCardinalOpen',
  'curveCatmullRom',
  'curveCatmullRomClosed',
  'curveCatmullRomOpen',
  'curveLinear',
  'curveLinearClosed',
  'curveMonotoneX',
  'curveMonotoneY',
  'curveNatural',
  'curveStep',
  'curveStepAfter',
  'curveStepBefore'
] as const;

export type D3CurveName = typeof D3_CURVE_NAMES[number];
export type D3AreaCurveName = Exclude<D3CurveName, 'curveBundle'>;

const D3_CURVE_NAME_SET = new Set<string>(D3_CURVE_NAMES);

/** D3's curveBundle omits areaStart/areaEnd and only works with d3.line(). */
export const D3_AREA_CURVE_NAMES = D3_CURVE_NAMES.filter(
  (name): name is D3AreaCurveName => name !== 'curveBundle'
);
const D3_AREA_CURVE_NAME_SET = new Set<string>(D3_AREA_CURVE_NAMES);

export function isD3CurveName(value: unknown): value is D3CurveName {
  return typeof value === 'string' && D3_CURVE_NAME_SET.has(value);
}

export function isD3AreaCurveName(value: unknown): value is D3AreaCurveName {
  return typeof value === 'string' && D3_AREA_CURVE_NAME_SET.has(value);
}

/** Resolve a serializable D3 export name without translating its meaning. */
export function d3Curve(
  name: D3CurveName | D3AreaCurveName | undefined,
  d3: Record<string, unknown>
): CurveFactory {
  const curveName = name ?? 'curveLinear';
  const curve = d3[curveName];
  if (typeof curve !== 'function') {
    throw new Error(`The supplied D3 build does not export "${curveName}".`);
  }
  // Every listed name is a d3-shape curve factory; the registry is checked above.
  return curve as CurveFactory;
}
