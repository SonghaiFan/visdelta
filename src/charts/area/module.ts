import { commonEditMethods } from '../common-edit-methods.js';
import { defineChartModule } from '../module.js';
import type { AreaViewState } from './authoring.js';

export const chartModule = defineChartModule<AreaViewState>({
  key: 'area',
  editMethods: commonEditMethods,
  edit: async (spec, calls, resolved) => (await import('../common-edits.js')).editCommon(spec, calls, resolved),
  load: () => import('./plugin.js')
});
