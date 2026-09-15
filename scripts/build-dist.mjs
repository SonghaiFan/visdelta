import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = new URL("../dist/", import.meta.url);

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const tsc = spawnSync("npx", ["tsc", "-p", "tsconfig.json"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
if (tsc.status !== 0) {
  process.stderr.write(tsc.stdout || "");
  process.stderr.write(tsc.stderr || "");
  throw new Error("TypeScript build failed.");
}

await cp(new URL("../src/styles.css", import.meta.url), new URL("../dist/visdelta.css", import.meta.url));
await cp(new URL("../src/themes", import.meta.url), new URL("../dist/themes", import.meta.url), {
  recursive: true,
  filter: (path) => !path.endsWith(".DS_Store") && !path.endsWith("DESIGN.md")
});
await writeFile(
  new URL("../dist/visdelta.esm.js", import.meta.url),
  'export * from "./index.js";\n'
);
await writeFile(
  new URL("../dist/visdelta.browser.js", import.meta.url),
  'export * from "./browser.js";\n'
);
await esbuild.build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL("../src/browser.ts", import.meta.url))],
  format: "iife",
  globalName: "VisDelta",
  footer: { js: "globalThis.VisDelta = VisDelta;" },
  legalComments: "none",
  minify: true,
  outfile: fileURLToPath(new URL("../dist/visdelta.global.js", import.meta.url)),
  target: "es2020"
});

console.log(`Built ${join(root, "dist")}`);
