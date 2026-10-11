import { viewSelection } from '../../focus.js';
import { specState } from '../../spec-meta.js';
import { defineChartType } from '../plugin.js';
import { createPieRenderer } from './render.js';
import { chartWarnings } from './warnings.js';
import type { PieViewState } from './authoring.js';
export const plugin = defineChartType<PieViewState>({
  key: 'pie',
  scenes: [],
  layoutChannels: spec => ({ color: spec.encoding?.color }),
  presentation: { plot: { margin: { top: 28, right: 12, bottom: 12, left: 12 }, grid: 'none' } },
  defaultMarkKey: spec => spec.encoding?.color?.field ?? spec.encoding?.label?.field ?? null,
  prepareSpec: spec => {
    for (const channel of ['x', 'y', 'size', 'xOffset', 'yOffset']) {
      if (spec.encoding?.[channel]) throw new Error(`Pie does not support the ${channel} channel.`);
    }
    if (spec.innerRadius != null && (!Number.isFinite(spec.innerRadius) || spec.innerRadius < 0 || spec.innerRadius >= 1)) throw new Error('Pie innerRadius must be a fraction from 0 (inclusive) to 1 (exclusive).');
    if (spec.labels != null && !['inside', 'outside', 'none'].includes(spec.labels)) throw new Error('Unsupported Pie label position.');
    const angle = spec.encoding?.angle;
    if (angle?.scale || angle?.domain || angle?.range) throw new Error('Pie angle values do not support scales, domains or ranges.');
    if (specState(spec).axis) throw new Error('Pie Cartesian axes are unsupported.');
    if (viewSelection(spec)?.mode === 'focus') throw new Error('Pie focus cameras are unsupported.');
    return spec;
  },
  warnings: chartWarnings,
  createRenderer: createPieRenderer
});
