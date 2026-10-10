import { chartWarnings } from './warnings.js';
import { defineChartType } from '../plugin.js';
import { createBarChart } from './chart.js';
import type { ChartPlugin } from '../../types/index.js';
import type { BarSpec } from './chart.js';
import { barPresentation } from './style.js';

import { createBarSpecCompiler } from './compile.js';
import { createBarGrainDeclarationOperationCodec } from './declaration-operations.js';

export const plugin: ChartPlugin<BarSpec> = defineChartType<BarSpec>({
  key: 'bar',
  warnings: chartWarnings,
  declarationPlanning: true,
  declarationPlanningOrder: 'before-chart',
  transitionEvaluation: 'cached',
  transition: {
    declarationOperations: createBarGrainDeclarationOperationCodec()
  },
  scenes: ['selection', 'axis', 'detail', 'mapping'],
  presentation: barPresentation,
  createChart: createBarChart,
  createSpecCompiler: createBarSpecCompiler
});
