import { motion } from './recorder.js';
import { easeCubicInOut } from 'd3-ease';
import type { RenderScene, RenderTransition, RenderChartContext, SvgSelection } from './render-types.js';
import type { ViewSpec } from '../types/index.js';
export function activeMarkLayer(scene: RenderScene, mark: string, transition: RenderTransition): SvgSelection<SVGGElement> {
  fadeLayers(scene, mark, transition);
  if (!scene.markLayers.has(mark)) {
    scene.markLayers.set(mark, scene.markRoot.append('g').attr('class', `vd-mark-layer vd-${mark}-layer`));
  }
  const layer = scene.markLayers.get(mark)!;
  motion(layer.style('display', null), transition.base).style('opacity', 1);
  return layer;
}

export function fadeLayers(
  scene: RenderScene,
  activeMark: string,
  transition: RenderTransition | null = null
): void {
  const resolvedTransition = transition || { base: { delay: 0, duration: 300, ease: easeCubicInOut } };
  scene.markLayers.forEach((layer, mark) => {
    if (mark === activeMark) return;
    motion(layer, resolvedTransition.base).style('opacity', 0);
  });
}

export function drawUnsupported(chart: RenderChartContext, spec: ViewSpec, availableTypes: string[] = []): void {
  chart.g.append('text')
    .attr('x', chart.innerWidth / 2).attr('y', chart.innerHeight / 2)
    .attr('text-anchor', 'middle').attr('fill', 'var(--vd-muted)')
    .text(`Unsupported chart type "${spec.mark}"${availableTypes.length ? ` · available: ${availableTypes.join(', ')}` : ''}`);
}
