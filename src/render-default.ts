import { createRenderer } from './render.js';
import { builtInChartModules } from './charts/builtins.js';

/** JSON-first convenience renderer with lazily loaded built-in chart modules. */
export const render = createRenderer({ modules: builtInChartModules }).render;
