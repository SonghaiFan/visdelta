import { renderAxis } from './axis.js';
import type { AxisOrient } from './axis.js';
import { motion } from './recorder.js';
import type { Motion } from './recorder.js';
import type { Axis, AxisDomain } from 'd3-axis';
import type { BaseType, Selection } from 'd3-selection';
import type { SvgSelection, AxisElement, MotionTransition } from './render-types.js';
export function markAxisInactive(axisGroup: SvgSelection<AxisElement>): void {
  const node = axisGroup.node();
  if (!node) return;
  node.__visDeltaAxisActive = false;
}

export function renderAxisWithGuard(
  axisGroup: SvgSelection<AxisElement>,
  axis: Axis<AxisDomain>,
  transition: MotionTransition,
  kind: string,
  duration: number | undefined
): void {
  const node = axisGroup.node();
  const canTransition = node?.__visDeltaAxisActive && node.__visDeltaAxisKind === kind;
  const replacesKind = node?.__visDeltaAxisActive && node.__visDeltaAxisKind !== kind;
  if (node) { node.__visDeltaAxisActive = true; node.__visDeltaAxisKind = kind; }
  const orient = axisOrient(kind);
  if (canTransition) {
    renderAxis(axisGroup, axis, orient, (selection) => timedTransition(selection, transition, duration));
    return;
  }
  if (replacesKind) {
    // Grid axes share tick rendering, not axis presentation. Their exiting
    // copy must retain grid strokes (including nested x-grid lines) and keep
    // the domain path hidden throughout the crossfade.
    const ghostClass = kind.startsWith('grid-')
      ? 'vd-grid vd-grid-ghost'
      : 'vd-axis vd-axis-ghost';
    fadeClone(axisGroup, ghostClass, transition, duration);
    renderAxis(axisGroup, axis, orient, null);
    axisGroup.style('opacity', 0);
    return;
  }
  renderAxis(axisGroup, axis, orient, null);
}

/** Axis kinds are `${placement}:${scale}`; grid placements are prefixed `grid-`. */
export function axisOrient(kind: string): AxisOrient {
  const placement = kind.split(':')[0].replace(/^grid-/, '');
  return placement === 'top' || placement === 'right' || placement === 'bottom' ? placement : 'left';
}

export function transitionAxisLabel(
  label: SvgSelection<SVGTextElement>,
  title: string,
  transition: MotionTransition,
  duration: number | undefined
): Motion<SVGTextElement, unknown> {
  const previousTitle = label.text();
  // An axis has one meaning in each frame, so it must have one label node.
  // Keep incompatible axis geometry ghosts, but never duplicate title text.
  label.node()?.parentNode?.querySelectorAll?.('.vd-axis-label-ghost')
    .forEach((node) => node.remove());
  if (previousTitle && previousTitle !== title) {
    label.text(previousTitle).style('opacity', 1);
    return timedTransition(label, transition, duration)
      .tween('text', function(this: Element) {
        return (progress: number) => { this.textContent = progress < 0.5 ? previousTitle : title; };
      })
      .style('opacity', 1);
  }
  label.text(title);
  return timedTransition(label, transition, duration).style('opacity', 1);
}

export function fadeClone<ElementType extends BaseType, Datum>(
  selection: Selection<ElementType, Datum, any, any>,
  className: string,
  transition: MotionTransition,
  duration: number | undefined
): void {
  const clone = selection.clone(true).attr('class', className).attr('aria-hidden', 'true');
  timedTransition(clone, transition, duration).style('opacity', 0).remove();
}

export function timedTransition<ElementType extends BaseType, Datum>(
  selection: Selection<ElementType, Datum, any, any>,
  transition: MotionTransition,
  duration: number | undefined
): Motion<ElementType, Datum> {
  return motion(selection, Number.isFinite(Number(duration))
    ? { ...transition, duration: Math.max(0, Number(duration)) }
    : transition);
}
