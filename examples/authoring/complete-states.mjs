import { bar, pie, line, area, point, unit } from 'visdelta';

// Fictional fixture: four products, one additive measure. Never add profit to revenue.
export const sales = [
  { product: 'Atlas', revenue: 18, profit: 4 },
  { product: 'Birch', revenue: 12, profit: 3 },
  { product: 'Cedar', revenue: 9, profit: 2 },
  { product: 'Dune', revenue: 6, profit: 1 },
];
const data = { name: 'sales' };
export const states = {
  bar: bar(data).x('product').y('revenue').key('product'),
  pie: pie(data).value('revenue').label('product').key('product').color({ field: 'product', type: 'nominal' }),
  // These connect ordered categories, not dates or a causal trend.
  line: line(data).x('product').y('revenue').key('product'),
  area: area(data).x('product').y('revenue').key('product'),
  point: point(data).x('revenue').y('profit').key('product'),
  unit: unit(data).value('revenue').key('product').layout('grid'),

};
export const specs = Object.fromEntries(Object.entries(states).map(([name, state]) => [name, state.toSpec()]));
