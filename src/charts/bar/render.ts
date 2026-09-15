import { BaseChart } from '../base.js';
import { barCategoryChannel } from './layout/index.js';
import { createBarRenderKit } from './render-pattern.js';
import { createGroupedBarRenderer } from './layout/grouped.js';
import { createSimpleBarRenderer } from './layout/simple.js';
import type { BarLayoutRenderer } from './layout/simple.js';
import { createStackedBarRenderer } from './layout/stacked.js';
import { semanticBarState } from './semantic.js';
import { motion } from '../../runtime/recorder.js';
import type { ChartRuntimeDeps } from '../../runtime/chart-deps.js';
import type { RenderDatum } from '../../runtime/marks.js';
import type { BarLayout, ChannelSpec, ChartContext, ChartDeps, D3Lib, Renderer, ViewSpec } from '../../types/index.js';

export function createBarRenderer(deps: ChartDeps): Renderer {
  return new BarChart(deps).renderer();
}

class BarChart extends BaseChart {
  private readonly drawBar: BarLayoutRenderer;

  constructor(deps: ChartDeps) {
    super(deps);
    this.drawBar = createBarDraw(this.deps);
  }

  render(chart: ChartContext, rows: RenderDatum[], spec: ViewSpec, tooltip: HTMLElement, d3: D3Lib): void {
    this.drawBar(chart, rows, spec, tooltip, d3);
  }
}

function createBarDraw(deps: ChartRuntimeDeps): BarLayoutRenderer {
  const { drawLegend, fadeNonBarShapes } = deps;
  const kit = createBarRenderKit(deps);
  const renderers = {
    grouped: createGroupedBarRenderer(deps, kit),
    simple: createSimpleBarRenderer(deps, kit),
    stacked: createStackedBarRenderer(deps, kit)
  };

  return function drawBar(chart, rows, spec, tooltip, d3) {
    const bar = semanticBarState(spec);
    const renderer = renderers[isSegmentedLayout(bar.layout, bar.segmentField) ? bar.layout : 'simple'];

    fadeNonBarShapes(chart);
    if (renderer !== renderers.stacked) kit.renderBarSeams({ chart, d3 });

    if (renderer === renderers.simple) {
      const duplicate = duplicateCategory(rows, barCategoryChannel(spec.encoding || {}));
      if (duplicate) {
        drawBarDataError(
          chart,
          `Bar chart needs one value per ${duplicate.field}. Found more than one row for "${String(duplicate.value)}". Use .where(...), .breakdown(...), or .rollup(...) to make the grain explicit.`
        );
        return;
      }
    }

    renderer(chart, rows, spec, tooltip, d3, bar.segmentField);
    drawLegend(chart, rows, spec.encoding?.color, d3);
  };
}

function isSegmentedLayout(layout: BarLayout | undefined, segmentField: string | null | undefined): layout is 'grouped' | 'stacked' {
  return Boolean(segmentField) && (layout === 'grouped' || layout === 'stacked');
}

function duplicateCategory(rows: RenderDatum[], channel: ChannelSpec = {}): { field: string; value: unknown } | null {
  if (!channel.field) return null;
  const seen = new Set<unknown>();
  for (const row of rows) {
    const value = row[channel.field];
    if (seen.has(value)) {
      return { field: channel.field, value };
    }
    seen.add(value);
  }
  return null;
}

function drawBarDataError(chart: ChartContext, message: string): void {
  const timing = chart.transition.base;
  chart.scene.empty.style('display', 'grid').text(message);
  motion(chart.g.selectAll<SVGRectElement, unknown>('rect.vd-bar'), timing).style('opacity', 0).remove();
  motion(chart.scene.grid, timing).style('opacity', 0);
  motion(chart.scene.xAxis, timing).style('opacity', 0);
  motion(chart.scene.yAxis, timing).style('opacity', 0);
  motion(chart.scene.xLabel, timing).style('opacity', 0);
  motion(chart.scene.yLabel, timing).style('opacity', 0);
  motion(chart.scene.legend, timing).style('opacity', 0);
}
