import { bar } from 'visdelta/bar';

const sales = [
  { region: 'North', channel: 'Online', revenue: 42 },
  { region: 'North', channel: 'Retail', revenue: 31 },
  { region: 'South', channel: 'Online', revenue: 28 },
  { region: 'South', channel: 'Retail', revenue: 36 },
  { region: 'East', channel: 'Online', revenue: 39 },
  { region: 'East', channel: 'Retail', revenue: 22 },
  { region: 'West', channel: 'Online', revenue: 47 },
  { region: 'West', channel: 'Retail', revenue: 26 },
];

export const from = bar(sales)
  .x('region', { title: 'Region' })
  .y('revenue', { title: 'Revenue ($k)' })
  .key(['region', 'channel'])
  .breakdown('channel')
  .color('channel');

// Stacked segments move onto their own panel baselines.
export const to = from.repeat('channel', { direction: 'y', scales: 'shared' });
