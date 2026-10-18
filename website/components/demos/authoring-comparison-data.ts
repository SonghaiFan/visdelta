import { bar } from 'visdelta/bar';

export const sales = [
  { category: 'A', value: 12 },
  { category: 'B', value: 28 },
  { category: 'C', value: 19 },
];

export const data = { sales };
export const chart = bar({ name: 'sales' }).x('category').y('value');
