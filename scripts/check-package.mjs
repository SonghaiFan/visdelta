import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8")
);
const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
const publicExports = {
  ".": {
    types: "./dist/index.d.ts",
    import: "./dist/visdelta.esm.js"
  },
  "./browser": {
    types: "./dist/browser.d.ts",
    import: "./dist/visdelta.browser.js"
  },
  "./core": {
    types: "./dist/core.d.ts",
    import: "./dist/core.js"
  },
  "./area": {
    types: "./dist/area.d.ts",
    import: "./dist/area.js"
  },
  "./bar": {
    types: "./dist/bar.d.ts",
    import: "./dist/bar.js"
  },
  "./point": {
    types: "./dist/point.d.ts",
    import: "./dist/point.js"
  },
  "./line": {
    types: "./dist/line.d.ts",
    import: "./dist/line.js"
  },
  "./unit": {
    types: "./dist/unit.d.ts",
    import: "./dist/unit.js"
  },
  "./transition": {
    types: "./dist/transition-entry.d.ts",
    import: "./dist/transition-entry.js"
  },
  "./plugins": {
    types: "./dist/plugins.d.ts",
    import: "./dist/plugins.js"
  },
  "./chart-style": {
    types: "./dist/charts/style.d.ts",
    import: "./dist/charts/style.js"
  },
  "./style.css": "./dist/visdelta.css",
  "./themes/default.css": "./dist/themes/default.css",
  "./themes/dark.css": "./dist/themes/dark.css",
  "./themes/paper.css": "./dist/themes/paper.css"
};
const requiredFiles = [
  "CHANGELOG.md",
  "LICENSE",
  "package-lock.json",
  "README.md",
  "dist/browser.d.ts",
  "dist/browser.js",
  "dist/area.d.ts",
  "dist/area.js",
  "dist/bar.d.ts",
  "dist/bar.js",
  "dist/point.d.ts",
  "dist/point.js",
  "dist/line.d.ts",
  "dist/line.js",
  "dist/unit.d.ts",
  "dist/unit.js",
  "dist/core.d.ts",
  "dist/core.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/charts/style.d.ts",
  "dist/charts/style.js",
  "dist/transition-entry.d.ts",
  "dist/transition-entry.js",
  "dist/visdelta.browser.js",
  "dist/visdelta.esm.js",
  "dist/visdelta.global.js",
  "dist/visdelta.css",
  "dist/themes/default.css",
  "dist/themes/dark.css",
  "dist/themes/paper.css"
];
const forbiddenDistPatterns = [
  /(^|\/)examples\//,
  /(^|\/)specs\//,
  /weather_(days_tidy|sample)\.csv$/,
  /runtime\/deps\.js$/,
  /dist\/styles\.css$/,
  /dist\/themes\/.*\/DESIGN\.md$/,
  /\.DS_Store$/
];
const forbiddenSourceText = [
  "globalThis.d3",
  "globalThis.aq",
  "configureRuntimeDependencies",
  "getD3",
  "getArquero",
  "createScatterStory",
  "registerMarkRenderer",
  "availableMarkRenderers",
  "chartPlugin"
];
const browserAdapterFiles = new Set([
  "dist/browser.js",
  "dist/visdelta.browser.js",
  "dist/visdelta.global.js"
]);
const browserAdapterGlobals = new Set([
  "globalThis.d3",
  "globalThis.aq"
]);

assertEqual(packageJson.exports, publicExports, "package exports");
assertEqual(packageJson.files, ["dist", "README.md", "CHANGELOG.md", "LICENSE"], "published files");
assertEqual(packageJson.main, "./dist/visdelta.esm.js", "main");
assertEqual(packageJson.module, "./dist/visdelta.esm.js", "module");
assertEqual(packageJson.types, "./dist/index.d.ts", "types");
assertEqual(packageJson.jsdelivr, "./dist/visdelta.global.js", "jsdelivr");
assertEqual(packageJson.unpkg, "./dist/visdelta.global.js", "unpkg");
assertEqual(packageJson.style, "./dist/visdelta.css", "style");
assertEqual(packageJson.repository, {
  type: "git",
  url: "git+https://github.com/SonghaiFan/visdelta.git"
}, "repository");
assertEqual(packageJson.bugs, {
  url: "https://github.com/SonghaiFan/visdelta/issues"
}, "bugs");
assertEqual(packageJson.homepage, "https://github.com/SonghaiFan/visdelta#readme", "homepage");
assertEqual(packageJson.publishConfig, { access: "public" }, "publishConfig");
assertEqual(packageJson.engines, { node: ">=18" }, "engines");
if (!packageJson.devDependencies?.esbuild) {
  throw new Error("package.json must pin esbuild as a devDependency for the global build.");
}
assertEqual(packageJson.scripts["pack:check"], "node scripts/check-pack-consumer.mjs", "pack:check");
assertEqual(packageJson.scripts["release:check"], "npm test && npm run test:browser && npm run pack:check", "release:check");
assertEqual(packageJson.scripts.prepublishOnly, "npm run release:check", "prepublishOnly");
if (!changelog.includes(`## ${packageJson.version} - `)) {
  throw new Error(`CHANGELOG.md must include an entry for ${packageJson.version}.`);
}

for (const file of requiredFiles) {
  await assertFile(file);
}

const distFiles = await listFiles(join(root, "dist"));
for (const file of distFiles) {
  const normalized = relative(root, file).replaceAll("\\", "/");
  if (forbiddenDistPatterns.some((pattern) => pattern.test(normalized))) {
    throw new Error(`Forbidden file in dist: ${normalized}`);
  }
  if (/\.(js|mjs|css|html|md|json|ts)$/.test(file)) {
    const text = await readFile(file, "utf8");
    const forbidden = forbiddenSourceText.find((token) => (
      text.includes(token) &&
      !(browserAdapterFiles.has(normalized) && browserAdapterGlobals.has(token))
    ));
    if (forbidden) {
      throw new Error(`Forbidden token "${forbidden}" in ${normalized}`);
    }
  }
}

console.log(`Package invariants ok: ${distFiles.length} dist files.`);

async function assertFile(path) {
  const fullPath = join(root, path);
  const info = await stat(fullPath).catch(() => null);
  if (!info?.isFile()) throw new Error(`Missing package file: ${path}`);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else files.push(path);
  }
  return files;
}

function assertEqual(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label} mismatch: expected ${right}, got ${left}`);
  }
}
