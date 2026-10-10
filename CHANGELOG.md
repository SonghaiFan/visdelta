# Changelog

## Unreleased

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
  (`docs/.vitepress/theme/tokens.css`), documented on a Design tokens page.

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
