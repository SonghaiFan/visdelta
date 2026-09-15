// @ts-nocheck — D3 rendering code; typed via deps injection
import { BaseChart } from '../base.js';
import { barCategoryChannel } from './layout/index.js';
import { createBarRenderKit } from './render-pattern.js';
import { createGroupedBarRenderer } from './layout/grouped.js';
import { createSimpleBarRenderer } from './layout/simple.js';
import { createStackedBarRenderer } from './layout/stacked.js';
import { semanticBarState } from './semantic.js';

export function createBarRenderer(deps) {
  return new BarChart(deps, createBarDraw(deps)).renderer();
}

class BarChart extends BaseChart {
  constructor(deps, drawBar) {
    super(deps);
    this.drawBar = drawBar;
  }

  render(chart, rows, spec, tooltip, d3) {
    return this.drawBar(chart, rows, spec, tooltip, d3);
  }
}

function createBarDraw(deps) {
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
    if (renderer !== renderers.stacked) kit.renderBarSeams({ chart });

    if (renderer === renderers.simple) {
      const duplicate = duplicateCategory(rows, barCategoryChannel(spec.encoding || {}));
      if (duplicate) {
        drawBarDataError(
          chart,
          `Bar chart needs one value per ${duplicate.field}. Found more than one row for "${duplicate.value}". Use .where(...), .breakdown(...), or .rollup(...) to make the grain explicit.`
        );
        return;
      }
    }

    renderer(chart, rows, spec, tooltip, d3, bar.segmentField);
    drawLegend(chart, rows, spec.encoding?.color, d3);
  };
}

function isSegmentedLayout(layout, segmentField) {
  return Boolean(segmentField) && (layout === 'grouped' || layout === 'stacked');
}

function duplicateCategory(rows, channel = {}) {
  if (!channel.field) return null;
  const counts = new Map();
  for (const row of rows) {
    const value = row[channel.field];
    if (counts.has(value)) {
      return { field: channel.field, value };
    }
    counts.set(value, true);
  }
  return null;
}

function drawBarDataError(chart, message) {
  chart.scene.empty.style('display', 'grid').text(message);
  chart.g.selectAll('rect.vd-bar').transition(chart.transition.base).style('opacity', 0).remove();
  chart.scene.grid.transition(chart.transition.base).style('opacity', 0);
  chart.scene.xAxis.transition(chart.transition.base).style('opacity', 0);
  chart.scene.yAxis.transition(chart.transition.base).style('opacity', 0);
  chart.scene.xLabel.transition(chart.transition.base).style('opacity', 0);
  chart.scene.yLabel.transition(chart.transition.base).style('opacity', 0);
  chart.scene.legend.transition(chart.transition.base).style('opacity', 0);
}
