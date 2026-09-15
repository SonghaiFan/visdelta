import {
  curveBasis, curveBasisClosed, curveBasisOpen, curveBumpX, curveBumpY, curveBundle, curveCardinal, curveCardinalClosed, curveCardinalOpen, curveCatmullRom, curveCatmullRomClosed, curveCatmullRomOpen, curveLinear, curveLinearClosed, curveMonotoneX, curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore
} from 'd3-shape';
import type { CurveFactory, CurveBundleFactory, CurveCardinalFactory, CurveCatmullRomFactory } from 'd3-shape';
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

/** D3's curveBundle omits areaStart/areaEnd and only works with line(). */
export const D3_AREA_CURVE_NAMES = D3_CURVE_NAMES.filter(
  (name): name is D3AreaCurveName => name !== 'curveBundle'
);
const D3_AREA_CURVE_NAME_SET = new Set<string>(D3_AREA_CURVE_NAMES);

const CURVES: Record<D3CurveName, CurveFactory | CurveBundleFactory | CurveCardinalFactory | CurveCatmullRomFactory> = {
  curveBasis, curveBasisClosed, curveBasisOpen, curveBumpX, curveBumpY, curveBundle, curveCardinal, curveCardinalClosed, curveCardinalOpen, curveCatmullRom, curveCatmullRomClosed, curveCatmullRomOpen, curveLinear, curveLinearClosed, curveMonotoneX, curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore
};

export function isD3CurveName(value: unknown): value is D3CurveName {
  return typeof value === 'string' && D3_CURVE_NAME_SET.has(value);
}

export function isD3AreaCurveName(value: unknown): value is D3AreaCurveName {
  return typeof value === 'string' && D3_AREA_CURVE_NAME_SET.has(value);
}

/** Resolve a serializable D3 export name without translating its meaning. */
export function d3Curve(
  name: D3CurveName | D3AreaCurveName | undefined
): CurveFactory {
  // Every listed name is a d3-shape curve factory; the registry is checked above.
  return CURVES[name ?? 'curveLinear'] as CurveFactory;
}
