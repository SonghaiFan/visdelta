import { defineChartModule } from '../module.js';
import type { PieViewState } from './authoring.js';
export const chartModule = defineChartModule<PieViewState>({ key: 'pie', load: () => import('./plugin.js') });
