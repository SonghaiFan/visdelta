import { pie } from 'visdelta/pie';

const budget = [
  { item: 'Housing', amount: 42 },
  { item: 'Food', amount: 21 },
  { item: 'Transport', amount: 14 },
  { item: 'Other', amount: 23 },
];

export const from = pie(budget)
  .value('amount')
  .color('item')
  .key('item')
  .label('item');

// Appearance only: the hole is a fraction of the outer radius.
export const to = from.innerRadius(0.6);
