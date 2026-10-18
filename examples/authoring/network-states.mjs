import { line } from 'visdelta';

// This module is safe to import while compiling MDX: no DOM or rendering.
// Fictional weekly journeys; these dates represent local calendar days.
export const rows = [
  { id: 'n1', date: new Date(2026, 0, 1), route: 'North', journeys: 18 },
  { id: 'n2', date: new Date(2026, 0, 8), route: 'North', journeys: 38 },
  { id: 's1', date: new Date(2026, 0, 1), route: 'South', journeys: 12 },
  { id: 's2', date: new Date(2026, 0, 8), route: 'South', journeys: 26 },
];

const all = line(rows)
  .datumKey('id')
  .x('date', { type: 'temporal', label: 'Week' })
  .y('journeys', { domain: [0, 40], label: 'Weekly journeys (thousands)' })
  .key(['date', 'route'])
  .breakdown('route')
  .color('route');

export const network = Object.freeze({
  overview: all,
  north: all.highlight({ route: 'North' }),
});

// Low-level sequence fixture. MDX authors attach network.overview/north directly
// to each Step's chart property; the application collects that authored order.
export const states = Object.freeze([network.overview, network.north, network.overview]);
