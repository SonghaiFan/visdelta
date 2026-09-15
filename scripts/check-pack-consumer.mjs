import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedApi = [
  "D3_AREA_CURVE_NAMES",
  "D3_CURVE_NAMES",
  "UNIT_LAYOUTS",
  "area",
  "availableChartTypes",
  "bar",
  "buildGroupingTree",
  "chartStylePresets",
  "compileLineage",
  "correspondLineage",
  "d3ChartStyle",
  "darkChartStyle",
  "defineChartStyle",
  "defineChartType",
  "delta",
  "detectDataTypes",
  "diffViewStates",
  "line",
  "lineageMarkKey",
  "paperChartStyle",
  "point",
  "registerChartModule",
  "registerChartType",
  "resolveEncodingTypes",
  "sequence",
  "transition",
  "unit",
  "viewLineageCorrespondence",
  "visualizationSpec"
];

let tarball = null;
let consumerDir = null;

try {
  const pack = run("npm", ["pack", "--json", "--ignore-scripts"], root);
  const [packed] = JSON.parse(pack.stdout);
  console.log(`Tarball: ${packed.size} bytes; unpacked: ${packed.unpackedSize} bytes.`);
  tarball = join(root, packed.filename);
  consumerDir = await mkdtemp(join(tmpdir(), "visdelta-consumer-"));

  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2)
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-audit",
    "--no-fund",
    tarball
  ], consumerDir);

  await writeConsumerSmoke(consumerDir);
  run("node", ["consumer-smoke.mjs"], consumerDir);
  await writeFile(join(consumerDir, "consumer.ts"), await readFile(join(root, "tests/types/consumer.ts")));
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext",
    "--lib", "ES2022,DOM", "consumer.ts"], consumerDir);
  // A normal consumer gets VisDelta's D3 runtime and declared transforms:
  // neither requires a separate authoring or peer installation.
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumerDir);
  run(process.execPath, ["--input-type=module", "--eval", `
    import { bar, delta } from 'visdelta';
    const a = bar([{ key: 'A', value: 1, next: 2 }]).x('key').y('value');
    if (a.rollup().rows()[0].value !== 1) throw new Error('Normal install did not materialize transforms.');
    if (!delta(a, a.y('next')).hasDelta('encoding.y')) throw new Error('Normal installed authoring failed.');
  `], consumerDir);
  console.log("Pack consumer invariants ok.");
} finally {
  if (tarball) await rm(tarball, { force: true });
  if (consumerDir) await rm(consumerDir, { recursive: true, force: true });
}

async function writeConsumerSmoke(dir) {
const source = `
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as api from "visdelta";
import * as browserApi from "visdelta/browser";
import { D3_AREA_CURVE_NAMES as selectedAreaCurveNames, area as selectedArea, areaModule } from "visdelta/area";
import { bar as selectedBar, barModule } from "visdelta/bar";
import { point as selectedPoint, pointModule } from "visdelta/point";
import { D3_CURVE_NAMES as selectedCurveNames, line as selectedLine, lineModule } from "visdelta/line";
import { UNIT_LAYOUTS as selectedUnitLayouts, unit as selectedUnit, unitModule } from "visdelta/unit";
import { delta as selectedDelta } from "visdelta/core";
import { sequence as selectedSequence, transition as selectedTransition } from "visdelta/transition";
import { defineChartStyle as selectedChartStyle, d3ChartStyle as selectedD3Style } from "visdelta/chart-style";
import {
  ChartState as SelectedChartState,
  defineChartModule as selectedChartModule,
  defineChartType as selectedPlugin
} from "visdelta/plugins";

const expectedApi = ${JSON.stringify(expectedApi, null, 2)};
const actualApi = Object.keys(api).sort();
assertSame(actualApi, expectedApi, "public API");
assertSame(Object.keys(browserApi).sort(), expectedApi, "browser public API");
assertSame(Object.keys(globalThis.VisDelta).sort(), expectedApi, "browser global API");
if ("vd" in globalThis) throw new Error("the browser build must define only the VisDelta global");
assertSame(api.availableChartTypes(), ["area", "bar", "line", "point", "unit"], "chart types");
if (typeof selectedArea !== "function") throw new Error("area subpath did not export area()");
if (selectedAreaCurveNames.length !== 19) throw new Error("area subpath did not export its D3 curve names");
if (typeof selectedBar !== "function") throw new Error("bar subpath did not export bar()");
if (typeof selectedPoint !== "function") throw new Error("point subpath did not export point()");
if (typeof selectedLine !== "function") throw new Error("line subpath did not export line()");
if (selectedCurveNames.length !== 20) throw new Error("line subpath did not export all D3 curve names");
if (typeof selectedUnit !== "function" || selectedUnitLayouts.length !== 4) throw new Error("unit subpath did not export Unit grammar");
if (areaModule.key !== "area" || barModule.key !== "bar" || pointModule.key !== "point" || lineModule.key !== "line" || unitModule.key !== "unit") throw new Error("focused chart module mismatch");
if (typeof selectedDelta !== "function") throw new Error("core subpath did not export delta()");
if (typeof selectedTransition !== "function") throw new Error("transition subpath did not export transition()");
if (typeof selectedSequence !== "function") throw new Error("transition subpath did not export sequence()");
if (typeof selectedChartStyle !== "function" || selectedD3Style.key !== "d3") throw new Error("chart-style subpath mismatch");
if (typeof selectedPlugin !== "function") throw new Error("plugins subpath did not export defineChartType()");
if (typeof selectedChartModule !== "function") throw new Error("plugins subpath did not export defineChartModule()");
if (typeof SelectedChartState !== "function") throw new Error("plugins subpath did not export ChartState");

const entry = fileURLToPath(import.meta.resolve("visdelta"));
const browserEntry = fileURLToPath(import.meta.resolve("visdelta/browser"));
const style = fileURLToPath(import.meta.resolve("visdelta/style.css"));
const theme = fileURLToPath(import.meta.resolve("visdelta/themes/default.css"));
const root = entry.replace(/\\/dist\\/visdelta\\.esm\\.js$/, "");
const globalScript = root + "/dist/visdelta.global.js";
assertSame(browserEntry, root + "/dist/visdelta.browser.js", "browser export");
await assertFile(root + "/dist/index.d.ts", "types");
await assertFile(root + "/dist/browser.d.ts", "browser types");
await assertFile(globalScript, "global script");
assertSame(style, root + "/dist/visdelta.css", "style export");
assertSame(theme, root + "/dist/themes/default.css", "theme export");
await assertFile(style, "style");
await assertFile(theme, "theme");
await assertGlobalScript(globalScript);

function assertSame(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(\`\${label} mismatch: expected \${right}, got \${left}\`);
  }
}

async function assertFile(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new Error(\`missing \${label}: \${path}\`);
}

async function assertGlobalScript(path) {
  // A bare context plus the text-encoding globals every browser guarantees.
  const context = { console, TextDecoder, TextEncoder };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(await readFile(path, "utf8"), context);
  assertSame(Object.keys(context.VisDelta).sort(), expectedApi, "global script API");
  if (context.vd !== context.VisDelta) throw new Error("global script vd alias mismatch");
}
`;
  await writeFile(join(dir, "consumer-smoke.mjs"), source);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, npm_config_cache: join(tmpdir(), "visdelta-npm-cache") },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status === 0) return result;

  const rendered = [result.stdout, result.stderr].filter(Boolean).join("\n");
  throw new Error(`${command} ${args.join(" ")} failed:\n${rendered}`);
}
