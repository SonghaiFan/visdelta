# Changelog

## Unreleased

- Keep transition runtime services scoped to the actual chart root when a
  sequence moves it between preparation and visible mounts. This preserves
  measured legend spacing and chart-scoped theme tokens across leg handoffs,
  reverse seeking and resizing, including custom plugins.
- Add native-state authoring and asynchronous mounting examples with an
  installed-package browser check for downstream MDX applications.

## 0.4.2 - 2026-10-18

- Share scene-owned motion tracks across independently bundled lazy chart modules,
  fixing invisible entering bars and lines through jsDelivr `+esm` (#11).
- Fit Line position domains to filtered observations while retaining topology,
  category colors and legends (#12). Explicit domains and shared panels keep
  their declared domain policy.
- Preserve explicit numeric and temporal position bounds, including Bar layouts,
  and omit data-endpoint tick injection on log axes (#13).
- Check browser distributions, playback, reversal, resizing and sequence endpoints
  in CI and before publishing.

## 0.4.1 - 2026-10-18

- Keep mobile navigation compact.
- Expand Studio browser coverage for drafts, DOM tracks and fixed-canvas Fit.
- Fix the npm CLI version used by the publishing workflow.

## 0.4.0 - 2026-10-14

- Publish the Fumadocs documentation site with shared Home, Docs and
  Playground/Gallery navigation. Studio views reuse the Fumadocs sidebar
  controls, with collapsible desktop navigation and mobile drawers; the IDE
  toolbar stays beside its example panel.

- A top legend moved out of the chart's SVG into a block above the canvas, as in
  Observable Plot, so `width` and `height` are the canvas alone and a legend no
  longer takes room from its top margin. The block is a second
  `<svg class="vd-legend-svg">` that exists only while there is a legend, placed
  after the canvas in the document and above it on screen, so
  `querySelector('svg')` is still the canvas and a chart without a legend has one
  SVG. A transition holds the tallest legend block of the pair, so the canvas
  never moves and a legend that appears or disappears only fades; with
  `height: "auto"` the canvas fills what the heading and legend leave. A style
  with `legendPosition: "right"` keeps its legend inside the canvas, and repeated
  panels keep theirs inside the panels. Charts with a legend are taller by the
  block, and their plot sits higher in the canvas than before. Chart types gain an
  optional `legendHeight(spec, viewport, margin)` that `defineChartType` supplies;
  the viewport gains `legendOutside`.
- `.title(text)` and `.subtitle(text)` on every chart state put a heading above
  the chart, in the figure and outside the canvas, so it never changes `width`
  or `height`. A change is Appearance `restyle` with property `title` or
  `subtitle`. In a transition the old text fades out over the first half and the
  new one fades in over the second, by the pair's authored progress, so reverse
  playback shows the same frames backward. The heading's room follows the same
  progress, so the first and last frames are the old and new states drawn alone
  and the canvas only slides in between (with `height: "auto"` the heading holds
  the room of the taller text instead). Headings are not part of route
  planning, and a figure with no heading takes no room for one: the previously
  always-present, always-empty title strip is gone, so charts without a title
  are shorter by that strip under the default theme. The unused `.vd-mark-name`
  element is removed, and the heading's padding and rule moved from
  `.vd-figure-header` to a new inner `.vd-figure-heading`.

- `transition()` and `sequence()` take `width` and `height`, each a number of
  pixels (fixed) or `"auto"` (follow the container), and `resize()` accepts both.
  As in Observable Plot they are the outer size of the canvas, margins included:
  a number is exactly that size, and `"auto"` is exactly the container's content
  box, with the figure's theme border (and, vertically, its empty title strip)
  giving way on that axis. A fixed width overflows a narrower container instead
  of shrinking the chart; `height: "auto"` fills a container that has a height
  and keeps the chart's own height in one that does not. Omitting them is unchanged: the container's width
  and the chart's own height. Two small changes ride along: an explicit `height`
  now releases the view's default `min-height` so it is the canvas height rather
  than a floor under it, and a sequence re-fits the leg on screen when its
  container changes in a dimension set to `"auto"`, and its `resize()` takes the
  same size options (previously the playground could not resize a replaying
  sequence's height).

- `VisualizationTransition.stageCount()` is now part of the public type: the
  number of serial route stages planned for a pair. `play({ duration })` already
  gives each stage `duration` ms, so a full play lasts `stageCount() × duration`.
  Runtime behaviour is unchanged.
- Moved the Playground and Gallery out of the documentation chrome into a
  full-screen studio with its own app bar. The playground is now an online
  editor: an examples tree filed by the seven state-change categories, `rows`
  and `chart.js` file tabs (editable CSV/JSON rows, line numbers, completions
  from the chart's own methods and the rows' fields), an auto-run switch, a
  draggable editor/preview divider, share links that run only when the reader
  presses Run, a status bar, and a real-time keyframe timeline whose clips show
  each leg's planned route stages.

- Rebuilt the documentation site from scratch with Fumadocs and a Next.js static
  export in `website/`, deployed to the same GitHub Pages URL. It adds a
  restructured information architecture (introduction, concepts, charts,
  guides, reference) in plain English, a homepage whose code edits itself and
  drives the real transition, a playground where every valid edit animates and
  kept keyframes replay as a sequence, with curated stories organized by the
  seven state-change categories, the idiom gallery, live
  examples driven by real example modules verified against `delta()`, type
  tables generated from the TypeScript source, static search, `llms.txt`, a
  sitemap and redirects from the previous VitePress URLs. The VitePress site in
  `docs/` is no longer deployed.
- Documented the defaults of `PlayOptions`, `SequencePlayOptions` and the
  controller members in JSDoc. Types and behaviour are unchanged.

- Fixed simple and grouped Bar domains clipping negative values: bars start at
  zero or below it. When zero is not the plot edge (negative values or an
  authored domain above zero) the category labels stay at the edge, clear of
  the bars, and remain pinned there while scrubbing.
- Reworked the design comparisons in the style of a published chart: every
  pair tells one illustrative story with a headline, description, notes and
  source, uses named data and readable year axes, and adds pairs for negative
  bars, 100% stacked areas, sorted dot plots, range plots and multi-answer
  surveys.
- Repeat keeps canvas height by default; opt-in `autoHeight` and `minHeight` reserve a stable route canvas. Standalone transitions automatically re-evaluate retained progress on container width changes.

- Keep repeated Line as the native Line type; add staged ordinary Line ↔ repeat motion with shared/independent scales, scrubbing and canonical reverse. Show the bridge in the Line Playground.

- Add native `.repeat()` composition with configurable x/y/grid direction and shared/independent numeric scales; stacked Bars transition into keyed repeated baselines through staged x/width and y/height geometry with play, reverse and scrubbing. Repeated Bars retain ordinary staged flip planning. Add runnable Repeat examples to every Playground chart type.
- Repeated panels reuse ordinary axis and grid styles, align grids with the mark coordinate frame, and reserve space for shared axis titles.
- Stage repeat rearrangements as whole panel containers first, then run each child chart's motion; reverse replays both levels backward.

- Add Pie/Donut through `visdelta/pie`, with keyed angular motion, label placement,
  value constraints and advisory design warnings.
- Add source-backed Not ideal / Better comparisons, runnable data and code,
  and forward/reverse/scrub arc demonstrations.
- Surface design hints in Gallery and add nonzero Area baseline and risky
  interpolation advice without changing authored charts.

- Added `editorialChartStyle`, an opt-in ink-on-paper chart style: warm
  neutral ink for undeclared marks, 0.75px hairline grids, 1px Point
  connectors, a flat figure and tabular tick numerals. It keeps the default
  categorical palette; `d3ChartStyle` remains the default.
- Reorganized the documentation site into four sections: Home (the live code →
  chart demo), Docs (philosophy and syntax tracks), Playground and a new
  Gallery of visual idioms grouped by mark. Each idiom is drawn live from
  bundled data, opens in a full-size viewer with its code, and can be edited
  in the Playground. The Playground chart floats at the top right by
  default and can be docked beside the code.
- Extracted the site's shared visual values into three-tier design tokens
  (`website/app/global.css`), documented on a Design tokens page.

- Added canonical operation planning for supported Bar, Point, Line, Area and
  Unit declarations. Routes use complete valid states, edit one semantic
  operation per stage, and reuse the same path in reverse. Chart modules own
  their supported subsets and native fallback behavior.
- Normalized equivalent defaults and connector declarations, derived aggregate
  bindings and identity metadata, and validated intermediate data fields and
  layout dependencies.
- Fixed cached reverse-stage endpoint cleanup and Unit force endpoint reuse,
  preventing a final-frame layout jump without changing forward completion.
- Added real-browser route and regression coverage, a live Bar Grain reference
  example, package-consumer checks, and [review lessons](notes/2026-10-11-codebase-review.md).

## 0.3.0 - 2026-09-17

This release adds normalized state-change inspection and aligns the package
with its published documentation site.

- `delta().stateChanges` describes Data, Grain, Encoding, Coordinate, Layout,
  Attention, and Appearance changes without prescribing animation order.
- `homepage` points at the docs site, <https://songhaifan.github.io/visdelta/>,
  which now opens with a live showcase and a README demo recording.
- Documented both browser routes without a bundler: versioned ESM files through
  jsDelivr's `/+esm` endpoint (the plain `dist/*.js` URLs cannot resolve their
  `d3-*` imports in a browser) and the self-contained global script, with a
  complete slider-driven page in `examples/cdn-demo.html`.

## 0.2.0 - 2026-09-16

VisDelta is a greenfield library. There is no compatibility layer or migration
API in this release.

### Language and runtime

- Added immutable chart states, `delta(from, to)`, and a seekable
  `transition(from, to)` controller.
- Added exact progress control, play, pause, reverse, resize, and destroy.
- The runtime keeps no registry of mounted charts: `transition()` and
  `sequence()` are the whole controller API, and the application owns the
  current state. There is no `mount()`/`select()`.
- Renderers animate through recorded property tracks (`motion()`), never
  through D3's scheduler; renderers import the `d3-*` modules they use and
  receive no D3 object.
- Defined one semantic rule for every chart: each rendered frame keeps marks,
  scales, axes, ticks, and grid lines consistent.
- Defined one membership order: exit marks before the scale changes; change the
  scale before entering marks appear. Reverse traverses the same frames.
- Separated `.where()` (membership), `.highlight()` (attention), and `.focus()`
  (camera only).
- Added tidy-data input from arrays, `{ url }` sources, and `{ name }`
  references resolved by `transition()`. A bare string is rejected as ambiguous.
  Declared transforms run in order with no extra dependency; VisDelta does not
  clean or reshape undeclared data.
- Selectors for `where()`, `highlight()`, and `focus()` are objects only; there
  is no string expression grammar. Chart states are JSON-safe by construction
  (`toSpec()` serializes dates), and a revived spec is accepted wherever a state is.
- `transition()` and `sequence()` require an explicit `target`.
- Added quantitative, nominal, ordinal, and temporal type detection.

### Chart modules

- Added peer `area`, `bar`, `line`, `point`, and `unit` modules. Core contains no
  chart-name branches.
- Added lazy chart loading and public plugin registration. A chart state carries
  its own module, so importing a new chart type is sufficient to use it.
- Kept chart-specific geometry, matching, transition planning, axes, and
  rendering inside each chart module.
- Added D3 curve names directly for Line and Area.
- Added key-aware Line and Area path transitions, honest gaps, staged
  add/remove, and reversible split/merge.
- Added Point detail/summary motion and optional transition-only gooey blending.
- Added Unit `grid`, centered `force`, categorical `bar`, and `beeswarm` layouts. Unit matching
  preserves explicit keys first, then globally minimizes unmatched travel.
- Centered Unit bar stacks on their category ticks.

### Documentation and packaging

- Added real-data editable labs for every chart type and real-browser regression
  coverage for forward, reverse, and arbitrary progress.
- Reduced the documentation to one language-and-implementation guide, one API
  reference, focused chart/data/runtime pages, and the labs.
- Removed the earlier story/composition layer, scroll actions, compatibility
  themes, duplicate design essays, and generated browser artifacts from source.
- Added focused package entries for Core, each chart type, transitions, plugins,
  chart styles, browser use, and three CSS themes.

The implementation rules are documented in
[docs/language-framework.md](docs/language-framework.md).
