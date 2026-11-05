// Runs before `dev`, `build` and type checks. The site renders the library's
// built output, so fail early with a clear message when it is missing.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
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

// The browser and local MCP service report the same build, without vendor snapshots.
const manifest=JSON.parse(readFileSync(new URL('../../dist/docs/index.json',import.meta.url),'utf8'));
writeFileSync(new URL('../lib/visdelta-build.json',import.meta.url),JSON.stringify({version:manifest.packageVersion,buildSha256:manifest.buildSha256})+'\n');

// The playground and gallery load the repository's bundled demo datasets.
// They stay in root data/ (shared with library checks); copy them into the
// site's public folder so the export serves them under <base>/data/.
const dataSource = fileURLToPath(new URL('../../data/', import.meta.url));
const dataTarget = fileURLToPath(new URL('../public/data/', import.meta.url));
mkdirSync(dataTarget, { recursive: true });
cpSync(dataSource, dataTarget, { recursive: true, filter: (path) => !path.endsWith('README.md') });

// Copy standalone story sites without rewriting their source.
const storySource = fileURLToPath(new URL('../../examples/story/', import.meta.url));
const storyTarget = fileURLToPath(new URL('../public/story/examples/', import.meta.url));
mkdirSync(storyTarget, {recursive:true});
cpSync(storySource, storyTarget, {recursive:true,filter:path=>!path.endsWith('archive.json')});
const buildStory = spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/build-story.mjs',import.meta.url))],{stdio:'inherit'});
if(buildStory.status!==0) process.exit(buildStory.status??1);

const verify = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-examples.mjs', import.meta.url))], {
  stdio: 'inherit',
});
if (verify.status !== 0) process.exit(verify.status ?? 1);
