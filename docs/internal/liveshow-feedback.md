# Liveshow feedback ledger

Audited 2026-10-30 against the local VisDelta 0.4.2 checkout. This is an ongoing
engineering ledger, not a published-release claim. Preserve reproduction,
observed/expected behavior, evidence, owner, priority, status and verification
when adding a report. Downstream prompt/transport policies are not Core rules.

| ID | Reproduction; actual → expected | Evidence | Owner / priority | Status and verification |
| --- | --- | --- | --- | --- |
| LS-01 | Replace Bar with Pie; `update` rejects different marks. Explicit `replace` should validate before acceptance, retain latest scheduling, and fade only the destination. Resize during fade erased opacity. | `src/render.ts`; browser render test | Core / P1 | Reviewed existing replacement implementation; fixed resize to retain opacity. Tests cover invalid replacement preserving snapshot, cross-type endpoint, independent custom module, fade resize/destruction. Same-type replacement uses ordinary transitions. No crossfade or morph. |
| LS-02 | `view.edit` on Pie fails although its builder has color/highlight/filter. Inherited `focus` can be authored but Pie rejects its camera at runtime. | `src/charts/*/module.ts`, `bar/edit.ts`, `pie/plugin.ts`; `tests/pie.test.mjs` | Chart modules + docs / P1 | Documented actual adapter boundary. Only Bar has `module.edit`; inspect that public optional function rather than infer support from inherited methods. Uniform adapters/capability descriptors remain open: each needs round-trip and chart-owned validation, not a Core conversion table. |
| LS-03 | “Color Pie by product” was blocked by a downstream tool exposing only a string value. Builder supports field channels; Bar edit accepts only one string, less than builder. Bare `red` is a field, not a CSS literal. | `src/charts/authoring.ts:colorFrom`, `bar/edit.ts`; downstream `server/agent.mjs` | Downstream + docs; adapter parity chart-owned / P1 | Documented explicit field/value, palettes and continuous scale. Added machine-readable authoring subset schema. Broader Bar edit arguments remain open; full specs are the supported escape hatch. |
| LS-04 | `layout:'stacked'` or color alone does not establish segments. Need detail, aggregation and category+series identity. | Downstream `docs/visdelta/stacked-bar-authoring.md`; upstream `examples/authoring/complete-states.mjs` | Docs / P1 | Added complete builder-generated JSON tutorial and six-family executable fixture. Tests check round-trip, real-data validation, four segments, preserved total, and browser rendering. Source-column filters/sorts must precede fold/aggregate. |
| LS-05 | Pie observations previously exposed wrapper fields instead of product/revenue. Observation could run while manual preparation was in flight; capture could finish after resize under unchanged revision. | `runtime/chart-observation.ts`; `render.ts`; shared `__row` usage in Pie, Unit, Line | Core / P1 | Retained shared row unwrapping with object guard; blocked manual preparation; invalidated capture after explicit resize. Tests cover Pie source scalars, custom module data, manual preparation and capture/resize race. Spatial bounding-box order is not Pie angular or series point order. |
| LS-06 | Downstream copies reference/chart-types/transforms; copied documents can drift from installed library. | Downstream authoring note names 0.4.2; existing website `llms.txt`, `llms-full.txt` and agent guide | Docs / P2 | Linked existing entry points, added workflow and checked-in examples/schema. Pin docs to the installed package/repository revision. A package capability/index export is deferred until its consumer/versioning contract is defined; no duplicate registry introduced. |
| LS-07 | Append-only `where` is mistaken for inability to remove filters/reset. Complete declarations can replace transforms; conversation undo belongs to application. | `render.ts`; browser empty-filter restoration test; downstream agent restore instructions | Docs + downstream / P1 | Documented removing one indexed transform and app-owned history. Empty Bar result and restoration are browser tested. This does not promise every chart permits every empty/zero-total declaration. |
| LS-08 | Liveshow rejects changed inline rows while Core permits inline/named/URL sources. Structural parse is mistaken for chart validation. | `charts/authoring.ts`, `runtime/resolve-spec-data.ts`, JSON guide; downstream `server/agent.mjs` | Downstream + chart diagnostics / P2 | Clarified data policy and validation boundaries. Broad structured errors/field diagnostics remain open; existing runtime checks are not a universal field-schema validator. No restrictions added to Core data sources. |
| LS-09 | Agent looked up docs then stopped under an ambiguous tool quota. | Read downstream `server/agent.mjs`: now explicitly allows sequential messages in one request, docs → set_chart → receipt | Downstream / P1 | No Core quota changes. Added read/validate/apply/receipt integration guide; screenshots only for visual questions. Historical 51 tests and `/tmp` screenshot were not treated as current upstream verification. |

## Verification record

Verified locally: `npm test` (355 tests plus type/build/bundle/examples/docs/package gates),
`npm run render:check` (3 browser suites), `npm run react:check` (2 tests),
`npm run pack:check`, and `npm run authoring:check` (installed-package browser
consumer including replacement). The render suite was rerun after adding
cross-type latest-scheduling assertions and passed. Website production build
also passed (including 22 live examples and static MDX pages). The initial
restricted build stalled and was stopped; the permitted retry completed.
CSS optimization emitted two `::highlight` warnings.

`tests/liveshow-authoring.test.mjs` checks complete
specs and denominator semantics; `tests/browser/render.test.mjs` checks live
rendering and lifecycle behavior. Existing release gates remain authoritative.
No release, push, downstream service operation, or user-browser operation is part
of this audit.

## Next evidence to collect

- For a non-Bar edit adapter, capture the exact authored declaration, requested
  methods, preserved options and transformed data. Prove round-trip first.
- For richer observation, define chart-owned datum/series/angular semantics before
  promising that each SVG mark represents one source record. Current scalars omit
  objects, arrays and private fields; aggregates expose transformed rows.
- Capture invalid field/encoding examples before designing a stable error-code
  taxonomy. Preserve the old chart on each rejection.

## Second implementation pass — 2026-10-30

This section supersedes the open adapter/distribution status in LS-02, LS-03 and
LS-06 above. Changes remain local and unreleased. The downstream report
`visdelta-liveshow/docs/agent-validation-2026-10-30.md` was read; its nine real-agent
steps used the older `visdelta-0.4.2-chart-type.tgz`. Its 51 server tests and UI
screenshots do not validate these new APIs. No Liveshow files, services or browser
were changed here.

### Public contracts available for integration

- `view.capabilities()` returns detached `{mark, fluentEdits, editMethods}` for
  latest accepted intent. Modules publish optional `editMethods`. Bar retains
  flip/x/y/focus plus shared methods. Pie/Line/Area/Point/Unit opt into only
  color/where/sort/highlight. Custom adapter without metadata reports null list;
  no adapter reports false and an empty list. Availability is not endpoint validity.
- All six adapters accept `color` with one string or one explicit channel object
  (fixed value, categorical field/range/scheme, or quantitative field/scheme).
  Common methods preserve authored slots and require a round-trip. Missing fields
  are checked against nonempty transformed rows, not guessed for empty results.
  Runtime rendering validates the complete candidate before acceptance. Bar's
  existing codec restrictions still reject some aggregate/fold forms.
- Built-in call errors include `code`, `hint`, `chartType`, `method`, `editIndex`
  and JSON Pointer `path` where attribution exists. Runtime adds structured
  message/state/type/revision errors. This is bounded coverage, not universal
  diagnostics for custom modules or every render failure.
- `visdelta/docs/index.json`, `visdelta/docs/reference.md`, and
  `visdelta/docs/color-channel.schema.json`, `visdelta/docs/chart-types.md` and
  `visdelta/docs/data-sources-and-transforms.md` are package exports. Index schema 1
  carries packageVersion and `{path, sha256}` documents. Build-time copies and
  byte hashes distinguish local builds sharing 0.4.2. No copied conversion table
  or new chart registry is required.

```ts
const capabilities = view.capabilities();
const { revision } = view.snapshot();
await view.edit({ requestId: 'pie-color-and-highlight', baseRevision: revision,
  edits: [
    { method: 'color', args: [{ field: 'product', type: 'nominal', scheme: 'Tableau10' }] },
    { method: 'highlight', args: [{ product: 'Atlas' }] },
  ] }, { animate: false });
```

```ts
// Host-side documentation lookup from the installed artifact.
import { readFile } from 'node:fs/promises';
const index = JSON.parse(await readFile(new URL(import.meta.resolve('visdelta/docs/index.json')), 'utf8'));
const reference = await readFile(new URL(import.meta.resolve('visdelta/docs/reference.md')), 'utf8');
```

### New downstream reproductions

| ID | Reproduction and actual vs expected | Evidence / owner / priority | Resolution and verification |
| --- | --- | --- | --- |
| LS-10 / LV-01 | Bar→Pie request says retain Atlas highlight; candidate omits it, applied rev3 has all slices fully opaque. Separate Pie highlight succeeds rev4 with shares unchanged. | Downstream nine-step report, steps 3–4; downstream authoring / P1 | Existing `diffViewStates(before,candidate).hasDelta('highlight','remove')` detects omission across types. `delta` rejects different types. Added public examples and cross-type diff test. No automatic merge. Receipt proves execution, not complete user intent. |
| LS-11 / LV-02 | Second edit in filter+highlight batch uses product:null; old error says only “Filter requires a comparison operator.” | Report step 6; Core diagnostics + chart adapters / P1 | Built-in edit subset rejects null selector with `INVALID_EDIT_ARGUMENTS`, `method: highlight`, `editIndex: 1`, `path: /edits/1/args/0/product`, scope-removal hint. Batch remains atomic. Browser test covers a malformed second selector and unchanged revision; unit test covers exact null reproduction. |
| LS-12 / LV-03 | Removing profit filter restores rows but leaves highlight filters:[], dimming every Pie slice. Recovery select-all is also not true removal. | Report steps 6–7; downstream authoring + docs / P1 | Documented canonical JSON deletion and builder `.with({scopes:{highlight:null}})`. Browser checks removal=full opacity, empty=all dim, all=full opacity but retained scope. No change to valid empty-selection semantics. |
| LS-13 | Stacked candidate puts highlight under meta.object.state, renders full color. | Report step 8; downstream authoring + docs / P2 | Documented recognized path `meta.state.scopes` versus identity `meta.object` and preserved extensions. Transport/renderability does not certify every field was consumed. Added semantic test for inert misplaced metadata; no global strict schema introduced. |

```ts
import { diffViewStates } from 'visdelta';
const before = view.snapshot().spec;
const audit = diffViewStates(before, candidate);
const lostHighlight = audit.hasDelta('highlight', 'remove');
// Compare with user intent; intentional removal remains allowed.
```

```ts
// Clear only canonical highlight, retaining filters, sort, color, measure and focus.
const { spec } = view.snapshot();
if (spec.meta?.state?.scopes) delete spec.meta.state.scopes.highlight;
await view.update(spec);
```

Legacy selection aliases can supply a fallback and must also be removed if used.
An empty scope selects nothing; selecting all current products retains attention
and may exclude future products. Neither is an alias for clearing. Do not claim
applied means the model used recognized metadata or preserved requested intent.

### Change ownership

- Module contracts: `src/charts/module.ts`, six `src/charts/*/module.ts` files.
- Shared bounded authoring: `src/charts/common-edit-methods.ts`,
  `src/charts/common-edits.ts`; Bar adapter extends color and call diagnostics.
- Runtime discovery/errors: `src/render.ts`, `src/edit-errors.ts`, exported types
  in `src/index.ts`. Core remains free of chart-name branching.
- Distribution: `package.json`, `scripts/build-dist.mjs`, package/installed-consumer
  checks; documentation copies live under generated `dist/docs`.
- Regression evidence: fluent-edit unit tests, Liveshow authoring tests, browser
  render/edit tests, installed authoring consumer; reference, constitution, JSON
  guide and agent workflow updated together.

### Remaining boundaries

No automatic intent preservation, complete field/type schema, geometry compatibility
oracle, non-Bar focus/axis adapters, arbitrary builder execution, conversation
history, or new metadata rejection policy. A final batch endpoint failure may
have no unique edit index. Downstream must integrate the new artifact and its docs
before claiming real-model acceptance of this pass.

### Second-pass verification and handoff artifact

- `npm test`: **360 passed**, including build/type/bundle/manifest/example/docs/
  package gates. The package export check initially caught ordering in the new
  expected map; corrected the map and reran the complete gate successfully.
- `npm run render:check`: **3 browser suites passed**, including custom modules
  with no adapter and with an unadvertised legacy adapter; shared edit failures
  preserve snapshots and indices/paths; all three Pie attention states verified.
- `npm run react:check`: **2 passed**.
- `npm run pack:check`: installed docs exports, package version and byte hashes
  verified, along with existing installed API/type checks.
- `npm run authoring:check`: installed Pie capabilities/edit and existing story,
  custom-plugin, style and lifecycle assertions passed. Repeated this check with
  the exact handoff tarball below and it passed.
- Website production build passed; two existing generated `::highlight` CSS
  optimization warnings remain. No browser visual-layout changes were made.
- Final type/build and whitespace checks passed. Unrelated code-editor and
  website dependency changes were preserved; nothing committed, pushed or released.

Local, unreleased handoff artifact (temporary path):
`/tmp/visdelta-liveshow-api-20261030/visdelta-0.4.2.tgz`

SHA-256:
`fe3248d5e1492a68b724ab0f81e4fc33aa57bc889bac9171a3344c7e27ffb995`

This is a new local build retaining package version 0.4.2, not a new npm release.
Use this exact artifact plus its exported documentation index for the next
Liveshow integration. The downstream real-agent nine-step report predates it;
real-model/browser acceptance after installation remains downstream work.

## Third pass — LS-14: renderable fold stack cannot use fluent flip

Priority **P1**, owner **Bar adapter + public edit contract/docs**. Downstream
reported `edit_chart flip` rejecting with “Bar Grain pipeline contains an
unsupported transform,” followed by an agent rewrite to horizontal that did not
prove an actual orientation change. This is a real support-boundary mismatch,
not evidence that fold stacks are invalid or that every renderable pipeline must
support every fluent operation.

Evidence: `validateGrainBar` allows only filter/sort/timeUnit alongside its single
aggregate; `fold` is outside that codec. The Gallery's `stacked-bars` recipe in
`website/components/interactive/gallery-idioms.js` uses existing state/age/population
roles with key(state,age), breakdown(age) and rollup(state,age). The single-measure
fold recipe serves a different question: one total segmented by products. Four
product/profit rows cannot imply several group totals without another dimension.
Clarify that visual intent before constructing a stack; never invent source rows
or add overlapping profit/revenue to manufacture segments.

### Implemented contract

- `view.previewEdit(message): Promise<{revision, spec}>` checks an exact batch on
  the latest accepted declaration via its module, resolved data and a hidden
  static render. It changes no revision, queues no playback, consumes no request
  ID, and cleans up validation mounts. It rechecks the base revision and rejects
  manual ownership/preparation. This is endpoint support, not a reservation,
  animation-route proof or intent proof. Use it for uncertain pipelines rather
  than adding a mandatory extra tool round trip to every edit.
- `capabilities()` remains advertised method discovery. Preview answers whether
  this specific batch works on this current state. Actual `edit` still validates
  again and can conflict if another accepted update advances the revision.
- A **single flip edit** on Bar has a bounded fallback when the existing codec
  rejects its pipeline. Bar's own coordinate builder must round-trip the source,
  have categorical/quantitative axes, and preserve data, ordered transforms,
  identity and attention. Full runtime validation still applies. This permits
  the reported fold→aggregate stack to flip without changing its grain.
- Other/mixed batches keep the existing codec restriction. Diagnostics include
  `UNSUPPORTED_EDIT_STATE`, the failing edit context and `specPath` such as
  `/transform/0/fold`. `path` still points into the edit message; `specPath` points
  into the source declaration. No Core chart-name branch, generalized Grain
  planner support, hard-coded stacked conversion or universal edit claim added.

```ts
const { revision } = view.snapshot();
const message = { requestId: 'flip-stack', baseRevision: revision,
  edits: [{ method: 'flip', args: [] }] };
const preview = await view.previewEdit(message);
// Check real bindings: quantitative x -> quantitative y is horizontal -> vertical.
console.log(preview.spec.encoding.x, preview.spec.encoding.y);
await view.edit(message);
```

A compound flip+color request can still be unsupported on this pipeline. Do not
silently decompose a promised atomic batch or replace its meaning. Preview the
intended batch, then deliberately author a complete destination if necessary.

Files changed in this pass: `src/charts/bar/edit.ts`, `src/render.ts`,
`src/edit-errors.ts`; fluent-edit and browser render tests; installed authoring
consumer; reference, constitution, JSON guide and this ledger.

Unit tests verify an actual horizontal→vertical swap, unchanged fold/aggregate,
identity and attention, sequential flip restoration, rejected compound edits and
exact transform diagnostics. Browser tests verify animation endpoints and restored
geometry, preview without acceptance/ID consumption, failed preview cleanup,
and custom-module preview. Installed consumer exercises the same preview→edit
flow from a tarball.

### Third-pass validation and replacement handoff artifact

- `npm test`: **361 passed**, with build/type/bundle/manifest/examples/docs/package
  gates. Existing hand-written Bar JSON editing still passes; its original
  codec path is retained rather than forcing it through the bounded fallback.
- `render:check`: **3 browser suites passed**; `react:check`: **2 passed**.
  Render suite rerun after adding stale-preview conflict coverage: passed.
- `pack:check` and installed `authoring:check`: passed, including preview→flip
  on a real installed fold stack. The exact tarball below was independently
  installed and the authoring consumer passed again.
- Website production build passed; the same two generated `::highlight` CSS
  optimization warnings remain. Whitespace/scope checks passed; unrelated
  website editor/dependency changes remain untouched.

**Use this third-pass artifact for LS-14 integration**, superseding the second-pass
handoff for this feature:
`/tmp/visdelta-liveshow-flip-20261030/visdelta-0.4.2.tgz`

SHA-256:
`0240c11c9b8379c17d56686f025032fe5e1fab142b898bcf1a777d26ab4f7742`

Version remains 0.4.2 in this unreleased local build. Its packaged docs/index
matches its API. No Liveshow changes, service operations, browser interaction,
commit, push or release were performed. Real-agent acceptance remains downstream.

## LS-15 — Public Bar layout facts and grouped declarations (2026-11-02)

Downstream reported an agent falsely claiming an existing stacked chart was
already grouped without calling a tool or changing revision. Grouped rendering
already exists; this is not a request for a new renderer or a bespoke converter.

Main-library changes:

- `inspectBarSpec(spec)` and `BarSpecInspection` are exported from `visdelta/bar`.
  The pure inspector shares `semanticBarState` with the renderer, reports layout,
  orientation, fields and grouped offset, and returns unknown with diagnostics
  for ambiguous/noncanonical bindings. It does not promise renderability, pixel
  state, fluent editing support or successful browser application.
- Reference docs shipped in `dist/docs/reference.md` and the Bar documentation
  page contain complete vertical/horizontal grouped JSON generated by
  `examples/authoring/bar-layouts.mjs`. Tests compare those JSON blocks with the
  actual builder output. No manual offset transformer was added.
- `view.capabilities()` remains an editing-method list, not a current-layout
  query. Use the inspector for declaration facts, normal validation for candidate
  acceptance, and an applied browser receipt for actual application.

Local verification: 367 unit tests passed; source build, documentation gates,
smoke API export check and website build passed. Installed package checks passed
using an isolated cache after an unrelated temporary npm-cache ENOENT. Installed
browser consumer checked four positive bars in each orientation/layout, grouped
category positions = 4 versus stacked = 1, matching the inspector. No renderer
or chart planning policy was changed.

Downstream subsequently reported a successful real OpenAI Realtime browser run:
`grouped bar chart` produced docs → set_chart → applied revision 2 and eight
side-by-side revenue/profit bars. This is a report from the downstream chat,
not an independent upstream rerun. No downstream vendor change was made here.

Unreleased artifact: `/tmp/visdelta-layout-inspection-20261102/visdelta-0.4.2.tgz`
SHA-256: `d8695e38bb0a116269acb46a0534764f62f58b149d79dabf076d30093611bcdf`.
The version number is still 0.4.2; the hash identifies this local build. It has
not been published. The artifact includes earlier local work in this checkout.

## LS16 — Semantic layout edits and serialized grouping (2026-11-02)

Main-library changes: Bar advertises `layout` and accepts grouped/stacked on
segmented declarations. A single layout or flip can preserve a folded pipeline
through exact rehydration and unchanged data/transform/identity/attention checks.
Mixed fold batches remain rejected atomically. `previewEdit` checks the exact
state, returns canonical spec without consuming revision/request ID; existing
`delta` and edit receipts remain the proposal/acceptance evidence boundary.
No root layout slot or downstream offset converter was added.

A distinct rehydration defect was confirmed: coordinate compilation consulted
layout metadata while rendering also recognized offsets. Compiling flip from an
offset-only grouped declaration could therefore delete grouping. The coordinate
compiler now shares `barLayoutState` with rendering. Regression covers serialized
specs, correct opposite-axis offsets and unchanged transforms/data.

Validation: `npm test` 369 tests; installed authoring consumer (including layout,
flip, stacked preview/actual agreement, physical positions and atomic rejection);
all 3 render browser suites; an additional persistent-view full-update grouped
flip regression compares every settled axis/tick against independent static
renders over three alternating flips, with zero ghosts. Pack consumer and website
webpack production build passed. `git diff --check` clean.

Local snapshot: `/tmp/visdelta-semantic-layout-20261102/visdelta-0.4.2.tgz`
SHA-256: `a337865b753d26cd643c9ccfbe54a107a6065469d29ea78a0856d98b53361837`.
This is an unreleased local snapshot, not a vendor update or deployment.

Downstream reported actual model layout/flip calls applied in roughly 3.4–3.6s,
then persistent axis overlap on its older installed snapshot. Those integration
results are source-chat reports, not independently verified here. Current-library
full-update regression does not reproduce that axis residue; downstream must
verify its exact scene after adopting the current snapshot. No downstream files,
services or DOM were changed in this task.

## LS17 — Likert layout candidate contract (2026-11-02; implementation in progress)

Downstream API contract is frozen for integration; artifact and validation are not
ready yet. `BarState.layout(name, options?)` accepts `diverging` in addition to
existing layouts. Distribution options are:

```ts
{ normalize?: 'none' | 'percent'; negative?: string[];
  neutral?: string | null; positive?: string[]; segments?: string[] }
```

- Diverging: `negative` and `positive` are required nonempty string arrays;
  `neutral` is required, one string or `null`. Numeric/array neutral categories
  are unsupported. Category sets must be unique/disjoint. `segments` is forbidden.
- Negative order is outermost → center; positive is center → outermost.
  In horizontal orientation the complete reading order is negative, neutral,
  positive left→right; vertical is bottom→top. Neutral is one rectangle centered
  on zero, never two objects or half-votes. Separate neutral is unsupported.
- Normalization defaults to `none`. `percent` divides every segment by the sum
  of ALL declared category counts within its question, neutral included; geometry
  uses fractions (1 = 100%). Signed positions are not response shares or net scores.
- 100% comparison: `.layout('stacked', {normalize:'percent', segments:[...]})`,
  segments in full reading order. Missing categories require explicit zero rows.
- `.layout('grouped')` or `.layout('stacked')` clears distribution normalization
  and side declarations. `.flip()` preserves them. No root layout field or
  data negation/offset conversion is needed.
- Persistent edit: `{method:'layout', args:['diverging', options]}`; exact support
  via previewEdit, facts via inspectBarSpec. A single layout/flip presentation
  request preserves data, pipeline and identity. Mixed edits involving this
  layout are deliberately unsupported initially.
- Planned guide route `/docs/charts/bar` (Likert section), Playground
  `#likert-diverging`, Gallery `likert-diverging` and `likert-percent`.


LS17 clarification: `inspectBarSpec(spec).distribution` returns null for ordinary
layouts, otherwise a detached object with normalize explicitly none/percent and
actual segments or side declarations. Canonical policy is the existing chart-owned
`meta.state.sceneState.detail.offset` slot, never a root layout field. V1 requires
tidy counts (no fold/facet/custom domains/scales), complete unique question/response
cells; mixed distribution edits and grain changes reject. `layout('grouped')` or
`layout('stacked')` without options clears the policy. The guide is now authored
under `/docs/charts/bar#likert-responses-100-stacked-or-centered-divergence`.

### LS17 frozen integration artifact — READY (2026-11-02)

Path: `/tmp/visdelta-likert-20261102/visdelta-0.4.2.tgz`
SHA-256: `db565639dd13f8f5c090b3c39497669d1d4d9cf3c671da53a671312ab5fb6b9d`

This artifact is immutable and ready for downstream integration. Source/runtime
validation: 372 unit tests and 4 browser suites passed; installed-package consumer
also passed the synthetic N=100/200/80 Likert semantic preview/edit/flip test.
`inspectBarSpec().distribution` includes normalization and side/order policy.
Packaged docs contain the guide. Website production export and visual QA remain
in progress and are not claimed by this artifact-ready note. Do not wait on site
export to test this exact archive; do not run source-sync while site work continues.
No source/runtime change is planned during downstream validation. If visual QA
finds a runtime defect, any correction will use a new artifact path/hash rather
than overwrite this archive. No downstream files or services were changed here.

### LS17 final main-library / website validation

- `npm test`: 372 passing tests; manifest/build/docs/package/smoke checks passed.
- `render:check`: 4 browser suites passed, including the new Likert geometry,
  neutral identity, semantic preview/edit, invalid-endpoint transaction and axes.
- Installed consumer: native layout+flip on N=100/200/80 survey, unchanged source
  counts and all-category percentage denominator passed. Pack/type consumer passed.
- Website: 23 live examples and 25 Playground stories verified. Webpack production
  export passed (2 existing generated CSS highlight warnings). 11 browser tests
  passed, including desktop1280/narrow390 Likert keyframes and Bar guide. Reviewed
  screenshots `/tmp/visdelta-likert-1280.png` and `/tmp/visdelta-likert-390.png`.
- Selected Bar transition budget is now 106k gzip to account for distribution
  validation/geometry (~3k additional gzip); unrelated-chart exclusion stays active.
- Frozen artifact above remains unchanged. No release, push or downstream update
  performed here. Downstream real-model acceptance remains a separate check.


## LS18 — Positional scale syntax diagnostic (source update only)

Source investigation corrected the downstream premise: ChannelSpec.scale is an
object; the runtime reads scale.type and scale.base. Rejecting all objects would
break supported log scales. The defect was nested scale.domain being silently
ignored in favor of channel.domain. Core now validates this shared x/y syntax at
the declaration boundary: parseSpec, visualizationSpec and warning analysis reject
nested domains with INVALID_CHANNEL_SCALE and a specPath pointing to that leaf.
Strings are rejected with an object example; plugin-specific channels and valid
custom scale objects remain opaque. No chart-name branch was added. Regression
was observed red (missing exception) before the fix. Existing frozen archives and
downstream are untouched; no new integration archive is provided in this step.


## LS19 — Distribution highlight and clear (implementation validation underway)

Root cause: layout and flip had a safe presentation adapter, but highlight was
routed into the Grain codec, which correctly rejects distribution declarations.
Bar now routes one distribution highlight through the same strict rehydration
boundary and verifies unchanged data, transforms, mark identity, encoding,
distribution policy and focus. `.highlight(null)` explicitly clears Bar highlight;
`{response:null}` remains invalid. Public edit uses args:[selector] or args:[null],
with preview/receipt semantics unchanged. Mixed distribution batches stay rejected.
No downstream spec patch or filter substitute is required. New regression was
observed failing with UNSUPPORTED_EDIT_STATE before the fix.

### LS19 frozen artifact — READY

Use `/tmp/visdelta-highlight-final-20261102/visdelta-0.4.2.tgz`.
SHA-256: `4e70280357310126a8ef794fa30b9ddce4328ab6cb09b8cd8b5a3da6dde22028`.
This is the final validated artifact; do not use the earlier provisional
`/tmp/visdelta-highlight-20261102/` archive.

Validation: 374 unit tests, 4 render browser suites and the installed consumer
using this exact final archive passed. For BOTH 100% stacked and diverging survey:
15 marks remain, 3 Strongly agree marks retain full opacity and 12 dim; flip retains
the same keys/counts/shares/opacity; highlight(null) restores all 15. Preview and
accepted spec match. Clearing then re-highlighting with an unrelated focus scope
also round-trips, including direct new BarState(serializedSpec) authoring. Explicit
null scope entries are retained during adapter rehydration, avoiding a second
round-trip failure when focus coexists with a cleared highlight.

This archive includes the LS18 scale-domain diagnostics: scale is an object
(type/base supported), while nested scale.domain rejects with a hint to use channel
domain. Do not reject all scale objects downstream. No downstream files/services,
old frozen archives or publication were changed. Main source/runtime is stable
for artifact-based integration; website docs build is the remaining local step.

LS19 website production export also passed after the final source build (the
existing generated CSS warnings remain). Main-library work is complete; real
Liveshow model/browser acceptance is owned by the downstream thread.

## LS20 — Seven kinds / semantic edit coverage audit (2026-11-02)

Downstream reported 20 validatePlan experiments against installed snapshot
`4e7028035731`. These results are downstream evidence, not independently rerun
here. “Seven kinds” is the state-change vocabulary; it does not promise that every
builder operation, declaration shape or MCP tool supports all seven categories.

| Tested state | Accepted edits | Rejected edits |
| --- | --- | --- |
| Ordinary survey with aggregate | highlight, clear, focus, sort, color, flip, layout, flip+highlight | where(question=Parks): only sort supported after aggregate; y(count): aggregate axis remap unsupported |
| Same survey, normalized 100% stacked | single highlight, clear, flip, layout | focus, where, sort, color, y, flip+highlight: distribution presentation-adapter restriction |

LS19 added highlight/clear only. It did not establish general seven-category edit
support for distribution layouts. A rejection for this declaration/batch must not
be described as an unsupported entire semantic category.

Follow-up priorities (not implemented or newly promised):

1. Extend distribution presentation editing first for color and focus, which do
   not change membership. Prove preservation of counts, denominator, identity and
   unrelated attention; validate exact candidate data and browser results.
2. Define explicit pre-aggregate input filtering versus post-aggregate filtering.
   Ordinary where currently appends after aggregate and hits the Grain codec
   boundary. Do not silently move predicates upstream: source fields, aggregate
   aliases and HAVING-like predicates have different meanings. Establish an API,
   examples and exact support diagnostics before changing placement.
3. Review sort, aggregate axis remaps and safe mixed batches independently rather
   than relaxing the whole codec. Preserve atomic preview/acceptance semantics.
4. Align MCP selector spellings with public selectors: audit eq/ne/in versus
   equal/notEqual/oneOf. Any mapping belongs in an explicit tested integration
   contract, not an assumed library synonym.

The downstream MCP surface also omits rollup, breakdown, size, repeat, domain,
scale, strokeWidth and curve. Complete set_chart can express additional states,
but is a complete-state fallback, not equivalent semantic-edit coverage. Report
library builder support, exact-spec adapter support and MCP tool availability as
three separate facts. No runtime/API changes or new archive were made for LS20;
all existing frozen snapshots remain unchanged.

## LS21 — Layout edit audit: shared Bar path (2026-11-02)

Implementation is ready; frozen package is
`/tmp/visdelta-layout-audit-20261102/visdelta-0.4.2.tgz`, SHA-256
`0bd06e81f95bb0173f82e8ea042bd024ac13d04a87c8d7cf28b64cb55bcce6b2`.
This is a new local snapshot, not an npm publication. Older archives are unchanged.
Installed-package verification is pending below; downstream may prepare integration
against this exact hash, but should wait for the completed evidence entry.

The shared Bar adapter no longer uses Grain-planner coverage as an edit permission
switch. Ordinary, normalized stacked and diverging states accept color, focus,
sort, whole-question where, same-field x/y options and compound presentation edits.
Each call materializes the preceding state: two flips cancel, layout+flip and
flip+highlight preserve the requested destination. Fold-generated color fields
are checked against transformed rows, not raw source columns. Existing data and
mark keys remain untouched. Complete candidates and runtime endpoints are still
validated; partial batches never become accepted states.

`where` appends at the current stage. On an existing breakdown it filters aggregate
output (HAVING-like), not raw input. Whole-question filtering retains all categories
and the same question denominator. Removing a response category still fails the
complete-category invariant, without silently changing the denominator. Missing
post-aggregate fields return `MISSING_FIELD`. A pre-aggregate predicate belongs
before breakdown in an authored complete state. This is not a new data-munging demo.

Audit classification:

| Boundary | Classification and result |
| --- | --- |
| Distribution color/focus/sort, axis labels, compound edits | Adapter gap; removed with a shared path and 21-case endpoint matrix |
| Ordinary aggregate post-filter | Needlessly narrow validation; permit filters on actual aggregate output fields |
| Fold presentation / derived color fields | Planner coverage was misused as permission; now retains pipeline and accepts available derived fields |
| Distribution negative/null counts, zero totals, missing/duplicate/unknown categories | Invalid declared count distribution; retained |
| Distribution facets, custom domains/nonlinear scales, structural grain transitions | Remaining implementation boundaries, not claims that these visualizations are inherently invalid |
| Unit bar without group, beeswarm without x, nonpositive size | Renderer dependencies / invalid arguments; retained |
| Unit grid/force/bar/beeswarm builder vs module.edit | Builder supports layouts; module edit exposes common methods only. An adapter gap remains; full update is available |
| Area stream series/offset/order | Real series dependency and supported enums; retained. Native-route fallback is planner coverage, not chart invalidity |
| Pie focus | Renderer/adapter capability absent; not relaxed by this Bar change |

The audit does not claim all chart methods or all seven semantic categories are
uniformly exposed through edit or downstream MCP. No downstream files, services,
open browser state or credentials were changed here.

LS21 verification completed against the frozen hash above:

- Full `npm test` gates passed (397 tests at that point). A further regression
  proves post-aggregate filter planning is deterministic, valid at every stage,
  one operation per stage, reversible and input-immutable; final unit suite: 398.
- `npm run render:check`: all four suites passed. The 21-case layout matrix checks
  preview nonmutation, accepted destination equality, visible counts, full question
  denominators and independent static-render geometry/color/opacity. Invalid final
  filters reject atomically. Existing axis/tick/scrub and custom-plugin coverage pass.
- The exact frozen archive was installed in an isolated consumer; all existing
  fixtures and the added 21-case layout edit matrix passed in Chromium.
- Pack consumer public exports/types and invariants passed.
- Website webpack production build, TypeScript and static export passed; 23 live
  examples verified. The two existing generated `::highlight` CSS warnings remain.

Evidence logs: `/tmp/visdelta-layout-audit-{all,final-unit,plan,render,installed,pack-check}.log`.
This establishes main-library/local-browser behavior. Actual downstream Realtime
agent interpretation, browser cache freshness and deployment remain separate
integration checks; none are claimed here.
