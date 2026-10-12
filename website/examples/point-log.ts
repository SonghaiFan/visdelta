import { point } from 'visdelta/point';

const cars = [
  { name: 'Civic', weight: 2.6, mpg: 33 },
  { name: 'Corolla', weight: 2.9, mpg: 34 },
  { name: 'Mustang', weight: 3.8, mpg: 21 },
  { name: 'Camry', weight: 3.3, mpg: 32 },
  { name: 'F-150', weight: 4.7, mpg: 20 },
  { name: 'Miata', weight: 2.3, mpg: 30 },
  { name: 'Tahoe', weight: 5.6, mpg: 17 },
  { name: 'Leaf', weight: 3.5, mpg: 111 },
];

export const from = point(cars)
  .x('weight', { title: 'Weight (1000 lb)' })
  .y('mpg', { title: 'Miles per gallon' })
  .key('name');

// Same field, new positional scale: a Coordinate change.
export const to = from.y('mpg', {
  title: 'Miles per gallon (log₂)',
  scale: { type: 'log', base: 2 },
});
