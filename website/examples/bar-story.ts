import { bar } from 'visdelta/bar';

const products = [
  { product: 'Hardware', revenue: 12, profit: 5 },
  { product: 'Software', revenue: 18, profit: 11 },
  { product: 'Services', revenue: 9, profit: 7 },
  { product: 'Support', revenue: 6, profit: 4 },
];

const revenue = bar(products)
  .x('product', { label: 'Product line' })
  .y('revenue', { label: 'Revenue ($M)' });
const profit = revenue.y('profit', { label: 'Profit ($M)' });
const ranked = profit.sort('profit', 'descending');
const emphasised = ranked.highlight({ product: 'Software' });

// Authored states are fixed boundaries of one seekable timeline.
export const states = [revenue, profit, ranked, emphasised];
