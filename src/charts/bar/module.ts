import { defineChartModule } from '../module.js';
import type { BarViewState } from './authoring.js';

export const chartModule = defineChartModule<BarViewState>({
  key: 'bar',
  load: () => import('./plugin.js'),
  edit: async (spec, calls, resolved) => (await import('./edit.js')).editBar(spec, calls, resolved)
});
