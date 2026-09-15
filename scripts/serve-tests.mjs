import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv' };

// The ESM build imports bare "d3" and "arquero". Fixtures load both as globals
// from their minified UMD bundles, so an import map points the bare names at
// these virtual modules, which re-export every member of the global.
const shims = new Map();
for (const [name, global] of [['d3', 'd3'], ['arquero', 'aq']]) {
  const names = Object.keys(await import(name)).filter((key) => key !== 'default');
  shims.set(`/tests/fixtures/${name}-global.js`,
    `const lib = globalThis.${global};\n` + names.map((key) => `export const ${key} = lib.${key};`).join('\n') + '\n');
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
}).listen(Number(process.env.VISDELTA_TEST_PORT || 5511), '127.0.0.1');
