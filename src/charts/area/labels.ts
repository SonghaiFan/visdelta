import { rgb } from 'd3-color';
import { interpolateNumber } from 'd3-interpolate';
import { motion } from '../../runtime/recorder.js';
import { matchesSelection } from '../../focus.js';
import type { ChartContext, SelectionSpec } from '../../types/index.js';
import type { AreaViewState } from './authoring.js';
import type { AreaCell } from './state.js';
import type { AreaFramePoint, AreaBoundaryPoint } from './render.js';
import type { Area } from 'd3-shape';

interface LayerLabel {
  key: string;
  text: string;
  x: number;
  y: number;
  fill: string;
  opacity: number;
}

/** Area owns placement and fit: no label field or new mark identity is inferred. */
export function drawAreaLabels(
  chart: ChartContext,
  spec: AreaViewState,
  cells: AreaCell[],
  frame: (cell: AreaCell) => AreaFramePoint[],
  shape: Area<AreaBoundaryPoint>,
  color: (row: Record<string, unknown>) => string,
  highlight: SelectionSpec | null,
  dimOpacity: number
): void {
  if (spec.labels !== undefined && spec.labels !== 'inside' && spec.labels !== 'none') {
    throw new Error('Area labels must be inside or none.');
  }
  const labels: LayerLabel[] = [];
  const group = chart.g.selectAll<SVGGElement, null>('g.vd-area-labels')
    .data([null]).join('g').attr('class', 'vd-area-labels').attr('pointer-events', 'none');
  // Measure using the same SVG font as the rendered label; character counts do
  // not establish fit for proportional fonts or non-Latin series names.
  const measure = group.append('text').attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central').style('font-size', '12px').style('font-weight', '600');
  if (spec.labels === 'inside') {
    const layers = new Map<string, AreaCell[]>();
    for (const cell of cells) {
      if (cell.value == null) continue;
      const layer = layers.get(cell.layerKey) ?? [];
      layer.push(cell);
      layers.set(cell.layerKey, layer);
    }
    for (const [key, layer] of layers) {
      const text = String(layer[0].value);
      if (!text) continue;
      measure.text(text);
      const box = measure.node()!.getBBox();
      const geometry = group.append('g').attr('visibility', 'hidden');
      const paths = layer.map(cell => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', shape(frame(cell)) ?? '');
        geometry.node()!.appendChild(path);
        return path;
      });
      // Prefer the middle of the plot, then search at most 64 observation
      // centers. Testing each actual cell path preserves filtered gaps and curves.
      const candidates = layer.map(cell => ({ cell, point: frame(cell)[1] }))
        .sort((a, b) => Math.abs(a.point.x - chart.innerWidth / 2) - Math.abs(b.point.x - chart.innerWidth / 2))
        .slice(0, 64);
      for (const { cell, point } of candidates) {
        const x = point.x;
        const y = (point.y0 + point.y1) / 2;
        if (!fits(paths, x, y, box, chart.innerWidth, chart.innerHeight)) continue;
        const c = rgb(color(cell.row));
        const luminance = [c.r, c.g, c.b].map(v => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        labels.push({ key, text, x, y, fill: luminance > 0.179 ? '#000000' : '#ffffff',
          opacity: highlight && !matchesSelection(cell.row, highlight) ? dimOpacity : 1 });
        break;
      }
      geometry.remove();
    }
  }
  measure.remove();
  const join = group.selectAll<SVGTextElement, LayerLabel>('text.vd-area-label').data(labels, d => d.key);
  motion(join.exit(), chart.transition.exit || chart.transition.base).style('opacity', 0).remove();
  const enter = join.enter().append('text').attr('class', 'vd-area-label')
    .attr('data-layer-key', d => d.key).attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .attr('x', d => d.x).attr('y', d => d.y).style('font-size', '12px').style('font-weight', '600')
    .style('opacity', 0).text(d => d.text);
  motion(enter.merge(join), chart.transition.base)
    .attr('x', d => d.x).attr('y', d => d.y).attr('fill', d => d.fill)
    .styleTween('opacity', function(d) {
      const node = this as SVGTextElement;
      const opacity = interpolateNumber(Number(node.style.opacity || 0), d.opacity);
      const paths = chart.g.selectAll<SVGPathElement, AreaCell>('path.vd-area')
        .nodes().filter(path => path.getAttribute('data-layer-key') === d.key);
      return t => {
        // Recorded path and position tracks run first. Re-check the actual
        // moving layer so labels never bridge a gap or spill into a neighbour.
        const x = Number(node.getAttribute('x'));
        const y = Number(node.getAttribute('y'));
        const box = node.getBBox();
        return fits(paths, x, y, { x: box.x - x, y: box.y - y, width: box.width, height: box.height }, chart.innerWidth, chart.innerHeight)
          ? String(opacity(t)) : '0';
      };
    });
}

function fits(paths: SVGPathElement[], x: number, y: number,
  box: { x: number; y: number; width: number; height: number }, width: number, height: number): boolean {
  const left = x + box.x - 3, right = left + box.width + 6;
  const top = y + box.y - 3, bottom = top + box.height + 6;
  if (left < 0 || right > width || top < 0 || bottom > height) return false;
  // A bounded two-pixel grid checks the padded text rectangle against the
  // union of actual cell fills, including curved edges and disconnected runs.
  const nx = Math.ceil((right - left) / 2), ny = Math.ceil((bottom - top) / 2);
  if (nx * ny > 10000) return false;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    const point = new DOMPoint(left + (right - left) * i / nx, top + (bottom - top) * j / ny);
    if (!paths.some(path => path.isPointInFill(point))) return false;
  }
  return true;
}
