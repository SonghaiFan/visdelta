import { bar } from 'visdelta/bar';

export const rows = [
  { measure: 'revenue', product: 'Atlas', amount: 84 },
  { measure: 'revenue', product: 'Beacon', amount: 62 },
  { measure: 'revenue', product: 'Comet', amount: 96 },
  { measure: 'revenue', product: 'Drift', amount: 48 }
];
const base = bar(rows).x('measure').y('amount', { label: 'Revenue ($k)' })
  .breakdown('product').color('product');
export const layouts = {
  verticalStacked: base,
  horizontalStacked: base.flip(),
  verticalGrouped: base.layout('grouped'),
  horizontalGrouped: base.layout('grouped').flip()
};
