import { bar } from 'visdelta/bar';

const products = [
  { product: 'Hardware', revenue: 12, profit: 5 },
  { product: 'Software', revenue: 18, profit: 11 },
  { product: 'Services', revenue: 9, profit: 7 },
  { product: 'Support', revenue: 6, profit: 4 },
];

export const from = bar(products)
  .x('product', { title: 'Product line' })
  .y('revenue', { title: 'Revenue ($M)' });

export const to = from.y('profit', { title: 'Profit ($M)' });
