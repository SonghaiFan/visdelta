import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Chart } from '../../dist/react.js';
import { bar, barModule } from '../../dist/bar.js';

import { parseSpec, stringifySpec } from '../../dist/core.js';
import { registerChartModule } from '../../dist/visdelta.esm.js';

const rows = [{ category: 'A', value: 2, next: 8 }, { category: 'B', value: 6, next: 3 }];
const a = bar(rows).x('category').y('value');
const b = a.y('next');
const c = b.sort('next', 'descending');
const states = [a, b, c];
const jsonStates = states.map(state => parseSpec(stringifySpec(state)));
const jsonChoices = Object.fromEntries(['a', 'b', 'c'].map((key, index) => [key, jsonStates[index]]));
const root = createRoot(document.getElementById('root'));
const controllers = [];
const stats = { ready: 0, cleaned: 0, destroyed: 0, errors: [] };
const releases = [];
const delayed = {
  toSpec: () => b.toSpec(),
  chartModule: () => ({ key: 'bar', load: () => new Promise(resolve => { releases.push(() => barModule.load().then(resolve)); }) }),
};
const failed = { toSpec: () => b.toSpec(), chartModule: () => ({ key: 'bar', load: async () => { throw new Error('Deliberate load failure'); } }) };
const choices = { a, b, c, delayed, failed, single: [a], empty: [] };
const sources = Object.fromEntries([['delayed', delayed], ['failed', failed]].map(([name, state]) => [name, { toSpec: () => a.toSpec(), chartModule: state.chartModule }]));
const pairs = Object.fromEntries(Object.entries(choices).map(([key, target]) => [key, [sources[key] ?? a, target]]));
pairs.json = jsonStates.slice(0, 2);
window.fixture = {
  stats, controllers,
  release: () => Promise.all(releases.splice(0).map(release => release())),
  render(kind = 'Transition', options = {}) {
    const { state = 'a', to = 'b', json = false, ...props } = options;
    if (json) registerChartModule(barModule);
    const selected = json ? jsonChoices : choices;
    const common = {
      height: 240,
      ...props,
      onReady(controller) {
        stats.ready++;
        controllers.push(controller);
        const destroy = controller.destroy.bind(controller);
        controller.destroy = () => { stats.destroyed++; destroy(); };
        return () => { stats.cleaned++; };
      },
      onError(error) { stats.errors.push(error.message); },
    };
    const input = kind === 'Chart' ? selected[state]
      : kind === 'Sequence' ? (json ? jsonStates : states)
      : pairs[json ? 'json' : to];
    const element = React.createElement(Chart, { ...common, state: input });
    root.render(React.createElement(StrictMode, null, element));
  },
  clear() { root.render(null); },
};
