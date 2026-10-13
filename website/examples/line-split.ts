import { line } from 'visdelta/line';

const prices = [
  { date: '2026-01-05', ticker: 'NOVA', close: 41 },
  { date: '2026-01-12', ticker: 'NOVA', close: 44 },
  { date: '2026-01-19', ticker: 'NOVA', close: 43 },
  { date: '2026-01-26', ticker: 'NOVA', close: 48 },
  { date: '2026-02-02', ticker: 'NOVA', close: 52 },
  { date: '2026-02-09', ticker: 'NOVA', close: 50 },
  { date: '2026-01-05', ticker: 'ORBIT', close: 33 },
  { date: '2026-01-12', ticker: 'ORBIT', close: 31 },
  { date: '2026-01-19', ticker: 'ORBIT', close: 35 },
  { date: '2026-01-26', ticker: 'ORBIT', close: 34 },
  { date: '2026-02-02', ticker: 'ORBIT', close: 30 },
  { date: '2026-02-09', ticker: 'ORBIT', close: 36 },
];

const detailed = line(prices)
  .x('date', { type: 'temporal', label: 'Week' })
  .y('close', { label: 'Close (USD)' })
  .key(['date', 'ticker'])
  .breakdown('ticker')
  .color('ticker');

// One mean line splits into one line per ticker.
export const from = detailed.rollup({ op: 'mean' });
export const to = detailed;
