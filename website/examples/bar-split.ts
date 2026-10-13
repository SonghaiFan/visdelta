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

const detailed = bar(sales)
  .x('region', { label: 'Region' })
  .y('revenue', { label: 'Revenue ($k)' })
  .key(['region', 'channel'])
  .breakdown('channel')
  .color('channel');

export const from = detailed.rollup();
export const to = detailed;
