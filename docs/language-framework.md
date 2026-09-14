# Language and implementation rules

This page is the source of truth for VisDelta's words and design decisions.
It records rules that are implemented now. Possible future chart types and
roadmaps do not belong in the public language.

## The model

```text
Data -> Transform -> Chart state -> Difference -> Transition -> Frame -> Control
```

- **Data** is a tidy table supplied by the user.
- A **Transform** changes which tidy rows a chart state uses. It is not data
  cleaning.
- A **Chart state** is an immutable description made by `area()`, `bar()`,
  `line()`, `point()`, or `unit()`.
- A **Difference** says what changed between two states. The API is `delta()`.
- A **Transition** is the movement between two states of the same chart type.
- A **Frame** is the exact picture at one progress value from `0` to `1`.
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
the same frame. Direction may change easing—such as a unit bouncing only while
falling—but it must not change the endpoint meaning or matching.

### Data meaning is explicit

VisDelta expects tidy data. It does not clean, pivot, join, or repair data.
Transforms only express changes needed by a chart state.

Every visual encoding is declared. VisDelta may choose presentation defaults
such as radius, line width, margins, colors for an already-declared category,
or duration. It never decides that a field should mean position, color, size,
or detail unless the author maps it.

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
uses the target layout for a direct split. When reaggregation requires a
synthetic joint-grain stage with no authored target layout, Bar uses grouped
marks as the common visual presentation of that maximum common grain. How a
chart reaches that grouped view is chart- and operation-specific. For Bar
`sum` and `count`, the path is aggregate A, stacked common-grain marks under A,
grouped under A, grouped under B, stacked under B, then aggregate B. Other
aggregate operators currently keep the ordinary fallback transition.

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
