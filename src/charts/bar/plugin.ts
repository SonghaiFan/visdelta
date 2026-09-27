import { defineChartType } from '../plugin.js';
import { createBarChart } from './chart.js';
import type { ChartPlugin } from '../../types/index.js';
import type { BarSpec } from './chart.js';
import { barPresentation } from './style.js';

// createBarSpecCompiler is still in compile.js (not yet migrated)
import { createBarSpecCompiler } from './compile.js';

export const plugin: ChartPlugin<BarSpec> = defineChartType<BarSpec>({
  key: 'bar',
  transitionEvaluation: 'cached',
  scenes: ['selection', 'axis', 'detail', 'mapping'],
  presentation: barPresentation,
  createChart: createBarChart,
  createSpecCompiler: createBarSpecCompiler
});
