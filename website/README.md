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
| `npm run examples:check` | Verify every live example and playground demo against the real `delta()` |
| `npm test`               | Playwright tests against the exported site in `out/`                    |
| `npm run check`          | All of the above, as CI runs it                                         |

`npm run dev` and `npm run build` run `scripts/prepare.mjs` first. It fails with a
clear message if the library has not been built, and runs the example check.

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
  app/                       Routes: home, playground, gallery, docs, search, llms.txt, sitemap
  content/docs/              Documentation pages (MDX) and sidebar order (meta.json)
  examples/                  Live example modules and their registry
  components/live/           The transition player, example loaders, error boundary
  components/interactive/    Shared runtime: code evaluation, data loading, editor, scrubber
  components/playground/     The A/B playground and its curated demos (demos.ts)
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

The player (`components/live/transition-player.tsx`) mounts the real
`transition()` or `sequence()` when the chart is near the viewport, drives it
with `progress()`, `play()` and `pause()`, refreshes it with `resize()` on theme
changes, and calls `destroy()` on unmount. Below the chart it prints the
transition's `delta().stateChanges` as the **Δ** line.

### Playground

The playground (`/playground`) shows two editable states, A and B, and the real
transition between them. Edits re-run after a short pause; the chart moves from
what is on screen to the edited state, then the full A → B transition is ready
to play and scrub. A broken edit shows its error and keeps the last chart.
Readers can replace the dataset with their own CSV or JSON rows.

Its demos are a short, curated list in `components/playground/demos.ts`: one
idea each, on real data, with a one-line caption. Prefer a demo whose motion
teaches something over one that covers another API. `npm run examples:check`
runs `scripts/verify-playground.mjs`, which evaluates every demo's A and B with
the built library and fails if a demo draws no marks or reports no change.

Gallery idioms open in the playground as state A (`/playground#idiom=<id>`).

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

- **Build warnings.** Next.js's CSS optimizer reports two warnings about
  `::highlight(fd-search)` in Fumadocs UI's stylesheet. The selector is valid
  CSS (the Custom Highlight API); the warning is upstream and harmless.
- **Reader code runs in the page.** The playground and gallery evaluate the
  code in the editor with `new Function` in the reader's own tab, as the
  previous site did. There is no sandbox; nothing is sent anywhere.
- **Sequence theme tokens.** `sequence()` resolves CSS tokens on a hidden
  preparation mount attached to `document.body`, so tokens scoped to a chart's
  container do not reach sequence legs. The site sets its dark-mode `--vd-*`
  tokens on `.dark` (the document) for this reason.
- **Search index size.** The static search index is about 200 KB gzipped. It
  loads only when search is opened.
- **Legacy anchors.** Redirects preserve pages, not every in-page anchor of the
  old site.
- **Legacy VitePress site.** The previous site in `docs/` is still built by the
  root `npm test` (`docs:check`) and is no longer deployed. This site still
  reads from it: datasets in `docs/public/data/` (copied to `public/data/` by
  `scripts/prepare.mjs`), `demo.gif`, and the gallery and design-comparison
  corpora in `docs/.vitepress/components/`. Move those into the site before
  removing `docs/`.
  The semantic constitution (`docs/language-framework.md`) and the regression
  log remain the authoritative engineering records referenced by `AGENTS.md`.
