import { commonEditMethods } from '../common-edit-methods.js';
import { defineChartModule } from '../module.js';
import type { PieViewState } from './authoring.js';
export const chartModule = defineChartModule<PieViewState>({
  key: 'pie',
  editMethods: commonEditMethods,
  edit: async (spec, calls, resolved) => (await import('../common-edits.js')).editCommon(spec, calls, resolved),
  load: () => import('./plugin.js'),
});
