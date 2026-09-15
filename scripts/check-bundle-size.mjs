import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cases = [
  {
    name: 'core delta',
    source: 'import { delta } from "./src/core.ts"; globalThis.__visDeltaBundle = { delta };'
  },
  {
    name: 'area authoring',
    source: 'import { area } from "./src/area.ts"; globalThis.__visDeltaBundle = { area };'
  },
  {
    name: 'bar authoring',
    source: 'import { bar } from "./src/bar.ts"; globalThis.__visDeltaBundle = { bar };'
  },
  {
    name: 'point authoring',
    source: 'import { point } from "./src/point.ts"; globalThis.__visDeltaBundle = { point };'
  },
  {
    name: 'line authoring',
    source: 'import { line } from "./src/line.ts"; globalThis.__visDeltaBundle = { line };'
  },
  {
    name: 'unit authoring',
    source: 'import { unit } from "./src/unit.ts"; globalThis.__visDeltaBundle = { unit };'
  }
];

for (const entry of cases) {
  const result = await esbuild.build({
    absWorkingDir: root,
    bundle: true, splitting: true, format: 'esm',
    legalComments: 'none',
    minify: true,
    platform: 'browser',
    stdin: { contents: entry.source, loader: 'ts', resolveDir: root },
    target: 'es2020',
    treeShaking: true,
    outdir: 'authoring-audit',
    metafile: true,
    write: false
  });
  const outputs = result.metafile.outputs;
  const entryPath = Object.keys(outputs).find(path => outputs[path].entryPoint === '<stdin>');
  if (!entryPath) throw new Error(`Missing ${entry.name} entry output.`);
  const loaded = new Set();
  function includeAuthoring(path) {
    if (loaded.has(path)) return;
    loaded.add(path);
    for (const dependency of outputs[path].imports) {
      if (!dependency.external && dependency.kind !== 'dynamic-import') includeAuthoring(dependency.path);
    }
  }
  includeAuthoring(entryPath);
  const files = new Map(result.outputFiles.map(file => [file.path, file.contents]));
  let bytes = 0;
  let gzipBytes = 0;
  for (const path of loaded) {
    const output = files.get(resolve(root, path));
    bytes += output.byteLength;
    gzipBytes += gzipSync(output).byteLength;
  }
  console.log(`${entry.name}: ${bytes} bytes, ${gzipBytes} bytes gzip.`);
}

// Count the entry and all static dependencies required by the selected lazy
// chart type. Measuring only stdin.js would hide shared/deferred download costs.
const split = await esbuild.build({
  absWorkingDir: root,
  stdin: {
    contents: 'import { bar } from "./src/bar.ts"; import { transition } from "./src/transition-entry.ts"; globalThis.__visDeltaBundle = { bar, transition };',
    loader: 'ts', resolveDir: root
  },
  bundle: true, splitting: true, format: 'esm', platform: 'browser',
  minify: true, legalComments: 'none', target: 'es2020', treeShaking: true,
  outdir: 'bundle-audit', metafile: true, write: false
});
const outputs = split.metafile.outputs;
const loaded = new Set();
function include(path) {
  if (loaded.has(path)) return;
  loaded.add(path);
  for (const dependency of outputs[path].imports) {
    if (!dependency.external && dependency.kind !== 'dynamic-import') include(dependency.path);
  }
}
for (const [path, output] of Object.entries(outputs)) {
  if (output.entryPoint === '<stdin>' || output.entryPoint === 'src/charts/bar/plugin.ts') include(path);
}
if (!loaded.size) throw new Error('Missing selected transition output.');
const files = new Map(split.outputFiles.map(file => [file.path, file.contents]));
let gzipBytes = 0;
const maxSelectedTransitionGzipBytes = 90_000;
for (const path of loaded) {
  gzipBytes += gzipSync(files.get(resolve(root, path))).byteLength;
  for (const source of Object.keys(outputs[path].inputs)) {
    if (/src\/charts\/(line|point|unit)\//.test(source)) {
      throw new Error(`Focused bar transition pulled in unrelated code: ${source}`);
    }
  }
}
if (gzipBytes > maxSelectedTransitionGzipBytes) {
  throw new Error(`Selected bar transition grew to ${gzipBytes} bytes gzip; limit is ${maxSelectedTransitionGzipBytes}.`);
}
// Includes seekable semantic bar splits plus the chart-owned responsive axis,
// title, number-format retention, legend, axis-system timing, and the shared
// field-type detection plus the chart-agnostic 2D camera used by focus.
console.log(`bar + transition (entry, shared chunks, bar plugin): ${gzipBytes} bytes gzip (includes VisDelta's D3 runtime, excludes CSS).`);
