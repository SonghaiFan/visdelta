import { axisLeft } from 'd3-axis';
import type { AxisScale, AxisDomain } from 'd3-axis';
import type { RenderChartContext, RuntimeScale, MotionTransition, GridOptions } from './render-types.js';
import type { ThemeValue } from './theme.js';
import { applyGridClip } from './clipping.js';
import { prioritizedContinuousTicks, axisKind } from './axis-layout.js';
import { markAxisInactive, timedTransition, renderAxisWithGuard } from './axis-motion.js';
export function createGrid(themeValue: ThemeValue) {
  function drawGrid(
    chart: RenderChartContext,
    y: RuntimeScale | null,
    transition: MotionTransition = chart.transition.base,
    options: GridOptions = {}
  ): void {
    updateGrid(chart, y, transition, {
      keepX: Boolean(options.x),
      tickCount: options.yTickCount,
      duration: options.duration
    });
    updateXGrid(chart, options.x ?? null, transition, options.xTickCount, options.duration);
  }

  function updateGrid(
    chart: RenderChartContext,
    y: RuntimeScale | null,
    transition: MotionTransition = chart.transition.base,
    options: GridOptions = {}
  ): void {
    applyGridClip(chart);
    if (!options.keepX) updateXGrid(chart, null, transition, undefined, options.duration);
    if (!y) {
      markAxisInactive(chart.scene.grid);
      timedTransition(chart.scene.grid, transition, options.duration).style('opacity', options.keepX ? 1 : 0);
      return;
    }
    const grid = chart.scene.grid.attr('transform', null);
    const tickCount = options.tickCount ?? themeValue('--vd-tick-count', 6);
    renderAxisWithGuard(grid, axisLeft(y as unknown as AxisScale<AxisDomain>)
      .ticks(tickCount)
      .tickValues(prioritizedContinuousTicks(y, tickCount, 22) as AxisDomain[])
      .tickSize(-chart.innerWidth)
      .tickFormat(() => ''), transition, axisKind('grid-left', y), options.duration);
    timedTransition(grid, transition, options.duration).style('opacity', 1);
  }

  function updateXGrid(
    chart: RenderChartContext,
    x: RuntimeScale | null,
    transition: MotionTransition,
    tickCount: number | undefined,
    duration: number | undefined
  ): void {
    const layer = chart.scene.grid.selectAll('g.vd-point-x-grid')
      .data(x ? [null] : [])
      .join(
        (enter) => enter.append('g').attr('class', 'vd-point-x-grid'),
        (update) => update,
        (exit) => timedTransition(exit, transition, duration).style('opacity', 0).remove()
      );
    if (!x) return;

    const count = tickCount ?? themeValue('--vd-tick-count', 6);
    const values = typeof x.ticks === 'function'
      ? prioritizedContinuousTicks(x, count, 44)
      : x.domain();
    layer.style('opacity', 1)
      .selectAll('line')
      .data(values, (value) => String(value))
      .join(
        (enter) => {
          const entered = enter.append('line')
            .attr('x1', (value) => x(value) as number)
            .attr('x2', (value) => x(value) as number)
            .attr('y1', 0)
            .attr('y2', chart.innerHeight)
            .style('opacity', 0);
          timedTransition(entered, transition, duration).style('opacity', 1);
          return entered;
        },
        (update) => {
          timedTransition(update, transition, duration)
            .attr('x1', (value) => x(value) as number)
            .attr('x2', (value) => x(value) as number)
            .attr('y1', 0)
            .attr('y2', chart.innerHeight)
            .style('opacity', 1);
          return update;
        },
        (exit) => { timedTransition(exit, transition, duration).style('opacity', 0).remove(); }
      );
  }

  return { drawGrid, updateGrid };
}
