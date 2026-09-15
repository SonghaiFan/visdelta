import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv' };

// The ESM build imports D3 submodules. Browser fixtures load D3's UMD bundle
// once, then map each bare submodule to a virtual module exporting that
// submodule's public names from the same global D3 object.
const shims = new Map();
for (const name of [
  'd3-array', 'd3-axis', 'd3-color', 'd3-dsv', 'd3-ease', 'd3-fetch',
  'd3-force', 'd3-format', 'd3-interpolate', 'd3-scale', 'd3-selection',
  'd3-shape', 'd3-timer'
]) {
  const names = Object.keys(await import(name)).filter((key) => key !== 'default');
  shims.set(`/tests/fixtures/${name}-global.js`,
    'const lib = globalThis.d3;\n' + names.map((key) => `export const ${key} = lib.${key};`).join('\n') + '\n');
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (shims.has(pathname)) {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end(shims.get(pathname));
      return;
    }
    let path = resolve(root, '.' + pathname);
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end('Not found'); }
// VISDELTA_TEST_PORT pins the Playwright server; PORT lets a preview host assign one.
}).listen(Number(process.env.VISDELTA_TEST_PORT || process.env.PORT || 5511), '127.0.0.1');
