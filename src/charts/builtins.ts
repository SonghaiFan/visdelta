import type { ChartModule } from './module.js';
// Generated from chart folders containing plugin.ts and module.ts.
// Run scripts/sync-chart-manifest.mjs after adding or removing a chart-type folder.
import { chartModule as area } from "./area/module.js";
import { chartModule as bar } from "./bar/module.js";
import { chartModule as line } from "./line/module.js";
import { chartModule as pie } from "./pie/module.js";
import { chartModule as point } from "./point/module.js";
import { chartModule as unit } from "./unit/module.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builtInChartModules: ChartModule<any>[] = [
  area,
  bar,
  line,
  pie,
  point,
  unit
];
