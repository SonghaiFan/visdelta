import { commonEditMethods } from '../common-edit-methods.js';
import { defineChartModule } from '../module.js';
import type { UnitViewState } from './authoring.js';

export const chartModule = defineChartModule<UnitViewState>({
  key: 'unit',
  editMethods: commonEditMethods,
  edit: async (spec, calls, resolved) => (await import('../common-edits.js')).editCommon(spec, calls, resolved),
  load: () => import('./plugin.js')
});
