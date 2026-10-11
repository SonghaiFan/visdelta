import { arc } from 'd3-shape';
import { interpolateNumber } from 'd3-interpolate';
import type { ChartRuntime, Renderer } from '../../types/index.js';
import type { PieViewState } from './authoring.js';
import { pieSlices } from './geometry.js';
import { matchesSelection, viewHighlight } from '../../focus.js';

export function createPieRenderer(runtime: ChartRuntime): Renderer<PieViewState> {
  return (chart, rows, spec, tooltip) => {
    const slices = pieSlices(rows, spec);
    const enc = spec.encoding ?? {};
    const color = runtime.colorScale(chart.domainRows ?? rows, enc.color);
    const labels = spec.labels ?? 'outside';
    const radius = Math.max(1, Math.min(chart.innerHeight, chart.innerWidth * (labels === 'outside' ? 0.6 : 1)) / 2 - 8);
    const innerRadius = radius * (spec.innerRadius ?? 0);
    const cx = chart.innerWidth / 2;
    const cy = chart.innerHeight / 2;
    const timing = chart.transition.base;
    const highlight = viewHighlight(spec);
    const shape = arc<{ startAngle: number; endAngle: number; radius: number; innerRadius: number }>().innerRadius(d => d.innerRadius).outerRadius(d => d.radius);
    const paths = chart.g.selectAll<SVGPathElement, typeof slices[number]>('path.vd-pie-slice').data(slices, d => d.key);
    runtime.motion(paths.exit(), chart.transition.exit ?? timing).style('opacity', 0).remove();
    const enter = paths.enter().append('path').attr('class', 'vd-pie-slice')
      .attr('data-start-angle', d => d.startAngle).attr('data-end-angle', d => d.startAngle).attr('data-radius', 0).attr('data-inner-radius', 0);
    const merged = enter.merge(paths).attr('data-key', d => d.key);
    runtime.motion(merged, timing)
      .attrTween('d', function(d) {
        const start = interpolateNumber(Number(this.getAttribute('data-start-angle')), d.startAngle);
        const end = interpolateNumber(Number(this.getAttribute('data-end-angle')), d.endAngle);
        const r = interpolateNumber(Number(this.getAttribute('data-radius')), radius);
        const inner = interpolateNumber(Number(this.getAttribute('data-inner-radius')), innerRadius);
        return t => shape({ startAngle: start(t), endAngle: end(t), radius: r(t), innerRadius: inner(t) }) ?? '';
      })
      .attr('data-start-angle', d => d.startAngle).attr('data-end-angle', d => d.endAngle).attr('data-radius', radius).attr('data-inner-radius', innerRadius)
      .attr('transform', `translate(${cx},${cy})`)
      .attr('fill', d => color(d.data)).attr('stroke', runtime.themeValue('--vd-color-surface', '#fff') as string).attr('stroke-width', 1)
      .style('opacity', d => !highlight || matchesSelection(d.data, highlight) ? 1 : Number(highlight.opacity ?? 0.2));
    merged.selectAll('title').remove();
    merged.append('title').text(d => `${sliceLabel(d.data)}: ${(d.share * 100).toFixed(1)}%`);
    runtime.bindTooltip(merged, spec, tooltip);
    const labelSlices = labels === 'none' ? [] : slices.filter(d => d.value > 0);
    const texts = chart.g.selectAll<SVGTextElement, typeof slices[number]>('text.vd-pie-label').data(labelSlices, d => d.key);
    runtime.motion(texts.exit(), chart.transition.exit ?? timing).style('opacity', 0).remove();
    const text = texts.enter().append('text').attr('class', 'vd-pie-label').style('opacity', 0).merge(texts);
    const positions = new Map<string, { x: number; y: number; right: boolean }>();
    const half = (d: typeof slices[number]) => (d.startAngle + d.endAngle) / 2;
    const right = (d: typeof slices[number]) => Math.sin(half(d)) >= 0;
    if (labels === 'outside') {
      for (const side of [true, false]) {
        const group = labelSlices.filter(d => right(d) === side).sort((a, b) => -Math.cos(half(a)) + Math.cos(half(b)));
        const gap = Math.min(18, chart.innerHeight / Math.max(1, group.length));
        const ys = group.map(d => Math.max(gap / 2, Math.min(chart.innerHeight - gap / 2, cy - Math.cos(half(d)) * radius)));
        for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
        if (ys.length && ys[ys.length - 1] > chart.innerHeight - gap / 2) {
          ys[ys.length - 1] = chart.innerHeight - gap / 2;
          for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
        }
        group.forEach((d, i) => positions.set(d.key, { x: cx + (side ? radius + 10 : -radius - 10), y: ys[i], right: side }));
      }
    } else labelSlices.forEach(d => positions.set(d.key, { x: cx + Math.sin(half(d)) * (innerRadius + radius) / 2, y: cy - Math.cos(half(d)) * (innerRadius + radius) / 2, right: right(d) }));
    runtime.motion(text, timing).attr('x', d => positions.get(d.key)!.x).attr('y', d => positions.get(d.key)!.y)
      .attr('text-anchor', d => labels === 'inside' ? 'middle' : positions.get(d.key)!.right ? 'start' : 'end')
      .attr('dominant-baseline', 'middle').attr('fill', runtime.themeValue('--vd-color-on-surface', '#30343b') as string)
      .style('font-size', '11px').style('opacity', 1).text(d => labels === 'inside' ? `${(d.share * 100).toFixed(0)}%` : `${sliceLabel(d.data)} ${(d.share * 100).toFixed(0)}%`);
    const leaders = chart.g.selectAll<SVGPathElement, typeof slices[number]>('path.vd-pie-leader').data(labels === 'outside' ? labelSlices : [], d => d.key);
    runtime.motion(leaders.exit(), chart.transition.exit ?? timing).style('opacity', 0).remove();
    runtime.motion(leaders.enter().append('path').attr('class', 'vd-pie-leader').style('opacity', 0).merge(leaders), timing)
      .attr('d', d => { const p = positions.get(d.key)!; return `M${cx + Math.sin(half(d)) * radius},${cy - Math.cos(half(d)) * radius}L${p.x + (p.right ? -4 : 4)},${p.y}`; })
      .attr('fill', 'none').attr('stroke', runtime.themeValue('--vd-color-on-surface', '#30343b') as string).attr('stroke-width', 0.5).style('opacity', 0.6);
    chart.channels = enc;
    // Outside labels identify slices directly; a key is useful with inside/no labels.
    runtime.drawLegend(chart, rows, labels === 'outside' ? undefined : enc.color);
    function sliceLabel(row: Record<string, unknown>) {
      const field = enc.label?.field ?? enc.color?.field;
      const label = field ? String(row[field] ?? '') : '';
      // Keep labels within the available horizontal gutter; full text remains in tooltip.
      const max = Math.max(3, Math.floor((chart.innerWidth / 2 - radius - 16) / 6));
      return label.length > max && labels === 'outside' ? label.slice(0, max - 1) + '…' : label;
    }
  };
}
