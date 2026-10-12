/**
 * Metadata for every live example. Each `id` names a module in this folder
 * that exports `from` and `to` (a pair) or `states` (a sequence). The module
 * source is what the docs display, so the code a reader copies is exactly the
 * code that rendered the chart.
 *
 * `category` is the example's primary teaching category. It must appear in the
 * state changes that `delta()` reports; `scripts/verify-examples.mjs` checks it.
 */

export type StateChangeCategory =
  | 'data'
  | 'grain'
  | 'encoding'
  | 'coordinate'
  | 'layout'
  | 'attention'
  | 'appearance';

export type ChartType = 'bar' | 'line' | 'area' | 'point' | 'unit' | 'pie';

export interface ExampleMeta {
  id: string;
  title: string;
  description: string;
  chart: ChartType;
  category: StateChangeCategory;
  /** Canvas height in pixels. */
  height?: number;
}

export const categories: { id: StateChangeCategory; label: string; summary: string }[] = [
  { id: 'data', label: 'Data', summary: 'Source records enter, leave or change value.' },
  { id: 'grain', label: 'Grain', summary: 'Grouping or measure semantics change: split, merge, reaggregate.' },
  { id: 'encoding', label: 'Encoding', summary: 'A data field is bound, unbound or remapped to a channel.' },
  { id: 'coordinate', label: 'Coordinate', summary: 'A positional scale, domain or orientation changes.' },
  { id: 'layout', label: 'Layout', summary: 'The same objects are reordered, rearranged or reconnected.' },
  { id: 'attention', label: 'Attention', summary: 'Focus moves the camera or highlight changes emphasis.' },
  { id: 'appearance', label: 'Appearance', summary: 'Fixed styling or form changes without binding a field.' },
];

export const registry: ExampleMeta[] = [
  { id: 'bar-filter', chart: 'bar', category: 'data', title: 'Filter rows', description: 'where() keeps matching rows. Exiting bars leave before the scale settles.' },
  { id: 'line-add', chart: 'line', category: 'data', title: 'Add an observation', description: 'The line extends to the new day before its point appears.' },
  { id: 'bar-split', chart: 'bar', category: 'grain', title: 'Split totals into detail', description: 'Regional totals split into stacked channel segments that preserve each total.' },
  { id: 'bar-grouped-split', chart: 'bar', category: 'grain', title: 'Totals to grouped detail', description: 'Totals split through a stacked stage that preserves each total, then open into groups.' },
  { id: 'line-split', chart: 'line', category: 'grain', title: 'Split a mean into series', description: 'One mean line releases a line per ticker.' },
  { id: 'area-split', chart: 'area', category: 'grain', title: 'Divide a total area', description: 'Internal boundaries appear inside the combined total, then the layers take their colours.' },
  { id: 'unit-value', chart: 'unit', category: 'grain', title: 'Change units per circle', description: 'Each circle that represented four patients splits into the four circles it stood for.' },
  { id: 'bar-remap', chart: 'bar', category: 'encoding', title: 'Remap the y field', description: 'Revenue becomes profit. Marks, scale, ticks and title move together.' },
  { id: 'bar-color', chart: 'bar', category: 'encoding', title: 'Bind colour to a field', description: 'Colour is never inferred; binding continent is an explicit change.' },
  { id: 'point-remap', chart: 'point', category: 'encoding', title: 'Remap a scatterplot axis', description: 'Each keyed car moves from fuel economy to horsepower.' },
  { id: 'bar-flip', chart: 'bar', category: 'coordinate', title: 'Flip orientation', description: 'Vertical bars become horizontal through a coordinate transition.' },
  { id: 'point-log', chart: 'point', category: 'coordinate', title: 'Linear to log scale', description: 'The same field, positioned on a base-2 logarithmic scale.' },
  { id: 'bar-sort', chart: 'bar', category: 'layout', title: 'Sort categories', description: 'The same bars reorder by value; no data changes.' },
  { id: 'bar-layout', chart: 'bar', category: 'layout', title: 'Stacked to grouped', description: 'Segments keep their identity and move side by side.' },
  { id: 'bar-repeat', chart: 'bar', category: 'layout', title: 'Stack to small multiples', description: 'repeat() moves each stacked segment onto its own panel baseline, in staged x and y steps.', height: 400 },
  { id: 'area-stream', chart: 'area', category: 'layout', title: 'Stack to streamgraph', description: 'Layers reorder inside-out around a wiggle baseline.' },
  { id: 'unit-layout', chart: 'unit', category: 'layout', title: 'Grid to unit bars', description: 'Keyed units regroup into one stack per species.' },
  { id: 'bar-highlight', chart: 'bar', category: 'attention', title: 'Highlight categories', description: 'All bars remain; non-matching bars dim.' },
  { id: 'bar-focus', chart: 'bar', category: 'attention', title: 'Focus the camera', description: 'focus() pans and zooms around two bars without filtering any data.' },
  { id: 'line-curve', chart: 'line', category: 'appearance', title: 'Change curve and weight', description: 'An exact D3 curve name, line width and point size change together.' },
  { id: 'bar-title', chart: 'bar', category: 'appearance', title: 'Change the title', description: 'The title and subtitle sit above the canvas; the old text fades out, the new text fades in, and the chart does not move.' },
  { id: 'pie-donut', chart: 'pie', category: 'appearance', title: 'Pie to donut', description: 'innerRadius() opens a hole as a fraction of the outer radius.' },
  { id: 'bar-story', chart: 'bar', category: 'layout', title: 'A four-state story', description: 'sequence() joins revenue → profit → ranked → highlighted into one timeline.' },
];

export function getExample(id: string): ExampleMeta {
  const example = registry.find((entry) => entry.id === id);
  if (!example) throw new Error(`Unknown live example "${id}".`);
  return example;
}
