// Runs after `next build`. Adds compatibility redirects from the previous
// documentation URLs. Next.js has no redirect support in static exports, so
// each legacy URL becomes a tiny HTML page with a canonical link and redirect.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../out/', import.meta.url));
const basePath = (process.env.DOCS_BASE_PATH ?? '').replace(/\/$/, '');
const siteUrl = (process.env.SITE_URL ?? 'https://songhaifan.github.io/visdelta').replace(/\/$/, '');
const repository = 'https://github.com/SonghaiFan/visdelta';

/** Previous VitePress page → new location (site-relative, or absolute). */
export const legacyRedirects = {
  'overview.html': '/docs/',
  'getting-started.html': '/docs/quick-start/',
  'for-cdn-users.html': '/docs/guides/cdn/',
  'data-sources-and-transforms.html': '/docs/concepts/data-and-transforms/',
  'chart-types.html': '/docs/charts/',
  'repeat.html': '/docs/charts/repeat/',
  'chart-style.html': '/docs/guides/styling/',
  'design-tokens.html': '/docs/guides/styling/',
  'reference.html': '/docs/api/',
  'runtime-api.html': '/docs/api/transition/',
  'language-framework.html': '/docs/concepts/principles/',
  'design-guides.html': '/docs/guides/design-comparisons/',
  'extending-with-plugins.html': '/docs/guides/custom-chart-types/',
  'playground.html': '/playground/',
  'gallery.html': '/gallery/',
  'examples.html': '/playground/',
  'transition-lab.html': '/docs/charts/bar/',
  'line-lab.html': '/docs/charts/line/',
  'area-lab.html': '/docs/charts/area/',
  'point-lab.html': '/docs/charts/point/',
  'unit-lab.html': '/docs/charts/unit/',
  'transition-regression-log.html': `${repository}/blob/main/docs/transition-regression-log.md`,
};

const REDIRECT_MARKER = '<meta name="visdelta-redirect">';

function redirectPage(target) {
  const href = target.startsWith('http') ? target : `${basePath}${target}`;
  const canonical = target.startsWith('http') ? target : `${siteUrl}${target}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<meta name="robots" content="noindex">
${REDIRECT_MARKER}
<link rel="canonical" href="${canonical}">
<meta http-equiv="refresh" content="0; url=${href}">
<script>location.replace(${JSON.stringify(href)} + location.hash);</script>
</head>
<body>
<p>This page has moved to <a href="${href}">${canonical}</a>.</p>
</body>
</html>
`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

for (const [legacy, target] of Object.entries(legacyRedirects)) {
  const file = join(out, legacy);
  // Never replace a real page; rewriting one of our own redirects is fine.
  if (await exists(file) && !(await readFile(file, 'utf8')).includes(REDIRECT_MARKER)) {
    throw new Error(`Legacy redirect would overwrite ${legacy}`);
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, redirectPage(target));
}

// Record the base path this export was built for, so `npm start` and the
// browser tests serve it under the same prefix without extra configuration.
await writeFile(fileURLToPath(new URL('../.next/export-base-path', import.meta.url)), basePath);

console.log(`Postbuild: ${Object.keys(legacyRedirects).length} legacy redirects written (base path "${basePath || '/'}").`);
