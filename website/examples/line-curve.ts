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

const base = line(readings)
  .x('day', { type: 'temporal', label: 'Day' })
  .y('temperature', { label: 'Temperature (°C)' });

export const from = base.curve('curveLinear').strokeWidth(2).pointSize(3);
export const to = base.curve('curveStep').strokeWidth(4).pointSize(5);
