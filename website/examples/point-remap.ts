import { point } from 'visdelta/point';

const cars = [
  { name: 'Civic', weight: 2.6, mpg: 33, horsepower: 158 },
  { name: 'Corolla', weight: 2.9, mpg: 34, horsepower: 169 },
  { name: 'Mustang', weight: 3.8, mpg: 21, horsepower: 315 },
  { name: 'Camry', weight: 3.3, mpg: 32, horsepower: 203 },
  { name: 'F-150', weight: 4.7, mpg: 20, horsepower: 290 },
  { name: 'Miata', weight: 2.3, mpg: 30, horsepower: 181 },
  { name: 'Tahoe', weight: 5.6, mpg: 17, horsepower: 355 },
  { name: 'Leaf', weight: 3.5, mpg: 111, horsepower: 147 },
];

export const from = point(cars)
  .x('weight', { label: 'Weight (1000 lb)' })
  .y('mpg', { label: 'Miles per gallon' })
  .key('name');

// Every car keeps its identity while the y mapping changes.
export const to = from.y('horsepower', { label: 'Horsepower' });
