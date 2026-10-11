// Runs before `dev`, `build` and type checks. The site renders the library's
// built output, so fail early with a clear message when it is missing.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/visdelta.esm.js', import.meta.url));
if (!existsSync(dist)) {
  console.error('VisDelta has not been built. Run `npm ci && npm run build` in the repository root first.');
  process.exit(1);
}

const verify = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-examples.mjs', import.meta.url))], {
  stdio: 'inherit',
});
if (verify.status !== 0) process.exit(verify.status ?? 1);
