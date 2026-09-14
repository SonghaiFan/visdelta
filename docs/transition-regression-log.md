# Transition Regression Log

This document records transition problems that exposed a missing semantic rule.
It is not a changelog. Each entry preserves the failed assumption, the invariant
that replaced it, and the regression evidence that must remain true.

## Entry template

- **Observed:** What the user could see, including forward and reverse behavior.
- **Wrong model:** The assumption or local patch that failed.
- **Root cause:** The missing semantic or architectural rule.
- **Invariant:** The single rule future implementations must preserve.
- **Resolution:** Where the model was corrected.
- **Regression evidence:** Automated and manual paths that protect the rule.

## 2026-09-14 — Reaggregation was treated as one opaque M-to-N morph

- **Observed:** Changing the grouping field could not preserve a clear account
  of which source records moved from each old aggregate into each new aggregate.
- **Wrong model:** Asking endpoint mark identity alone to explain an `M -> N`
  transition, or requiring a grouping tree to become the identity model.
- **Root cause:** Endpoint aggregates are different partitions of the same
  source records. Their correspondence exists at the non-empty intersections of
  those partitions, below either endpoint's visible grain.
- **Invariant:** Datum identity remains stable. Core derives a bipartite lineage
  graph and its connected components from the joint grain; the component
  cardinality determines `update`, `split`, `merge`, `reaggregate`, `exit`, or
  `enter`. A tree may describe grouping structure but does not own identity.
- **Resolution:** Reaggregation exposes the common-refinement lineage to chart
  plugins. Bar composes the result from existing split, update, and merge motion
  rather than inventing an aggregation-operator-specific animation.
- **Regression evidence:** Lineage tests cover many-to-many reaggregation,
  disconnected mixed components, stable datum keys, and non-additive fallback.

## 2026-09-14 — Ungroup had no single layout rule

- **Observed:** A split could ambiguously produce grouped bars or stacked bars,
  making the visual meaning depend on an implicit implementation choice.
- **Wrong model:** Treating stack as the default visual meaning of ungrouping.
- **Root cause:** A direct split already has an authored target layout, while a
  synthetic common-grain stage has no endpoint layout to follow. These are
  different planning cases.
- **Invariant:** A direct split follows the target layout. A synthetic
  reaggregation stage uses grouped marks as Bar's common visual presentation.
  Stacked marks come only from an explicit layout or the additive `sum`/`count`
  bridge between a total and grouped common-grain marks.
- **Resolution:** Bar's additive route is `total A -> stacked A -> grouped A ->
  grouped B -> stacked B -> total B`. Other aggregate operators use the ordinary
  fallback until they have an explicitly designed semantic route.
- **Regression evidence:** Unit and browser tests distinguish direct split from
  synthetic reaggregation and verify the stacked/grouped phase sequence.

## 2026-09-14 — Divider timing differed between split and reverse merge

- **Observed:** In Bar reaggregation, the divider appeared at a different time
  for `total -> stacked` and for the reversed `stacked -> total` leg. A divider
  could be visible near one endpoint while the symmetric frame near the other
  endpoint had no divider.
- **Wrong model:** Treating the merge-side divider as a special visual case and
  giving it separate opacity, geometry, or timing logic.
- **Root cause:** Only the full endpoint transition was canonicalized. Adjacent
  legs introduced by the intermediate-stage planner were rendered in their
  authored direction, so the final merge did not reuse the canonical split
  primitive.
- **Invariant:** Every adjacent phase is independently canonicalized. A reverse
  phase is the exact same frame function evaluated at complementary progress:
  `F_reverse(p) = F_forward(1 - p)`. Direction-sensitive stagger order is also
  reversed. Divider paths contain no split/merge exception.
- **Resolution:** `view-renderer` canonicalizes every intermediate pair and
  records whether the phase is reversed. Both live seeking and cached transition
  frames evaluate reversed phases with `1 - localProgress`. Bar seams now use
  only the lineage split ground truth.
- **Regression evidence:** Browser tests assert the same lineage frames in both
  directions, verify that the final phase is a reversed canonical split, and
  compare divider timing at symmetric progress near the two endpoints. Manual
  verification was completed in Transition Lab's `reaggregate` scenario.

## 2026-09-14 — Line's x example discarded time-series semantics

- **Observed:** The Line lab changed x from trading date to opening price. The
  result doubled back horizontally and read as an accidental price-versus-price
  trajectory instead of a time series.
- **Wrong model:** Reusing a scatter-plot-style “change x field” example merely
  to demonstrate that the x channel can animate.
- **Root cause:** A technically valid channel change was allowed to override the
  chart type's primary reading convention. For a time-series Line chart, x order
  carries temporal meaning and determines how observations connect.
- **Invariant:** Representative Line examples keep time on x unless the explicit
  purpose is to teach a non-temporal trajectory. Changes to x should normally
  express a temporal-domain or temporal-granularity change.
- **Resolution:** The first example now moves from daily observations to weekly
  OHLC summaries while retaining `date` on x. The combined example changes daily
  close to weekly high without replacing the temporal axis.
- **Regression evidence:** The Line browser test verifies that both examples keep
  the `Date` x-axis, reduce the observation count at weekly grain, retain one
  connected line, and apply the intended y measure.

## 2026-09-14 — Line dots obscured the default path reading

- **Observed:** Every Line endpoint rendered a dot for every observation. The
  dots made an ordinary time series look like a point chart and distracted from
  the path as the primary object.
- **Wrong model:** Treating observation circles as a permanently visible Line
  mark because the renderer needs their keyed geometry internally.
- **Root cause:** Renderer identity and visible chart grammar were conflated.
  The transition engine needs per-observation coordinates even when the author
  did not ask the reader to see a point mark.
- **Invariant:** A Line endpoint is path-first. Dots are visible only when
  explicitly authored with `.pointSize()`. Internal keyed circles may remain at
  radius and opacity zero.
- **Resolution:** Default points are now invisible while their keyed geometry
  remains available to path matching and tooltips.
- **Regression evidence:** Browser tests verify invisible default dots and exact
  reverse playback for merge.

## 2026-09-14 — Transition guides invented undeclared Line marks

- **Observed:** The first path-first revision removed endpoint dots but added
  anchor dots, a dashed line treatment, and a visible aggregate reference path
  during split/merge.
- **Wrong model:** Assuming temporary explanatory marks were allowed because
  they made correspondence easier to inspect.
- **Root cause:** The transition renderer treated its internal correspondence
  geometry as authored visual grammar. The user had declared lines, not dots,
  dashes, or a guide line.
- **Invariant:** A transition must not invent observation marks or change the
  authored data-line style. A temporary dashed line-shaped reference is valid when it
  previews the actual aggregate target, just as a Bar or Area divider previews
  an imminent structural boundary.
- **Resolution:** Line split/merge keeps both series as complete solid paths and
  adds one thinnest-weight, reverse-contrast dashed aggregate reference path
  using the same visual grammar as Bar and Area dividers. During merge, the
  reference grows along its path before motion so the mean can be compared with the original series; the
  series then attach along x with slow-then-fast attraction and resolve crisply
  to one aggregate line. Split is the exact reverse. No dots are introduced,
  and the authored data lines remain solid.
- **Rendering note:** The growing reference uses a path-shaped SVG mask. It
  therefore uses the same `--vd-grid` theme token as chart gridlines rather
  than `mix-blend-mode: difference`; every chart style and color scheme keeps
  the guide visually subordinate without relying on SVG backdrop compositing.
- **Regression evidence:** Pure geometry tests lock the acceleration and x-order
  attachment. Browser tests require the solid reference preview, reject dots
  on data lines, verify the reference draw, and preserve exact split/merge
  reversibility.

## 2026-09-14 — Aggregate axes hid the calculation semantics

- **Observed:** A rolled-up revenue axis was still labelled `Revenue`, even
  though every displayed value was the sum of multiple revenue records.
- **Root cause:** Bar preserved the authored measure title after adding the
  aggregate transform, so the data operation and its visual label diverged.
- **Invariant:** Default labels describe the resolved measure semantics. Bar
  `sum` and `count` produce `Sum of <measure>` and `Count of <measure>`; an
  explicit operation title remains authoritative.
- **Resolution:** The shared label layer now resolves aggregate titles, while
  Bar decides when that semantic label belongs on its value axis.
- **Regression evidence:** Authoring tests cover sum, count, explicit-title,
  breakdown, rollup, and duplicate-prefix cases.

## 2026-09-14 — The homepage editor accepted an unrenderable state

- **Observed:** Code could be syntactically valid and leave `chart` defined,
  yet produce a blank output when multiple records occupied one Bar category.
  The editor incorrectly reported `Ready, no visual change`.
- **Root cause:** The editor validated JavaScript and the chart interface but
  did not observe chart-plugin validation emitted by the real renderer.
- **Invariant:** A state becomes a transition endpoint only after its terminal
  frame renders successfully. Failed candidates never replace the last valid
  canvas or advance transition identity.
- **Resolution:** The live editor renders each candidate endpoint off-screen,
  reads the renderer's canonical error, and commits the candidate only when it
  is valid. Grain errors are shown below the editor with the existing
  `breakdown()` and `rollup()` guidance.
- **Regression evidence:** Homepage browser tests reproduce duplicate quarter
  rows at desktop and mobile widths, require the grain error, preserve the last
  valid internal endpoint for recovery, and verify the transition count does
  not advance.

## 2026-09-14 — The homepage hid the data behind `rows`

- **Observed:** The live example began with `bar(rows)` but did not show what
  `rows` contained. Readers could not inspect the input grain before changing
  grouping or aggregation code.
- **Invariant:** An interactive data-transformation example exposes the tidy
  data represented by its current state, including its declared transforms.
- **Resolution:** `ChartState.rows()` materializes the state through VisDelta's
  shared Arquero runtime. The homepage table updates from six source rows to the
  two rolled-up year rows and back as the author selects a chart type or edits.
- **Regression evidence:** Desktop and mobile browser tests require the Bar
  rollup table and the Line source table, with their corresponding row counts.

## 2026-09-14 - The homepage playground began as a Bar-only editor

- **Observed:** The toolbar exposed Bar operations only, and the editing surface
  was a plain textarea without JavaScript syntax color or normal code-editor
  behavior. The Code pane also preceded the visualization at every width.
- **Root cause:** The first homepage demo optimized for one transition story
  instead of establishing the five chart modules as peer entry points.
- **Invariant:** The homepage uses one tidy dataset to provide a valid, editable
  starting state for every built-in chart type. Changing chart type establishes
  a new initial endpoint because Core rejects transitions across chart types.
  Within one type, subsequent code edits remain animated transitions.
- **Resolution:** The toolbar now selects Bar, Line, Area, Point, or Unit starter
  code. CodeMirror provides JavaScript parsing, syntax color, line numbers,
  selection, history, bracket support, and keyboard editing. Visualization is
  left of Code on desktop and above Code on mobile.
- **Regression evidence:** Homepage browser tests render all five presets at
  desktop and mobile widths, require multiple syntax-token colors, assert the
  responsive pane order, and retain code execution and error recovery.

## 2026-09-14 - A stale visualization looked like valid output

- **Observed:** When the current code failed validation, Visualization continued
  to show the last successfully rendered chart beside the new error.
- **Wrong model:** Preserving the last valid transition endpoint was treated as
  permission to keep presenting its pixels as the current output.
- **Invariant:** The visualization pane represents only the current code. An
  invalid state has no chart output, even when the runtime retains a previous
  valid endpoint internally for recovery after the code is fixed.
- **Resolution:** Any editor or renderer error hides the chart surface, labels
  the output as unavailable, and shows a neutral empty state. Valid code removes
  the empty state and reveals the next committed visualization.
- **Regression evidence:** Desktop and mobile browser tests require the stale
  marks to be hidden and the no-output state to be visible while the editor
  reports the canonical grain error.

## 2026-09-14 - An old partial line could overwrite newer code feedback

- **Observed:** Pressing Enter ran the editor before CodeMirror had committed
  the latest document change. A renderer error could therefore name an old
  partial field such as `ntry` while the visible code already read `country`.
- **Root cause:** Enter was handled as a DOM key event rather than a completed
  document transaction. New edits also did not invalidate work already in
  flight.
- **Invariant:** Editor feedback always describes the visible document version.
  A line executes only after its document transaction completes; every input
  immediately invalidates earlier candidate execution.
- **Resolution:** Normal Enter now schedules execution after the corresponding
  CodeMirror document update. Ordinary edits wait briefly for typing to settle.
  The version guard advances at input time, so incomplete or older candidates
  cannot commit errors or output after newer text arrives.

## 2026-09-14 - Stacked-filter survivors jumped after exits

- **Observed:** Filtering a stacked Bar faded removed segments correctly, but
  surviving segments whose stack bases changed snapped to their final position.
  The same filter on a simple Bar appeared continuous.
- **Wrong model:** Treating a row filter as category geometry only.
- **Root cause:** In a stack, membership is also measure geometry: removing one
  segment recomputes the `__stack0` and `__stack1` interval of every surviving
  segment above it.
- **Invariant:** A membership transition animates both sides of the join. Marks
  that leave exit in source geometry; every surviving mark then continuously
  updates through all geometry derived from the remaining rows.
- **Resolution:** Bar's semantic state now includes filter dependencies in the
  measure dimension for stacked layouts. Simple and grouped Bars retain their
  existing geometry rules.
- **Regression evidence:** A planner test requires both stacked geometry parts.
  Browser and live-lab checks sample a surviving upper segment after exit,
  between its source and target stack bases, at its endpoint, and after reverse
  scrubbing. Existing Area and Line keyed-frame interpolation remains continuous;
  Point and Unit update surviving positions on their delayed base transition.

## 2026-09-14 - Continuous axes hid endpoints and clipped point footprints

- **Observed:** A 2004-to-2022 Line labelled only round interior years, while
  Point marks centred on the minimum and maximum domains were cut in half by
  the plot clip.
- **Wrong model:** Assuming D3 `nice()` and automatic ticks represent every
  semantically important value, and treating a mark as a zero-area coordinate.
- **Root cause:** `nice()` rounds a continuous domain and `ticks(count)` returns
  approximately that many readable values; neither prioritizes the observed
  extent. A scale spanning the full pixel range also leaves no room for a
  point's radius and stroke.
- **Invariant:** Default continuous axes prioritize the actual data endpoints,
  then admit ordinary nice ticks when labels have enough room. Chart plugins
  declare pixel footprint; shared scale code extends only inferred domains so
  the full mark remains inside the plot. Explicit author domains stay exact.
- **Resolution:** Continuous scales retain their observed extent for axis and
  grid tick selection. Point and explicitly marked Line charts pass their
  radius plus stroke footprint to shared domain padding.
- **Regression evidence:** Desktop and mobile homepage tests require 2004 and
  2022 ticks and verify every Point circle lies wholly inside the plot clip.

## 2026-09-14 - Unit anchors looked like a continuous axis

- **Observed:** Force collections for 2004 and 2022 sat at the ends of a line
  labelled with invented intermediate ticks such as 2010 and 2015. The endpoint
  clusters were clipped, and attempts to fit them by zooming changed Unit size.
- **Wrong model:** Treating a Unit collection anchor as a continuous Cartesian
  coordinate and then repairing its visual footprint with a camera zoom.
- **Invariant:** Force x/y encodings identify distinct collection anchors. Show
  only values that exist in the data, without a Cartesian axis title or a
  connecting domain line, and preserve the authored Unit radius. Beeswarm is a
  positional distribution and retains its standard continuous axis; grid has
  no positional guide.
- **Resolution:** Force resolves positional fields through discrete band
  anchors regardless of whether their labels are numeric or temporal, and its
  guides hide axis titles and domain lines. Beeswarm continues through the
  authored continuous scale and standard axis. The force band inset gives
  complete clusters room without scaling their nodes.
- **Regression evidence:** The exact 2004/2022 World Heritage force example must
  show only those two x ticks, hide the domain line, retain radius 12, and keep
  all 55 units within the plot at desktop and mobile widths.

## 2026-09-14 - Point could place dots but could not express their connection

- **Observed:** Point could render an ordinary dot plot, but a lollipop required
  stems from a constant baseline and a dumbbell required links between related
  observations. Treating those as separate chart types would duplicate the same
  derived line geometry and transition rules.
- **Invariant:** A connector communicates a relationship between existing Point
  marks. It is derived geometry owned by the Point plugin, sits behind the dots,
  and never becomes datum identity or changes data grain.
- **Resolution:** `.connector({ from, channel? })` creates lollipop stems and
  includes the baseline in an inferred quantitative domain. `.connector({ by,
  orderBy? })` connects adjacent dots within each ordered group. A constant
  connector infers its channel only when exactly one positional channel is
  quantitative; otherwise the author must name `x` or `y`.
- **Regression evidence:** Browser tests require connector endpoints to meet dot
  centres, the connector layer to remain behind dots, add/remove frames to be
  exact reverses, and ambiguous constant baselines to report a useful error.

## 2026-09-14 - Direct browser ESM tests cannot resolve bare Arquero imports

- **Observed:** The global bundle and documentation labs render correctly, but
  browser tests that call `import('/dist/*.js')` fail before chart code runs with
  `Failed to resolve module specifier "arquero"`.
- **Scope:** This is a test-serving/package-resolution problem shared by Area,
  Bar, Line, Point, and module-registration tests; it is not caused by Point
  connector geometry. Tests using `window.VisDelta` are unaffected.
- **Unresolved invariant:** Browser regressions must exercise the selected ESM
  entries as well as the global bundle. The local test server needs an import map
  or another standards-valid way to resolve package bare specifiers without
  changing production module ownership.
