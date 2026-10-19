# VisDelta website

The documentation site for VisDelta, published at
<https://songhaifan.github.io/visdelta/>. It is a [Fumadocs](https://fumadocs.dev)
site on Next.js, exported as static HTML and deployed to GitHub Pages.

It is a separate npm project. Its dependencies never reach the published
`visdelta` package, and the library build does not depend on it.

## Run it locally

The site renders live examples with the library's built output, so build the
library first:

```sh
# repository root
npm ci
npm run build

# website/
cd website
npm ci
npm run dev        # http://localhost:3000
```

| Script                   | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`            | Development server with hot reload                                     |
| `npm run build`          | Static export to `out/`, plus legacy redirects (`scripts/postbuild.mjs`) |
| `npm start`              | Serve `out/` the way GitHub Pages does                                 |
| `npm run lint`           | ESLint (Next.js rules)                                                  |
| `npm run types:check`    | Generate MDX and route types, then `tsc --noEmit`                       |
| `npm run examples:check` | Verify every live example and playground story against the real `delta()` |
| `npm test`               | Playwright tests against the exported site in `out/`                    |
| `npm run check`          | All of the above, as CI runs it                                         |

`npm run dev` and `npm run build` run `scripts/prepare.mjs` first. It fails with a
clear message if the library has not been built, and runs the example check.
It copies `../examples/templates/` unchanged into `public/templates/`; edit the
repository HTML source, not that generated copy. `llms.txt` in the repository
is also the shared preamble for both agent endpoints. The agent acceptance tests
check those exports and the same runnable template.

Browser tests use Playwright's Chromium. Run `npx playwright install chromium`
once, or point `VISDELTA_CHROME_PATH` at an existing Chromium binary.

### Base path

GitHub Pages serves the site from `/visdelta/`. Set the base path at build time:

```sh
DOCS_BASE_PATH=/visdelta SITE_URL=https://songhaifan.github.io/visdelta npm run build
```

Without `DOCS_BASE_PATH` the site builds for the domain root. The build records
its base path in `.next/export-base-path`; `npm start` and `npm test` read it, so
they serve whatever the last build produced.

## How it is organized

```text
website/
  app/                       Routes: home, docs, search, llms.txt, sitemap; (studio)/ holds
                             playground, gallery and liveshow under their own full-screen layout
  content/docs/              Documentation pages (MDX) and sidebar order (meta.json)
  examples/                  Live example modules and their registry
  components/live/           The transition player, example loaders, error boundary
  components/interactive/    Shared runtime: code evaluation, data loading, editor, scrubber
  components/studio/         The studio app bar (Playground, Gallery, Docs, theme)
  components/playground/     The playground editor: examples tree, rows panel, timeline,
                             share links and preferences, and curated stories (demos.ts)
  components/gallery/        The idiom gallery
  components/home/           Homepage: self-editing code pipeline and scroll story
  components/demos/          Interactive figures used inside docs pages
  lib/                       Source loader, shared constants, example-source formatting
  scripts/                   prepare, postbuild, example and demo verification, static server
  tests/                     Playwright tests
  source.config.ts           MDX configuration, including generated type tables
```

### Content

Pages live in `content/docs/`. The URL follows the file path, and each folder's
`meta.json` sets the sidebar order. The root `meta.json` defines the sections:

- **Introduction**: overview, installation and quick start
- **Concepts**: explanations of the model (`concepts/`)
- **Charts**: one page per chart module (`charts/`)
- **Guides**: task-oriented how-tos (`guides/`)
- **Examples**: sidebar links to the Playground and Gallery pages, which are
  full-width routes in `app/(home)/`
- **Reference**: API signatures and types (`api/`)

Keep each kind of page to its job. A concept page explains, a guide solves one
task, and a reference page states signatures. Link between them instead of
repeating descriptions.

Every page needs a `title` and a `description` in its frontmatter. They become
the page title, meta description, search entry and `llms.txt` entry.

Components available in MDX without imports (see `components/mdx.tsx`):

| Component                         | Use                                                    |
| --------------------------------- | ------------------------------------------------------ |
| `<LiveExample id="…" />`          | A live transition with its exact source; `code={false}` hides the source |
| `<StateChangeCatalogue />`        | The seven state-change categories                      |
| `<TransitionWorkbench />`         | One transition with its code, `delta` and spec         |
| `<BarGrainDemo />`, `<RepeatDemo />`, `<ChartStyleGallery />`, `<DesignComparisons />` | Figures for specific pages |
| `<auto-type-table path name />`   | A type table generated from the library's TypeScript source |
| `Callout`, `Cards`, `Card`, `Steps`, `Step`, `Tabs`, `Tab`, `Accordions`, `Accordion`, `TypeTable` | Fumadocs UI components |

A code fence tagged `npm` renders as npm/pnpm/yarn/bun tabs.

### Live examples

A live example is a module in `examples/` that exports `from` and `to` (a pair)
or `states` (a sequence), written with the public API exactly as a reader would.
The page shows the module's own source, so the code a reader copies is the code
that rendered the chart.

To add one:

1. Create `examples/<id>.ts` with inline data. Import builders from
   `visdelta/<chart>`.
2. Register it in `examples/registry.ts` with a title, description, chart type
   and primary state-change category.
3. Add its loader to `components/live/loaders.ts`.
4. Run `npm run examples:check`. It fails if the files, registry and loaders
   disagree, or if `delta()` does not report the declared category.
5. Use it with `<LiveExample id="<id>" />`.

The player (`components/live/transition-player.tsx`) renders `Chart` with a state array
from `visdelta/react` when the chart is near the viewport, drives it
with `progress()`, `play()` and `pause()`, refreshes it with `resize()` on theme
changes; the React components own controller replacement and destruction. Below the chart it prints the
transition's `delta().stateChanges` as the **Δ** line.

### Playground

The playground (`/playground`) is an online editor for VisDelta. It and the
gallery live in a full-screen **studio** (`app/(studio)/`) with their own app
bar instead of the documentation chrome; both are the same Next.js build,
running the real library.

The workspace has a toolbar, an examples tree, the editor, the preview, a
keyframe timeline and a status bar. On wide screens the editor and preview sit
side by side with a draggable divider (arrow keys nudge it; double-click resets
it); on narrow screens the examples become a drawer and the page stacks rows,
code, then the chart.

- **Files.** `rows` is the dataset the code sees: a table, or its CSV/JSON
  source, which can be edited or replaced by an upload. `chart.js` is the chart
  code, with line numbers and completions: methods of the chart's own builder
  after a dot (read from the factory's prototype), field names of the rows
  inside strings.
- **Every valid edit is a transition.** Shortly after typing stops, the code
  runs and the chart moves from what is on screen to the new state. If more
  edits arrive while the chart is moving, only the newest one runs next, so the
  motion never jumps. A broken edit shows its error and keeps the last chart.
  With **Auto-run** off, edits wait for **Run** (⌘/Ctrl+Enter) and land as one
  transition; the switch is remembered per viewer.
- **Keyframes.** **Keep** (⌘S) updates the keyframe at the playhead, or inserts a new frame
  between neighboring keyframes when the playhead is between them. Code edits
  retain that position. The **+** beside the snapshots explicitly adds a frame
  at the end. Kept keyframes replay as one real `sequence()` on a real-time track: each leg is a
  clip as long as it plays, and a lane below shows the route stages VisDelta
  planned for it (`stageCount()`; `play()` gives each stage the same duration).
  Timeline keyframe clicks seek and pause. Snapshot clicks play to that frame.
  The code and the Δ line
  follow the playhead, and the next edit moves on from the keyframe on screen.
- **Chart size.** **Fit** and **Fixed** use the same fixed canvas width and
  height (640 × 400 by default). **Fit** scales the complete figure uniformly
  into the preview; changing its container does not recalculate chart geometry
  or simulation. **Fixed** displays the canvas at its original pixel size.
  The choice and dimensions are remembered per viewer. **Float** makes the
  preview a window over the editor. In Fixed mode, its dimensions equal the
  canvas W/H and its controls sit outside that area. Dragging a floating edge
  edits W/H through the same controls; moving or docking the window preserves
  them. The bottom-right grip marks the resize corner; dragging shows the live
  pixel dimensions. Floating W/H inputs open from the dimensions control in its
  compact toolbar. Floating needs the wide layout, so phones stay docked.
- **Share** puts the code, and the rows when they were edited or uploaded, in
  a compressed `#share=` hash and copies the link. Code from a link is shown
  but does not run until the reader presses Run. Rows too large for a URL are
  left out, and the reader is told.

Its stories are a short, curated list in `components/playground/demos.ts`,
filed under the seven state-change categories, which are the playground's
primary navigation. A story is starting code plus a few edits (add a chained
call, remove one, or rewrite text in place). The playground types each edit,
animates it and keeps it as a keyframe; under reduced motion it applies them
all at once. `npm run examples:check` runs `scripts/verify-playground.mjs`,
which evaluates every version of every story with the built library and fails
if a version is invalid, an edit changes nothing, a story never emits its
category, or a category has no story.

Gallery idioms open in the playground as editable code (`/playground#idiom=<id>`).

### Design language

The site's visual identity is three colours defined in `app/global.css`:
**A** (`--color-state-a`, blue), **B** (`--color-state-b`, coral) and the
**Δ** amber (`--color-delta`) that marks what changed: the changed code line,
the scrubber head and the Δ line. Everything else is ink on paper. Keep
corners small, motion purposeful and copy plain; let the chart carry the page.
Bars always have square corners.

Every animated figure respects `prefers-reduced-motion`: nothing plays on its
own, and charts change in one step until the reader presses play or scrubs.

### API reference

Type tables are generated at build time from the library's TypeScript source by
[`fumadocs-typescript`](https://fumadocs.dev/docs/integrations/typescript):

```mdx
<auto-type-table path="src/transition.ts" name="TransitionOptions" />
```

`path` is relative to the repository root. Table descriptions come from JSDoc
comments in `src/`, so improve a description there, not in the MDX.

TypeDoc was considered and not adopted. It documents every exported symbol,
including the plugin SDK's internals, as generated pages that don't fit the
docs' structure. Generated tables for the types readers actually use, plus
hand-written signature summaries, give less drift at the same readability.

### Search, AI and SEO

- **Search** uses the Fumadocs static Orama index, exported at build time to
  `/api/search` and queried in the browser. No server is needed.
- **`/llms.txt`** lists every page with a link to its Markdown source;
  **`/llms-full.txt`** is the whole documentation as one file; each page's
  Markdown is at `/llms.mdx/docs/<path>/content.md`. Pages also have
  **Copy Markdown** and **Open in…** actions.
- **SEO**: every page has a canonical URL, a description, Open Graph metadata,
  and an entry in `/sitemap.xml`. `robots.txt` points to the sitemap.

### Legacy URLs

The previous VitePress site used URLs such as `/visdelta/getting-started.html`.
`scripts/postbuild.mjs` writes a small redirect page for each of them. Add an
entry to `legacyRedirects` if you move a page.

## Deployment

`.github/workflows/docs.yml` deploys on every push to `main`. It builds the
library, then runs `npm ci` and `npm run build` in `website/` with
`DOCS_BASE_PATH=/visdelta`, and uploads `website/out` to GitHub Pages. The
`website` job in `.github/workflows/ci.yml` runs `npm run check` on every pull
request.

To deploy elsewhere, build with the target's base path and `SITE_URL`, and serve
`out/` as static files. The host must resolve `/path/` to `/path/index.html`.

## Dependencies

- `visdelta` is linked from the repository root (`file:..`). Its own `d3-*`
  dependencies resolve from the root `node_modules`, so install the root first.
- The site's TypeScript is 6.0, because `typescript-eslint` does not support
  TypeScript 7 yet. `fumadocs-typescript` brings its own TypeScript 7 to
  generate type tables. Move the site to TypeScript 7 once `typescript-eslint`
  supports it.

## Known limitations

- **The site runs the built library.** It imports `visdelta` from the repository's
  `dist/`, so rebuild it (`npm run build` in the root) after pulling changes to
  `src/`. `predev`, `prebuild` and `types:check` stop with that instruction when
  `dist/` is older than `src/`, because an out-of-date library draws nothing for
  options it does not know (set `VISDELTA_ALLOW_STALE_DIST=1` to skip the check).
- **Open the dev server as `localhost` or `127.0.0.1`.** Next blocks dev resources
  requested from any other origin, and then no page hydrates (the playground
  stays on "Loading"). Add another host to `allowedDevOrigins` in
  `next.config.mjs`.

- **Build warnings.** Next.js's CSS optimizer reports two warnings about
  `::highlight(fd-search)` in Fumadocs UI's stylesheet. The selector is valid
  CSS (the Custom Highlight API); the warning is upstream and harmless. During
  development, `next.config.mjs` filters this specific parser diagnostic with
  `turbopack.ignoreIssue`, matching its file, title and description. Other
  diagnostics remain visible; production CSS optimizer warnings may still appear.
- **Reader code runs in the page.** The playground and gallery evaluate the
  code in the editor with `new Function` in the reader's own tab, as the
  previous site did. There is no sandbox; nothing is sent anywhere. Code that
  arrives in a share link runs only after the reader presses Run.
- **Sequence theme tokens.** `sequence()` resolves CSS tokens on a hidden
  preparation mount attached to `document.body`, so tokens scoped to a chart's
  container do not reach sequence legs. The site sets its dark-mode `--vd-*`
  tokens on `.dark` (the document) for this reason.
- **Search index size.** The static search index is about 200 KB gzipped. It
  loads only when search is opened.
- **Legacy anchors.** Redirects preserve pages, not every in-page anchor of the
  old site.
- **Source data and engineering records.** Shared CSV inputs live in the
  repository-root `data/` directory. `scripts/prepare.mjs` copies them into
  `public/data/` for the static site. The semantic constitution and transition
  regression log remain in root `docs/` as authoritative engineering records
  referenced by `AGENTS.md`; the reader-facing documentation lives here in
  Fumadocs.

### Keyframe previews and category lanes

Hover a numbered timeline marker, or focus it with the keyboard, to see a still
preview of its saved state. Hovering leaves playback and code unchanged; click
to seek to the keyframe without playing, and press Escape to dismiss the preview. Touch taps
continue to select keyframes directly. Previews fit the full figure into a
480 × 300 frame, including its top legend.

Element lanes use the real SVG ancestry captured during phase inspection,
including tag names and all classes (such as `g.tick` and `line`). Repeated marks with the same ancestry share a lane. All element groups that change anywhere in the saved sequence remain in the tree,
with necessary ancestors retained and unchanged siblings omitted. Groups and
intervals that change only in other stages are dimmed; the current stage follows
the playhead when playing or seeking. The left gutter shows their DOM ancestry with indented parent rows,
aligned with the animation lanes; identical labels under different parents remain
separate. Blocks use recorded property intervals, merging overlaps while
preserving gaps; clicking a block opens the stage inspector at its midpoint.
Equal-endpoint ordinary properties are omitted; custom tweens remain because
their internal movement is opaque. Immediate writes, unrecorded node lifecycle
changes and HTML headings are outside this recording coverage.
The stage strip retains the
actual planned stage timing. The ruler is always visible, with a default scale of **160 pixels per second**. Short stories leave unused room; long stories scroll horizontally. Element lanes are visible in the default view. **Details** opens the stage inspector directly. A story reserves each leg before playing it, and its playhead follows the chart controller at the same 0.9 seconds per stage used for replay. Clip widths remain fixed during playback; new clips fade in. Pausing or scrubbing takes control from the story. Code changes only when an authored keyframe is reached.

Open **Details** to inspect the saved timeline and expand its compiled SVG
phases. Each phase lists the element, recorded attribute/style/text track,
phase-endpoint values, current value and scheduled interval. Select an element
row to outline its mounted node, filter by element or property, or use **Show
phase midpoint** to seek. The timeline and inspector share one scrollable panel. Drag its top edge to resize it from 124 pixels up to the available viewport space, reserving 160 pixels for the workspace above the toolbar and status overhead (124 for compact and 320 for Details by default); arrow keys adjust it, Home/End select the limits, and double-click resets it. The chosen height is remembered. Opening the inspector preserves the panel and chart heights. On narrow screens the code pane has a stable viewport-based height and scrolls internally as lines are added.
Custom tweens are labelled explicitly: their nested properties are not exposed.
Immediate renderer writes and node insertion/removal are not property tracks;
External page captions are outside the chart. These limits
are also shown under **Coverage and timing**, rather than guessed from categories.

While the inspector is open, the timeline's stage strip shows numbered, named intermediate stages. Labels prefer the planner's exact declaration
operation. Hover to read the complete action and time range; click or
press Enter to seek to that stage's midpoint and inspect it. Authored keyframes keep their own
numbered diamond markers.

The editable time readout and ruler seek without playing. Focus the track and
use +/−/0 to change its scale; Shift+←/→ seeks to adjacent stage boundaries.
Dragging the ruler snaps within eight pixels of a boundary unless Alt is held.
Category labels stay fixed beside the scrollable time rows. Clicking a stage
opens its recorded phases at the midpoint. Snapshot clicks and the Play button
control playback. Attribute interval bars show local phase timing; categories
describe whole-transition membership.

Timeline stage captions prefer `stageOperations()` metadata: the declaration slot and its previous/next values. `unset` means the explicit declaration is absent, not a guessed renderer default. Chart-authored or refined stages without a single planner operation retain a clearly prefixed “Chart stage” semantic summary. Category lanes still show the seven semantic categories.

Stage captions describe planner operations in plain language (for example, “Use petal length for horizontal position” and “Remove the grid column setting”). Select a stage and expand **Exact configuration** to see the original slot and before/after values. Labels describe declaration changes, not a promise of visible motion.

Swarm uses `.layout("beeswarm", { x: "petalLength" })`. Unit layout type, columns and x/y channels form one planner operation, so the timeline shows one layout stage whose internal animation still moves horizontally before falling. Category lanes still describe semantic effects of that operation. Swarm keeps `.size(6)` across both endpoints; mark size is independent of layout. Later x/y assignments replace earlier bindings, including layout options.

The timeline uses a transport header, time navigation, and a dedicated track canvas. On desktop, selected-stage context sits in a 280-pixel side panel; on narrow screens it follows the tracks.

### Draft keyframes and ordering

Editing code marks the current snapshot as a draft, or shows an inserted draft
between snapshots when the playhead is between keyframes. The draft preview uses
the latest successfully evaluated code. Moving the playhead or starting playback
asks whether to save the frame, discard the edit, or keep editing. Invalid code
keeps the draft open. Command/Ctrl+S saves at the current editing position.
Drag a saved snapshot onto another to reorder it, or use Alt+Left/Right on a
focused snapshot. Reordering replans the affected neighboring transitions.

Snapshot selection reflects the exact editing position: an authored keyframe
highlights its snapshot; a position between keyframes highlights neither and
shows an insertion caret in their gap. Editing replaces that caret with the
unsaved draft snapshot at the same insertion position.

### Liveshow

`/liveshow` demonstrates persistent JSON updates with local presets (no AI
connection). The source data and seven category presets live in
`components/liveshow/presets.ts` and are checked by `examples:check`. The page
uses `view.edit()` with revisions and request IDs; Grain uses a complete
`view.update()` state. Both share the latest policy. Browser tests cover retries,
conflicts, bursts, invalid JSON, cleanup, idle rendering and narrow layouts.
