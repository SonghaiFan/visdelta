import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const targets = [
  "examples",
  "src",
  "scripts"
];
const staleTextTargets = [
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "package.json",
  "README.md",
  "docs",
  "examples",
  "tests",
  "src",
  "website/app",
  "website/content",
  "website/examples",
  "website/components"
];
const forbiddenRepoText = [
  "scrolly-grammar-template",
  'src="https://cdn.jsdelivr.net/npm/visdelta@0.1.1"',
  "src/data/weather",
  "src/specs/",
  "scatter-story",
  "StageSpec",
  ".stage(",
  "staging",
  "plan.update",
  "changedAxes",
  "TransitionPlanUpdate",
  "TransitionPlanEnterExit",
  "choreograph",
  "Choreograph",
  "ChartIdiom",
  "defineChartIdiom",
  "registerChartIdiom",
  "availableChartIdioms",
  "createChartIdiom",
  ".guide(",
  "same-idiom",
  "cross-idiom",
  "scrolly-meta",
  "externalizeScrollyViewSpec",
  "normalizeScrollyViewSpec",
  "NarrativeSpec",
  "NARRATIVE_KEY",
  ".narrative"
];
const files = [];
const textFiles = [];

for (const target of targets) {
  await collect(join(root, target));
}

for (const target of staleTextTargets) {
  await collectText(join(root, target));
}

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Syntax check failed: ${file}`);
  }
}

for (const file of textFiles.sort()) {
  if (file === fileURLToPath(import.meta.url)) continue;
  const text = await readFile(file, "utf8");
  const forbidden = forbiddenRepoText.find((token) => text.includes(token));
  if (forbidden) {
    throw new Error(`Forbidden stale reference "${forbidden}" in ${file}`);
  }
}
console.log(`Checked ${files.length} JavaScript modules.`);

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(path);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      files.push(path);
    }
  }
}

async function collectText(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    if (/\.(css|html|js|md|mdx|mjs|ts|tsx)$/.test(path)) textFiles.push(path);
    return;
  }

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      await collectText(childPath);
    } else if (/\.(css|html|js|md|mdx|mjs|ts|tsx)$/.test(entry.name)) {
      textFiles.push(childPath);
    }
  }
}
