import { bar } from 'visdelta/bar';

const cities = [
  { city: 'Oslo', continent: 'Europe', visitors: 31 },
  { city: 'Lima', continent: 'Americas', visitors: 44 },
  { city: 'Quito', continent: 'Americas', visitors: 18 },
  { city: 'Seoul', continent: 'Asia', visitors: 52 },
  { city: 'Accra', continent: 'Africa', visitors: 23 },
  { city: 'Porto', continent: 'Europe', visitors: 37 },
];

export const from = bar(cities)
  .x('city', { label: 'City' })
  .y('visitors', { label: 'Visitors (thousands)' });

// Colour is never inferred: binding a field is an explicit Encoding change.
export const to = from.color('continent');
