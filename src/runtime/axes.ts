import { axisBottom, axisLeft, axisRight, axisTop } from 'd3-axis';
import type { AxisScale, AxisDomain } from 'd3-axis';
import type { RenderChartContext, RuntimeScale, MotionTransition, AxisOptions } from './render-types.js';
import type { ThemeValue } from './theme.js';
import { applyXAxisClip, applyYAxisClip } from './clipping.js';
import { activeAxisSide, activeHorizontalAxisSide, axisSideTransform, axisPositionTransform, xLabelSideY, prioritizedContinuousTicks, axisKind, axisIsEntering, alignEdgeTickLabels, placeYLabel, placeEdgeXLabel, placeEdgeYLabel } from './axis-layout.js';
import { markAxisInactive, timedTransition, renderAxisWithGuard, transitionAxisLabel } from './axis-motion.js';
export function createAxes(themeValue: ThemeValue) {
  function drawXAxis(
    chart: RenderChartContext,
    scale: RuntimeScale | null,
    title: string | undefined,
    transition: MotionTransition = chart.transition.base,
    options: AxisOptions = {}
  ): void {
    const side = options.side === 'top' ? 'top' : 'bottom';
    const duration = options.duration;
    applyXAxisClip(chart);
    if (!scale) {
      const inactiveSide = activeHorizontalAxisSide(chart.scene.xAxis, side);
      markAxisInactive(chart.scene.xAxis);
      timedTransition(chart.scene.xAxis, transition, duration)
        .attr('transform', axisSideTransform(chart, inactiveSide, true))
        .style('opacity', 0);
      const hiddenLabel = timedTransition(chart.scene.xLabel, transition, duration).style('opacity', 0);
      if (!options.edgeTitleInset) {
        hiddenLabel
          .attr('transform', `translate(${chart.margin.left},0)`)
          .attr('y', xLabelSideY(chart, inactiveSide, true, themeValue('--vd-axis-label-offset', 48)));
      }
      return;
    }
    const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
    const labelOffset = Math.min(themeValue('--vd-axis-label-offset', 48), chart.margin[side] - 4);
    const axisFactory = side === 'top' ? axisTop : axisBottom;
    const axisScale = scale as unknown as AxisScale<AxisDomain>;
    let axis = typeof scale.bandwidth === 'function'
      ? axisFactory(axisScale)
      : axisFactory(axisScale).ticks(tickCount, options.tickFormat);
    if (typeof scale.bandwidth !== 'function') {
      axis = axis.tickValues(prioritizedContinuousTicks(scale, tickCount, 44) as AxisDomain[]);
    }
    axis = axis.tickSizeOuter(0);
    // Adaptive label thinning for band (categorical) x-axes:
    // when available px-per-band < threshold, skip every Nth label so they never overlap.
    if (typeof scale.bandwidth === 'function') {
      const domain = scale.domain();
      const minPxPerLabel = 44; // ~5 chars × 7px + 9px padding
      const pxPerBand = scale.step!();
      if (pxPerBand < minPxPerLabel) {
        const step = Math.ceil(minPxPerLabel / pxPerBand);
        axis = axis.tickValues(domain.filter((_, i) => i % step === 0) as AxisDomain[]);
      }
    }
    const kind = axisKind(side, scale);
    const xAxis = chart.scene.xAxis;
    const entersFromSide = axisIsEntering(xAxis);
    renderAxisWithGuard(xAxis, axis, transition, kind, duration);
    if (entersFromSide) {
      xAxis.attr('transform', axisSideTransform(chart, side, true)).style('opacity', 0);
    }
    xAxis.selectAll('.tick text').attr('dy', '0.8em');
    alignEdgeTickLabels(xAxis, scale);
    timedTransition(xAxis, transition, duration)
      .attr('transform', axisPositionTransform(chart, side, options.position))
      .style('opacity', 1);
    if (title) {
      const xLabel = chart.scene.xLabel;
      const xLabelTransition = transitionAxisLabel(xLabel, title, transition, duration);
      const inset = options.edgeTitleInset;
      if (inset) {
        // An edge title never travels with the axis; it fades in where it lives.
        if (entersFromSide) placeEdgeXLabel(xLabel, chart, inset).style('opacity', 0);
        placeEdgeXLabel(xLabelTransition, chart, inset);
      } else {
        if (entersFromSide) {
          xLabel
            .attr('x', chart.innerWidth / 2)
            .attr('y', xLabelSideY(chart, side, true, labelOffset))
            .attr('text-anchor', 'middle')
            .attr('transform', `translate(${chart.margin.left},0)`)
            .style('opacity', 0);
        }
        xLabelTransition
          .attr('x', chart.innerWidth / 2).attr('y', xLabelSideY(chart, side, false, labelOffset))
          .attr('text-anchor', 'middle').attr('transform', `translate(${chart.margin.left},0)`);
      }
    } else {
      timedTransition(chart.scene.xLabel, transition, duration).style('opacity', 0);
    }
  }

  function drawYAxis(
    chart: RenderChartContext,
    scale: RuntimeScale | null,
    title: string | undefined,
    transition: MotionTransition = chart.transition.base,
    options: AxisOptions = {}
  ): void {
    const side = options.side === 'right' ? 'right' : 'left';
    const duration = options.duration;
    applyYAxisClip(chart);
    if (!scale) {
      const inactiveSide = activeAxisSide(chart.scene.yAxis, side);
      markAxisInactive(chart.scene.yAxis);
      timedTransition(chart.scene.yAxis, transition, duration)
        .attr('transform', axisSideTransform(chart, inactiveSide, true))
        .style('opacity', 0);
      timedTransition(chart.scene.yLabel, transition, duration).style('opacity', 0);
      return;
    }
    const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
    const labelOffset = Math.min(themeValue('--vd-axis-label-offset', 48), chart.margin[side] - themeValue('--vd-axis-title-font-size', 11) * 1.2);
    const axisFactory = side === 'right' ? axisRight : axisLeft;
    const axisScale = scale as unknown as AxisScale<AxisDomain>;
    let axis = typeof scale.bandwidth === 'function'
      ? axisFactory(axisScale)
      : axisFactory(axisScale).ticks(tickCount, options.tickFormat);
    if (typeof scale.bandwidth !== 'function') {
      axis = axis.tickValues(prioritizedContinuousTicks(scale, tickCount, 22) as AxisDomain[]);
    }
    axis = axis.tickSizeOuter(0);
    // Adaptive label thinning for band (categorical) y-axes (horizontal bar charts):
    if (typeof scale.bandwidth === 'function') {
      const domain = scale.domain();
      const minPxPerLabel = 22; // vertical: ~1 line height
      const pxPerBand = scale.step!();
      if (pxPerBand < minPxPerLabel) {
        const step = Math.ceil(minPxPerLabel / pxPerBand);
        axis = axis.tickValues(domain.filter((_, i) => i % step === 0) as AxisDomain[]);
      }
    }
    const kind = axisKind(side, scale);
    const yAxis = chart.scene.yAxis;
    const entersFromSide = axisIsEntering(yAxis);
    renderAxisWithGuard(yAxis, axis, transition, kind, duration);
    if (entersFromSide) {
      yAxis.attr('transform', axisSideTransform(chart, side, true)).style('opacity', 0);
    }
    timedTransition(yAxis, transition, duration)
      .attr('transform', axisPositionTransform(chart, side, options.position))
      .style('opacity', 1);
    if (title) {
      const yLabel = chart.scene.yLabel;
      const yLabelTransition = transitionAxisLabel(yLabel, title, transition, duration);
      const inset = options.edgeTitleInset;
      if (inset) {
        if (entersFromSide) placeEdgeYLabel(yLabel, chart, inset).style('opacity', 0);
        placeEdgeYLabel(yLabelTransition, chart, inset);
      } else {
        if (entersFromSide) placeYLabel(yLabel, chart, side, labelOffset, true).style('opacity', 0);
        placeYLabel(yLabelTransition, chart, side, labelOffset, false);
      }
    } else {
      timedTransition(chart.scene.yLabel, transition, duration).style('opacity', 0);
    }
  }

  return { drawXAxis, drawYAxis };
}
