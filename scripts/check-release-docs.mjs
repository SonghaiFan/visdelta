import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
  throw new Error('Package and lockfile release versions disagree.');
}
const files = ['README.md', 'llms.txt', 'index.html', ...await walk('docs'), ...await walk('examples')];
let urls = 0;
for (const file of files) {
  const source = await readFile(join(root, file), 'utf8');
  for (const match of source.matchAll(/https:\/\/cdn\.jsdelivr\.net\/(?:npm\/visdelta|gh\/SonghaiFan\/visdelta)@(\d+\.\d+\.\d+(?:-[\w.-]+)?)([^\s"'`<>)]*)/g)) {
    const [, version, path] = match;
    if (version !== pkg.version) throw new Error(`${file}: CDN version ${version} differs from candidate ${pkg.version}.`);
    // A package-root npm URL resolves through the manifest's `jsdelivr`
    // entry. Normalize it to the file it will serve before checking dist.
    const cdnPath = path || `/${pkg.jsdelivr.replace(/^\.\//, '')}`;
    if (!cdnPath.startsWith('/dist/')) throw new Error(`${file}: use the packaged ESM/CSS/global path, not an untested CDN rewrite: ${match[0]}`);
    // jsDelivr's `/+esm` suffix asks the CDN to rewrite a packaged module for
    // direct browser use. It is not part of the file path in the tarball.
    const packagedPath = cdnPath.endsWith('/+esm') ? cdnPath.slice(0, -'/+esm'.length) : cdnPath;
    const target = resolve(root, packagedPath.slice(1));
    if (!target.startsWith(resolve(root, 'dist') + sep) || !(await stat(target).catch(() => null))?.isFile()) {
      throw new Error(`${file}: CDN target is missing from dist: ${path}`);
    }
    urls++;
  }
  if (!file.endsWith('.md')) continue;
  // Check relative documentation/example links. Anchors and external links have
  // separate semantics; do not pretend an existence check validates those.
  for (const [, target] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
    // Root-relative routes belong to the VitePress site and its build-time
    // dead-link validator. This checker owns repository-relative files.
    if (/^(?:https?:|#|\/|mailto:|codex:)/.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    const base = resolve(root, file, '..');
    if (!await stat(resolve(base, path)).catch(() => null)) throw new Error(`${file}: missing local link target ${target}`);
  }
}
if (!urls) throw new Error('No versioned CDN examples were checked.');
console.log(`Release docs: ${pkg.version}, ${urls} CDN references match packaged files; local links resolve.`);

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    // VitePress source and generated bundles are checked by `vitepress build`.
    // Do not re-parse compiled, HTML-escaped code examples as authored docs.
    if (entry.isDirectory() && entry.name === '.vitepress') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(md|html|js|txt)$/.test(path)) files.push(path);
  }
  return files;
}
