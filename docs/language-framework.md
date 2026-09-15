# Language and implementation rules

This page is the source of truth for VisDelta's words and design decisions.
It records rules that are implemented now. Possible future chart types and
roadmaps do not belong in the public language.

## The model

The core concepts are **state, correspondence, and path**:

- **State** describes what is expressed (participating records, grouping,
  contribution units, and measures) and how it is expressed (encodings,
  coordinates, layout, attention, and appearance). Geometry alone is not the
  meaning of a mark.
- **Correspondence** is evidence of continuity between endpoint objects:
  identities, source lineage, and measure contributions where available.
- **Path** is a chosen transition between states, optionally through complete
  intermediate states. It is not uniquely determined by the endpoints.

```text
State A + State B
  -> Difference (what changed) + Correspondence (what continues)
  -> Chosen transition path -> Frame
                               ^
                            Control
```

Difference describes changed state properties; it does not prescribe phase
order. Data, grain/measure, encoding, coordinate, layout, attention, and
appearance are useful non-exclusive descriptions, not seven animation engines
or a global priority list. The current renderer scene labels (`selection`,
`mapping`, `detail`, `axis`) are execution hints, not an exhaustive ontology.

### Three governing contracts

1. **State is fact; operation history is not an animation script.** Planning
   consumes endpoint states, not the sequence of builder method calls that
   produced them. Transform order remains part of state semantics: sorting
   before a limit can change membership. Ignoring builder history does not
   permit reordering the data pipeline.
2. **Correspondence is evidence, not a route command.** A shared source atom
   establishes a relationship, not a required visual trajectory. A `split`
   correspondence does not by itself justify arithmetic decomposition; measure
   compatibility and reliable contributions must also support that motion.
   Missing or unsafe evidence keeps the chart's ordinary fallback.
3. **A route is a default choice satisfying constraints; authors can specify
   waypoints with `sequence()`.** Chart policies choose readable paths using
   correspondence, measure compatibility, retained selector fields, and visual
   constraints. Another route may be valid. Author-supplied states are fixed
   boundaries; automatic states may be inserted only within each adjacent pair.
   An empty intermediate list means a direct transition, not no animation.

Every generated waypoint is a complete chart state. Each leg derives its own
difference and motion plan; simultaneous scale/axis/mark changes remain coupled
when required for a truthful frame. Explicit sequence and automatic waypoints
share pair/frame execution, while keeping their distinct timeline ownership.
These contracts do not imply a universal route-search engine: supported paths
are currently chart-owned policies, with concrete cases documented below.

### Execution flow

The concepts above are implemented through this pipeline:

```text
Data -> Transform -> Chart state -> Difference -> Transition -> Frame -> Control
```

- **Data** is a tidy table supplied by the user.
- A **Transform** changes which tidy rows a chart state uses. It is not data
  cleaning.
- A **Chart state** is an immutable description made by `area()`, `bar()`,
  `line()`, `point()`, or `unit()`.
- A **Difference** says what changed between two states. The API is `delta()`.
- A **Transition** executes a chosen path between two states of the same chart type.
- A **Frame** is the picture evaluated along that path at a progress value from
  `0` to `1`, under the chart's declared motion profile.
- A **Control** supplies progress. Time, a slider, a button, scroll, or any other
  input can control the same transition from outside the library.

Other public terms stay literal:

| Term | Meaning |
| --- | --- |
| Chart type | A chart family with its own builder, compiler, marks, and motion |
| Mapping | An explicit link from a field to x, y, color, size, or another channel |
| Scale | A function that maps data values to screen positions or sizes |
| Axis | Ticks, grid lines, and a title that explain one scale |
| Marks | Bars, points, lines, areas, or units made from data |
| Match | The rule that identifies the same mark in both states |
| Enter / stay / exit | A mark appears, remains, or disappears |
| Step | One ordered part of a transition |
| Plugin | An independent chart-type module loaded by the runtime |

## Rules that guide implementation

### Every frame is true

At any progress value, marks must agree with the scales and axes that explain
them. An x or y step therefore moves the scale, ticks, grid lines, title, and
existing marks together.

For observation membership changes, the default order is:

```text
Remove: exiting marks -> scale, axis, and remaining marks
Add:    scale, axis, and existing marks -> entering marks
```

Line and area chart modules may add chart-specific path steps, but the same
truth rule still applies.

### Reverse means the same frames backward

For a reversible pair, forward progress `p` and reverse progress `1 - p` show
the same frame. Bar's canonical routes obey this strict frame-reversal contract.
The existing opt-in `directionalEase()` profile (used by Unit) is an explicit
exception: evaluation depends on both progress and direction, so the same
numeric progress need not produce the same geometry. It must still preserve
endpoint meaning and matching. This exception must not be described as strict
frame reversal or introduced implicitly by automatic route planning.

### Data meaning is explicit

VisDelta expects tidy data. It does not clean, pivot, join, or repair data.
Transforms only express changes needed by a chart state.

Every visual encoding is declared. VisDelta may choose presentation defaults
such as radius, line width, margins, colors for an already-declared category,
or duration. It never decides that a field should mean position, color, size,
or detail unless the author maps it.

Without a declared color channel, marks in every chart use black (`#000000`)
and produce no color legend. Theme accents do not supply an implicit mark color.
An explicit constant or field color keeps its authored meaning and may use the
theme palette. Generated waypoints obey the same rule: refining a grouping
must not invent or remap a color channel to its temporary segment field.

```js
point(rows)
  .x("income")
  .y("health")
  .color("region")
  .size("population");
```

### Selection words have separate meanings

```js
base.where({ region: "North" })     // remove other rows
base.highlight({ region: "North" }) // keep rows; change attention
base.focus({ region: "North" })     // keep rows; move the camera
```

`focus()` changes neither data membership nor mark identity. The shared core
fits a two-dimensional camera around selected mark bounds; each chart module
provides those bounds.

Selection calls form a narrowing chain rather than replacing one another:

```js
base
  .where({ region: ["North", "South"] })
  .where({ age: { gt: 80 } })
  .focus({ gender: "female" });
```

Each call acts on the previous state. `where`, `focus`, and `highlight` keep
independent scopes, so focus remains a camera operation and highlight remains
an attention operation. Calling `.reset()` returns to `base`; ordinary chaining
still contributes only its final endpoint to `delta(base, next)`.

### Identity, grain, and lineage are different

A source datum keeps one stable identity, while each visualization derives its
own mark identity from its grouping grain. Aggregated marks also retain the
source atoms and their numeric contributions:

```text
datum key     id of an immutable source record
mark grain    dimensions defining one mark in this view
lineage       source records contributing to that mark
contribution  amount each source record contributes to an additive measure
```

In the chart grammar, `.datumKey("id")` declares the first line and `.key()`
declares the second. They must not be aliases: aggregation can change mark
identity while datum identity remains stable.

This lets a change from `sum(case) by year` to `sum(case) by location` compile
to a many-to-many transport graph through the common refinement
`{year, location}`. A grouping tree explains the structural change; lineage
explains which values actually move between its branches.

The common refinement is the joint grain of the two endpoint partitions. Each
non-empty intersection of a source mark and a target mark is one lineage edge.
Connected components of this bipartite graph derive every primitive operation:

```text
1 -> 1  update       1 -> N  split       N -> 1  merge
N -> M  reaggregate  1 -> 0  exit        0 -> 1  enter
```

Several disconnected components may coexist; `mixed` means that they have
different operations. A grouping tree is therefore optional planning metadata,
not the source of object identity or correspondence.

Core reports this topology but does not choose its visual form. A chart plugin
normally uses the target layout for a direct split. For Bar `sum` and `count`,
a total splitting into grouped detail first reaches the target's finer grain
as a stack, where its additive total remains readable, then opens that same
grain into grouped marks. The reverse merge reuses these frames backward.
This bridge requires the same source rows and preparation transforms on both
sides; a changed dataset or non-additive operator keeps the direct fallback.

When reaggregation requires a synthetic joint-grain stage with no authored
target layout, Bar uses grouped marks as the common visual presentation of
that maximum common grain. How a chart reaches that grouped view is chart- and
operation-specific. For Bar `sum` and `count`, the path is aggregate A, stacked
common-grain marks under A, grouped under A, grouped under B, stacked under B,
then aggregate B. Other aggregate operators currently keep the ordinary
fallback transition.

We solve readable transition routes one concrete case at a time. These
chart-owned routes are evidence for a future general capability: deriving
intermediate states from shared source atoms, endpoint grains, operation
compatibility, and visual constraints. That future planner must generalize
verified cases without treating every builder call as an animation phase or
inventing values that do not conserve an endpoint measure.

For additive Bar grain changes, focus and safe sort transforms can form
separate steps around the structural change. A focused detail merging to an
unfocused total follows `focused detail -> focused total -> total`. Detail
merging to a sorted total follows `detail -> total -> sorted total`. With both
changes, merge finishes the grain change, sorts, then changes focus. The split
direction reuses the same complete route backward. Grouped detail still passes
through the existing stacked bridge inside the structural leg.

Sorted detail merging to a plain total instead follows
`sorted detail -> detail -> total`. Detail compilation can place its sort
immediately before the aggregate; that sort is isolated at the detail grain,
not copied onto total values. Input sorts on either endpoint are restored only
at that endpoint's grain, outside the structural and focus/output-sort route.

This inference requires matching source rows, datum-key declarations, and
preparation transforms, with compatible `sum` or `count` measures. A focus
selector carried to a total must refer to retained grouping fields. Only
trailing sorts on available aggregate-output fields can be carried across a
grain change. Contiguous sorts immediately before the single additive aggregate
can form a separate step at their original grain, provided only output sorts
follow the aggregate. Sorting across an intervening filter or other transform
is not inferred. All other preparation retains its data-pipeline position and
must match on both endpoints. Rollup-to-rollup
routes can compose these presentation steps with the existing common-grain
bridge, in its canonical direction. Unsupported combinations retain their
existing transition route.

Intermediate states are generated sequence steps within an authored pair.
Each adjacent pair derives its own difference and reversible frame path. A
shared endpoint displays the complete state, without the preceding leg's exit
marks or ticks. Generated steps share the pair's `0..1` interval and total
playback duration. In an authored `sequence([A, B, C])`, progress `1` still
identifies B even if A-to-B contains generated intermediate states.

For strict reversible routes, every adjacent leg is canonicalized independently.
Reverse playback evaluates the same canonical frame at `1 - p`; details such as Bar dividers must
not introduce direction-specific logic. Problems that reveal a missing rule are
preserved in the [Transition Regression Log](./transition-regression-log.md).

### Core knows no chart types

Core owns shared state, difference, progress, frame evaluation, lifecycle, and
camera math. It does not contain branches for Area, Bar, Line, Point, or Unit.

Each chart module owns:

- its builder and chart-specific grammar;
- compilation and data-to-geometry rules;
- matching, transition steps, and reversible paths;
- axes and presentation differences;
- examples and tests.

Adding a chart type should not require editing the transition runtime. An
imported builder carries its own lazy chart module; registration is needed only
when rendering a plain JSON spec that cannot carry that reference.

### Chart types are peers

Area, Bar, Line, Point, and Unit have the same architectural status. Their
visual rules differ because their reader questions differ, not because one is
built into Core.

| Chart type | Primary question | Chart-owned rule |
| --- | --- | --- |
| `bar()` | How do categories compare? | Bars share a quantitative baseline |
| `point()` | How do two quantities relate? | Compact Cartesian axes; ordinary enters grow at the target |
| `line()` | How does a value change in order? | Keys control points inside paths; gaps stay honest by default |
| `area()` | How does magnitude or composition change in order? | Explicit baseline and stacked boundaries |
| `unit()` | How many countable items are there? | `grid`, centered `force`, `bar`, and `beeswarm` layouts; key-first shortest travel |

### Keep the language small

Use plain English and one word for one concept. Public names, exported types,
examples, tests, and documentation change together. Do not keep aliases in this
greenfield release.

The detailed signatures live in the [API reference](/reference). Working
behavior lives in the five transition labs.
