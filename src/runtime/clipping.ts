import type { RenderChartContext, RenderScene, RectBounds } from './render-types.js';
const AXIS_CLIP_SLACK = 28;
export function applyPlotClip(chart: RenderChartContext, enabled: boolean): void {
  if (!enabled) { chart.g.attr('clip-path', null); return; }
  const id = `vd-mark-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, { x: 0, y: 0, width: chart.innerWidth, height: chart.innerHeight });
  chart.g.attr('clip-path', `url(#${id})`);
}

export function applyXAxisClip(chart: RenderChartContext): void {
  const id = `vd-x-axis-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, {
    x: -AXIS_CLIP_SLACK,
    y: -chart.height,
    width: chart.innerWidth + AXIS_CLIP_SLACK * 2,
    height: chart.height * 2
  });
  chart.scene.xAxis.attr('clip-path', `url(#${id})`);
}

export function applyYAxisClip(chart: RenderChartContext): void {
  const id = `vd-y-axis-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, {
    x: -chart.width,
    y: -AXIS_CLIP_SLACK / 2,
    width: chart.width * 2,
    height: chart.innerHeight + AXIS_CLIP_SLACK
  });
  chart.scene.yAxis.attr('clip-path', `url(#${id})`);
}

/** Grid lines belong to the plot; one pixel of slack keeps an edge line whole. */
export function applyGridClip(chart: RenderChartContext): void {
  const id = `vd-grid-clip-${chart.scene.clipIdentity}`;
  ensureClipRect(chart.scene, id, { x: -1, y: -1, width: chart.innerWidth + 2, height: chart.innerHeight + 2 });
  chart.scene.grid.attr('clip-path', `url(#${id})`);
}

export function ensureClipRect(scene: RenderScene, id: string, rect: RectBounds): void {
  let defs = scene.svg.select<SVGDefsElement>('defs');
  if (defs.empty()) defs = scene.svg.append<SVGDefsElement>('defs');
  defs.selectAll(`#${id}`).data([null]).join('clipPath').attr('id', id)
    .selectAll('rect').data([null]).join('rect')
    .attr('x', rect.x).attr('y', rect.y).attr('width', rect.width).attr('height', rect.height);
}
