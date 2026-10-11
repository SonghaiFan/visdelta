import { area } from 'visdelta/area';

const listeners = [
  { month: '2026-01-01', genre: 'Jazz', hours: 12 },
  { month: '2026-02-01', genre: 'Jazz', hours: 15 },
  { month: '2026-03-01', genre: 'Jazz', hours: 14 },
  { month: '2026-04-01', genre: 'Jazz', hours: 18 },
  { month: '2026-05-01', genre: 'Jazz', hours: 16 },
  { month: '2026-01-01', genre: 'Folk', hours: 8 },
  { month: '2026-02-01', genre: 'Folk', hours: 11 },
  { month: '2026-03-01', genre: 'Folk', hours: 16 },
  { month: '2026-04-01', genre: 'Folk', hours: 13 },
  { month: '2026-05-01', genre: 'Folk', hours: 10 },
  { month: '2026-01-01', genre: 'Ambient', hours: 5 },
  { month: '2026-02-01', genre: 'Ambient', hours: 7 },
  { month: '2026-03-01', genre: 'Ambient', hours: 6 },
  { month: '2026-04-01', genre: 'Ambient', hours: 9 },
  { month: '2026-05-01', genre: 'Ambient', hours: 12 },
];

const detailed = area(listeners)
  .x('month', { type: 'temporal', title: 'Month' })
  .y('hours', { title: 'Listening hours' })
  .key(['month', 'genre'])
  .breakdown('genre')
  .color('genre');

// The combined total divides into its stacked layers.
export const from = detailed.rollup({ op: 'sum' });
export const to = detailed;
