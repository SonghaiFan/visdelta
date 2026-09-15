// Seekable axis rendering.
//
// d3-axis can animate only onto a real d3-transition: it calls
// `tick.transition(context)` to inherit timing, which reads private schedule
// state. This renders the identical DOM (.domain path, .tick groups with line
// and text, the same attributes and __axis position memo) but animates through
// a caller-supplied motion factory, so ticks become tracks like any mark.
//
// The axis *configuration* still comes from a d3 Axis object, read through its
// public getters, so call sites keep building axes with axisBottom(...).

import type { Axis, AxisDomain } from 'd3-axis';
import type { BaseType, Selection } from 'd3-selection';
import type { Motion } from './recorder.js';
import { axisBottom } from 'd3-axis';

export type AxisOrient = 'top' | 'right' | 'bottom' | 'left';

type AxisGroupNode = SVGGElement & { __axis?: (d: AxisDomain) => number };
type TickNode = SVGGElement & { parentNode: AxisGroupNode | null };

interface AxisScale {
  (d: AxisDomain): number | undefined;
  domain(): AxisDomain[];
  range(): number[];
  copy(): AxisScale;
  bandwidth?(): number;
  round?(): boolean;
  ticks?(...args: unknown[]): AxisDomain[];
  tickFormat?(...args: unknown[]): (d: AxisDomain) => string;
}

/** Any selection of the axis group; the datum type is irrelevant here. */
export type AxisGroupSelection = Selection<SVGGElement, unknown, BaseType, unknown>;
export type MotionFactory = <E extends BaseType, D>(selection: Selection<E, D, any, any>) => Motion<E, D>;

const EPSILON = 1e-6;

/**
 * Render `axis` into `group`. With a `motion` factory the change animates
 * (entering ticks fade in from the previous scale's position, exiting ticks
 * fade out to their new position and are removed on finish); without one the
 * result is written immediately, as d3-axis does on a plain selection.
 */
export function renderAxis(
  group: AxisGroupSelection,
  axis: Axis<AxisDomain>,
  orient: AxisOrient,
  motion: MotionFactory | null
): void {
  const scale = axis.scale() as unknown as AxisScale;
  const tickArguments = axis.tickArguments() as unknown[];
  const tickValues = axis.tickValues() as AxisDomain[] | null;
  const tickFormat = axis.tickFormat() as ((d: AxisDomain) => string) | null;
  const tickSizeInner = axis.tickSizeInner();
  const tickSizeOuter = axis.tickSizeOuter();
  const tickPadding = axis.tickPadding();
  const offset = axis.offset();

  const k = orient === 'top' || orient === 'left' ? -1 : 1;
  const x = orient === 'left' || orient === 'right' ? 'x' : 'y';
  const transform = orient === 'top' || orient === 'bottom'
    ? (v: number) => `translate(${v},0)`
    : (v: number) => `translate(0,${v})`;

  const values = tickValues ?? (scale.ticks ? scale.ticks(...tickArguments) : scale.domain());
  const format = tickFormat ?? (scale.tickFormat ? scale.tickFormat(...tickArguments) : (d: AxisDomain) => String(d));
  const spacing = Math.max(tickSizeInner, 0) + tickPadding;
  const range = scale.range();
  const range0 = +range[0] + offset;
  const range1 = +range[range.length - 1] + offset;
  const position = positionOf(scale.copy(), offset);

  const selection = group as unknown as Selection<AxisGroupNode, unknown, BaseType, unknown>;
  const domainJoin = selection.selectAll<SVGPathElement, null>('.domain').data([null]);
  const tickJoin = selection.selectAll<TickNode, AxisDomain>('.tick').data(values, scale as unknown as (d: AxisDomain) => string).order();
  const tickExit = tickJoin.exit<AxisDomain>();
  const tickEnter = tickJoin.enter().append<TickNode>('g').attr('class', 'tick');

  const path = domainJoin.merge(domainJoin.enter().insert<SVGPathElement>('path', '.tick')
    .attr('class', 'domain')
    .attr('stroke', 'currentColor'));
  const tick = tickJoin.merge(tickEnter);
  const line = tickJoin.select<SVGLineElement>('line').merge(tickEnter.append<SVGLineElement>('line')
    .attr('stroke', 'currentColor')
    .attr(`${x}2`, k * tickSizeInner));
  const text = tickJoin.select<SVGTextElement>('text').merge(tickEnter.append<SVGTextElement>('text')
    .attr('fill', 'currentColor')
    .attr(x, k * spacing)
    .attr('dy', orient === 'top' ? '0em' : orient === 'bottom' ? '0.71em' : '0.32em'));

  const pathD = orient === 'left' || orient === 'right'
    ? (tickSizeOuter ? `M${k * tickSizeOuter},${range0}H${offset}V${range1}H${k * tickSizeOuter}` : `M${offset},${range0}V${range1}`)
    : (tickSizeOuter ? `M${range0},${k * tickSizeOuter}V${offset}H${range1}V${k * tickSizeOuter}` : `M${range0},${offset}H${range1}`);
  const tickTransform = (d: AxisDomain) => transform(position(d) + offset);

  if (motion) {
    motion(tickExit)
      .attr('opacity', EPSILON)
      .attr('transform', function (d) {
        const p = position(d);
        return Number.isFinite(p) ? transform(p + offset) : this.getAttribute('transform');
      })
      .remove();
    tickEnter
      .attr('opacity', EPSILON)
      .attr('transform', function (d) {
        const previous = this.parentNode?.__axis;
        const p = previous ? previous(d) : NaN;
        return transform((Number.isFinite(p) ? p : position(d)) + offset);
      });
    motion(path).attr('d', pathD);
    motion(tick).attr('opacity', 1).attr('transform', tickTransform);
    motion(line).attr(`${x}2`, k * tickSizeInner);
    motion(text).attr(x, k * spacing).text((d) => format(d));
  } else {
    tickExit.remove();
    path.attr('d', pathD);
    tick.attr('opacity', 1).attr('transform', tickTransform);
    line.attr(`${x}2`, k * tickSizeInner);
    text.attr(x, k * spacing).text((d) => format(d));
  }

  selection.filter(function () { return !this.__axis; })
    .attr('fill', 'none')
    .attr('font-size', 10)
    .attr('font-family', 'sans-serif')
    .attr('text-anchor', orient === 'right' ? 'start' : orient === 'left' ? 'end' : 'middle');

  selection.each(function () { this.__axis = position; });
}

function positionOf(scale: AxisScale, offset: number): (d: AxisDomain) => number {
  if (typeof scale.bandwidth !== 'function') return (d) => +(scale(d) as number);
  let center = Math.max(0, scale.bandwidth() - offset * 2) / 2;
  if (typeof scale.round === 'function' && scale.round()) center = Math.round(center);
  return (d) => +(scale(d) as number) + center;
}
