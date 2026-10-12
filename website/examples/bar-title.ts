import { bar } from 'visdelta/bar';

const cities = [
  { city: 'Oslo', visitors: 31 },
  { city: 'Lima', visitors: 44 },
  { city: 'Quito', visitors: 18 },
  { city: 'Seoul', visitors: 52 },
  { city: 'Accra', visitors: 23 },
  { city: 'Porto', visitors: 37 },
];

const chart = bar(cities)
  .x('city', { title: 'City' })
  .y('visitors', { title: 'Visitors (thousands)' });

export const from = chart.title('Visitors in March');
export const to = chart.title('Visitors in April').subtitle('Provisional counts, thousands');
