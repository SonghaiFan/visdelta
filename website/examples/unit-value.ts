import { unit } from 'visdelta/unit';

const visits = [
  { clinic: 'North', patients: 24 },
  { clinic: 'South', patients: 16 },
  { clinic: 'East', patients: 12 },
];

const detailed = unit(visits)
  .value('patients', { unitValue: 1 })
  .key('clinic')
  .group('clinic')
  .layout('bar', { columns: 4, radius: 7 })
  .color('clinic');

// Each coarse circle (four patients) splits into the circles it represents.
export const from = detailed.value('patients', { unitValue: 4 });
export const to = detailed;
