import { line } from 'visdelta/line';

const readings = [
  { day: '2026-03-01', temperature: 7 },
  { day: '2026-03-02', temperature: 11 },
  { day: '2026-03-03', temperature: 9 },
  { day: '2026-03-04', temperature: 14 },
  { day: '2026-03-05', temperature: 12 },
  { day: '2026-03-06', temperature: 16 },
  { day: '2026-03-07', temperature: 13 },
];

const all = line(readings)
  .x('day', { type: 'temporal', label: 'Day' })
  .y('temperature', { label: 'Temperature (°C)' });

// The line extends to the new observation before its point appears.
export const from = all.where({ field: 'day', lt: '2026-03-07' });
export const to = all;
