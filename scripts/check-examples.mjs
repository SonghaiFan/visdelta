import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDir = join(root, 'examples');
const labs = await discoverLabs(examplesDir);
assertLab(labs.get('bar'), 'bar', 14);
assertLab(labs.get('point'), 'point', 13);
assertLab(labs.get('line'), 'line', 16);
assertLab(labs.get('area'), 'area', 14);
assertLab(labs.get('unit'), 'unit', 14);

console.log('Area, bar, line, point, and unit example invariants ok.');

async function discoverLabs(directory) {
  const labs = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(directory, entry.name, 'scenarios.js');
    const info = await stat(source).catch(() => null);
    if (!info?.isFile()) continue;
    const module = await import(pathToFileURL(source).href);
    if (!module.chart || !Array.isArray(module.scenarios) || typeof module.loadChart !== 'function') {
      throw new Error(`${entry.name}/scenarios.js must export chart, scenarios, and loadChart().`);
    }
    if (labs.has(module.chart)) throw new Error(`Duplicate Lab chart key: ${module.chart}`);
    labs.set(module.chart, module);
  }
  return labs;
}

function assertLab(module, chart, expectedCount) {
  if (!module) throw new Error(`${chart} Lab scenario module is missing.`);
  const scenarios = module.scenarios;
  if (scenarios.length !== expectedCount) {
    throw new Error(`${chart} Lab must expose ${expectedCount} scenarios; found ${scenarios.length}.`);
  }
  const ids = new Set(scenarios.map(scenario => scenario.id));
  if (ids.size !== scenarios.length) throw new Error(`${chart} Lab scenario ids must be unique.`);
  for (const scenario of scenarios) {
    if (!scenario.label || !scenario.description || !scenario.code.includes('return { from, to };')) {
      throw new Error(`${chart} Lab scenario is incomplete: ${scenario.id || '(missing id)'}`);
    }
  }
}
