// Verifies every live example against the built library: each module must
// export valid states, and the declared category must appear in the
// state changes that delta() actually reports. DOM-free; runs in Node.
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registry } from '../examples/registry.ts';

const { delta } = await import('visdelta/core');
const dir = fileURLToPath(new URL('../examples/', import.meta.url));
const files = (await readdir(dir)).filter((file) => /^[a-z].*\.ts$/.test(file) && !file.startsWith('registry'));
const ids = new Set(registry.map((entry) => entry.id));
const failures = [];

for (const file of files) {
  if (!ids.has(file.replace(/\.ts$/, ''))) failures.push(`${file}: not listed in examples/registry.ts`);
}

for (const entry of registry) {
  try {
    const exampleModule = await import(pathToFileURL(`${dir}${entry.id}.ts`).href);
    const states = exampleModule.states ?? [exampleModule.from, exampleModule.to];
    if (states.length < 2 || states.some((state) => !state?.toSpec)) {
      throw new Error('expected `from` and `to`, or `states`');
    }
    const changes = [];
    for (let index = 0; index < states.length - 1; index += 1) {
      changes.push(...delta(states[index], states[index + 1]).stateChanges);
    }
    const categories = new Set(changes.map((change) => change.category));
    if (!categories.has(entry.category)) {
      throw new Error(`declares ${entry.category} but delta() reports ${[...categories].join(', ') || 'nothing'}`);
    }
    console.log(`ok   ${entry.id.padEnd(16)} ${changes.map((c) => `${c.category}.${c.action}`).join(' ')}`);
  } catch (error) {
    failures.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
  process.exit(1);
}

// The client loader map must name exactly the registered examples.
const { readFile } = await import('node:fs/promises');
const loaderSource = await readFile(new URL('../components/live/loaders.ts', import.meta.url), 'utf8');
const loaderIds = new Set([...loaderSource.matchAll(/'([a-z0-9-]+)': \(\) => import\('@\/examples\/\1'\)/g)].map((match) => match[1]));
const missing = [...ids].filter((id) => !loaderIds.has(id));
const extra = [...loaderIds].filter((id) => !ids.has(id));
if (missing.length || extra.length) {
  console.error(`FAIL components/live/loaders.ts: missing [${missing.join(', ')}], unregistered [${extra.join(', ')}]`);
  process.exit(1);
}
console.log(`Verified ${registry.length} live examples.`);
