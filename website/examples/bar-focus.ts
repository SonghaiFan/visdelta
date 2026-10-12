import { bar } from 'visdelta/bar';

const cities = [
  { city: 'Oslo', visitors: 31 },
  { city: 'Lima', visitors: 44 },
  { city: 'Quito', visitors: 18 },
  { city: 'Seoul', visitors: 52 },
  { city: 'Accra', visitors: 23 },
  { city: 'Porto', visitors: 37 },
];

export const from = bar(cities)
  .x('city', { title: 'City' })
  .y('visitors', { title: 'Visitors (thousands)' });

// Every bar stays; only the camera moves.
export const to = from.focus({ city: ['Quito', 'Accra'] });
