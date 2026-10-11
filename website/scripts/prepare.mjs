// Runs before `dev`, `build` and type checks. The site renders the library's
// built output, so fail early with a clear message when it is missing.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/visdelta.esm.js', import.meta.url));
if (!existsSync(dist)) {
  console.error('VisDelta has not been built. Run `npm ci && npm run build` in the repository root first.');
  process.exit(1);
}

// The playground and gallery load the repository's bundled demo datasets.
// They stay in docs/public/data (shared with library tests); copy them into
// the site's public folder so the export serves them under <base>/data/.
const dataSource = fileURLToPath(new URL('../../docs/public/data/', import.meta.url));
const dataTarget = fileURLToPath(new URL('../public/data/', import.meta.url));
mkdirSync(dataTarget, { recursive: true });
cpSync(dataSource, dataTarget, { recursive: true, filter: (path) => !path.endsWith('README.md') });

const verify = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-examples.mjs', import.meta.url))], {
  stdio: 'inherit',
});
if (verify.status !== 0) process.exit(verify.status ?? 1);
