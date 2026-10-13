import { unit } from 'visdelta/unit';

const species = ['setosa', 'versicolor', 'virginica'];
const flowers = Array.from({ length: 45 }, (_, index) => ({
  id: `flower-${index + 1}`,
  species: species[index % 3],
}));

export const from = unit(flowers)
  .key('id')
  .color('species')
  .size(7)
  .layout('grid', { columns: 9 });

// The same keyed units regroup into one stack per species.
export const to = from.group('species').layout('bar', { columns: 5 });
