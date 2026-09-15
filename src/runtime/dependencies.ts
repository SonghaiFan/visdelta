import { extent, group, max, min, ticks } from 'd3-array';
import { axisBottom, axisLeft, axisRight, axisTop } from 'd3-axis';
import { hcl } from 'd3-color';
import { autoType } from 'd3-dsv';
import {
  easeBackOut, easeBounceIn, easeBounceOut, easeCubic, easeCubicInOut,
  easeCubicOut, easeElasticOut, easeExp, easeExpIn, easeExpInOut,
  easeExpOut, easeLinear, easeSinInOut
} from 'd3-ease';
import { csv, json } from 'd3-fetch';
import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';
import { format } from 'd3-format';
import { interpolate, interpolateNumber, interpolateTransformSvg } from 'd3-interpolate';
import { scaleBand, scaleLinear, scaleLog, scaleOrdinal, scaleSqrt, scaleTime } from 'd3-scale';
import { namespace, select } from 'd3-selection';
import {
  area, line, curveBasis, curveBasisClosed, curveBasisOpen, curveBumpX,
  curveBumpY, curveBundle, curveCardinal, curveCardinalClosed,
  curveCardinalOpen, curveCatmullRom, curveCatmullRomClosed,
  curveCatmullRomOpen, curveLinear, curveLinearClosed, curveMonotoneX,
  curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore
} from 'd3-shape';
import { now } from 'd3-timer';
import 'd3-transition';
import type { D3Lib, RuntimeOptions } from '../types/index.js';

/**
 * The single runtime shared by all VisDelta charts.
 *
 * These are deliberately library-owned module singletons, not browser globals:
 * authors should never need to thread D3 through a chart state.
 * The plugin-facing object is deliberately limited to these named exports.
 */
export const runtimeD3: D3Lib = {
  extent, group, max, min, ticks,
  axisBottom, axisLeft, axisRight, axisTop,
  hcl, autoType,
  easeBackOut, easeBounceIn, easeBounceOut, easeCubic, easeCubicInOut,
  easeCubicOut, easeElasticOut, easeExp, easeExpIn, easeExpInOut,
  easeExpOut, easeLinear, easeSinInOut,
  csv, json,
  forceCollide, forceSimulation, forceX, forceY,
  format, interpolate, interpolateNumber, interpolateTransformSvg,
  scaleBand, scaleLinear, scaleLog, scaleOrdinal, scaleSqrt, scaleTime,
  namespace, select,
  area, line, curveBasis, curveBasisClosed, curveBasisOpen, curveBumpX,
  curveBumpY, curveBundle, curveCardinal, curveCardinalClosed,
  curveCardinalOpen, curveCatmullRom, curveCatmullRomClosed,
  curveCatmullRomOpen, curveLinear, curveLinearClosed, curveMonotoneX,
  curveMonotoneY, curveNatural, curveStep, curveStepAfter, curveStepBefore,
  now
};
export function resolveRuntime<T extends RuntimeOptions>(options: T = {} as T) {
  return {
    ...options,
    d3: runtimeD3
  };
}
