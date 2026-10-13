// Runs before `dev`, `build` and type checks. The site renders the library's
// built output, so fail early with a clear message when it is missing.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/visdelta.esm.js', import.meta.url));
if (!existsSync(dist)) {
  console.error('VisDelta has not been built. Run `npm ci && npm run build` in the repository root first.');
  process.exit(1);
}

// A library older than its source misbehaves quietly: the playground asks it for
// options an old build does not know, and `next dev` does no type check to say so.
// After pulling, rebuild the library before starting the site.
const sources = fileURLToPath(new URL('../../src/', import.meta.url));
const newest = (directory) =>
  readdirSync(directory, { withFileTypes: true }).reduce((latest, entry) => {
    const path = `${directory}${entry.name}`;
    return Math.max(latest, entry.isDirectory() ? newest(`${path}/`) : statSync(path).mtimeMs);
  }, 0);
if (!process.env.VISDELTA_ALLOW_STALE_DIST && statSync(dist).mtimeMs < newest(sources)) {
  console.error(
    'The built library in dist/ is older than src/, so the site would run an out-of-date VisDelta.\n' +
      'Run `npm run build` in the repository root first (set VISDELTA_ALLOW_STALE_DIST=1 to skip this check).',
  );
  process.exit(1);
}

// The playground and gallery load the repository's bundled demo datasets.
// They stay in root data/ (shared with library checks); copy them into the
// site's public folder so the export serves them under <base>/data/.
const dataSource = fileURLToPath(new URL('../../data/', import.meta.url));
const dataTarget = fileURLToPath(new URL('../public/data/', import.meta.url));
mkdirSync(dataTarget, { recursive: true });
cpSync(dataSource, dataTarget, { recursive: true, filter: (path) => !path.endsWith('README.md') });

const verify = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-examples.mjs', import.meta.url))], {
  stdio: 'inherit',
});
if (verify.status !== 0) process.exit(verify.status ?? 1);
