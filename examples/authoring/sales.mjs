import { bar } from 'visdelta';

// A minimal native chart declaration, safe to import while compiling MDX.
// Unique regions give this example an inferred mark key; no extra ID needed.
export const sales = [
  { region: 'North', revenue: 18 },
  { region: 'South', revenue: 12 },
  { region: 'West', revenue: 9 },
];

export const chart = bar(sales).x('region').y('revenue');
