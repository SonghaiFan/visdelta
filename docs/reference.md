# API reference

VisDelta compares two immutable states of the same chart type and creates a
seekable transition.

<TransitionWorkbench />

The workbench uses the built package from this checkout. Seek in either
direction and inspect the resolved endpoints and semantic difference.

## Edit the grammar live

<SyntaxPlayground />

Return `{ from, to }` from the editor. Both states must use the same chart type.
The surrounding workbench owns rendering, playback, resize, and cleanup.

## Chart state

```js
const base = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const next = base.y("profit");
```

Chaining does not render or mutate `base`. `base.toSpec()` returns a detached
serializable view spec.

### Data sources

Factories accept tidy rows, `{ values }`, CSV/JSON URLs, and named sources.
See [Data and transforms](/data-sources-and-transforms).

### Channels

```ts
.x(field, options?)
.y(field, options?)
.channel(name, field, options?)
.color(valueOrField, options?)
.size(field, options?)
.key(fieldOrFields)
.datumKey(fieldOrFields)
.tooltip(fieldOrFields)
```

Channel options can include `type`, `title`, `format`, `domain`, `scale`,
`sort`, `aggregate`, `timeUnit`, and `bin`. Core fills a missing type from data;
an authored type always wins.

### Shared changes

```ts
.data(source)
.rows(source?)
.sort(field, "ascending" | "descending")
.where(selector)
.highlight(selector, { opacity? })
.focus(selector)
.reset()
.axis(config)
.transition({ duration?, ease?, stagger? })
```

`rows()` returns the current state’s tidy rows after all declared transforms.
VisDelta owns the D3 and Arquero runtime, so no runtime object is required.
Inline data is read directly; pass source rows only when the state uses a named
dataset.

### Selectors

`where()`, `highlight()`, and `focus()` accept the same `selector`. A selector
can use any one of these three forms:

```ts
type Selector =
  | string
  | {
      field: string;
      equal?: unknown;
      notEqual?: unknown;
      oneOf?: unknown[];
      gt?: number | string | Date;
      gte?: number | string | Date;
      lt?: number | string | Date;
      lte?: number | string | Date;
    }
  | Record<string, unknown>;
```

#### Field shorthand

Use a scalar for equality, an array for membership, or a constraint object for
one or more comparisons. Multiple fields in one object are joined with AND.

```js
{ region: "North" }                         // region equal "North"
{ region: ["North", "South"] }             // region oneOf [...]
{ age: { gte: 18, lt: 65 } }                // 18 <= age < 65
{ region: "North", age: { gt: 80 } }        // region AND age
{ cancelledAt: null }                       // equality with null
```

#### Explicit field comparison

Use `field` when the comparison should be explicit or when applying several
bounds to the same field.

```js
{ field: "sales", equal: 100 }
{ field: "sales", notEqual: 0 }
{ field: "region", oneOf: ["North", "South"] }
{ field: "sales", gt: 10 }
{ field: "sales", gte: 10 }
{ field: "sales", lt: 100 }
{ field: "sales", lte: 100 }
{ field: "sales", gte: 10, lt: 100 }
{ field: "date", gte: "2026-01-01", lt: "2027-01-01" }
```

The supported operator names are exactly:

| Operator | Meaning |
| --- | --- |
| `equal` | Strictly equal after date normalization |
| `notEqual` | Not strictly equal after date normalization |
| `oneOf` | Equal to at least one value in the array |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |

Range operands must be finite numbers, JavaScript `Date` values, or valid ISO
date strings. Missing values, empty strings, booleans, and `NaN` do not match a
range. The operator is `equal`, not `equals`.

#### Comparison expression

A string selector contains exactly one comparison. Supported symbols are
`===`, `==`, `!==`, `!=`, `>`, `>=`, `<`, and `<=`.

```js
"datum.sales >= 10"
"datum.region === 'North'"
"datum.active != false"
"datum.cancelledAt == null"
"datum.date < '2027-01-01'"
```

The left side must be `datum.<field>`. The right side must be a finite number,
boolean, `null`, or quoted string. Selectors do not evaluate arbitrary
JavaScript: callbacks, regular expressions, method calls, arithmetic, and
cross-field expressions are rejected. Use `oneOf` for OR within one field;
cross-field OR is not currently part of the selector grammar.

#### Composition and transform order

All conditions within a selector and all repeated calls to the same method are
joined with AND. Each call narrows the previous immutable state; it does not
replace the earlier condition.

```js
const olderNorth = base
  .where({ region: ["North", "South"] })
  .where({ region: "North" })
  .where({ age: { gt: 80 } });
```

`where()` keeps its position in the transform pipeline. Filtering source rows
before an aggregate is different from filtering aggregate rows after it:

```js
base.where({ region: "North" }).rollup();
base.rollup().where({ sales: { gt: 100 } });
```

The selector's fields must exist at that point in the current state. An
aggregate can remove source fields that are not part of its output grain.

### `where(selector)`

`where()` changes data membership. Matching rows stay; non-matching rows exit.
It adds filter transforms to the returned state, so `state.rows()` also returns
only matching rows. The source state is unchanged.

```js
const all = bar(rows).x("country").y("sites").key("country");
const nordic = all.where({ country: ["Norway", "Sweden"] });

all.rows();    // every row
nordic.rows(); // Norway and Sweden only
```

Calling `where()` repeatedly narrows membership further. Use the earlier state,
or `.reset()` when the intended next state should start from the original
declaration instead of the already-filtered result.

### `highlight(selector, options?)`

`highlight()` changes attention without changing rows, identity, layout, axes,
or scale domains. Matching marks retain full opacity; non-matching marks use the
chart style's `--vd-dim-opacity` value.

```js
base.highlight({ country: "Norway" });
base.highlight({ sites: { gte: 10 } }, { opacity: 0.08 });
```

The only option is:

| Option | Type | Meaning |
| --- | --- | --- |
| `opacity` | `number` | Opacity applied to non-matching marks; normally use a value from `0` to `1` |

`highlight()` has its own scope. It can coexist with `where()` and `focus()`,
and repeated highlights are joined with AND. It does not change the result of
`state.rows()`.

### `focus(selector)`

`focus()` changes only the view camera. Core finds the matching marks' rendered
bounds, then applies one aspect-preserving two-dimensional pan and zoom to the
chart. All rows and mark identities remain present. The selected subset does
not recompute the underlying data domain; the visible scales and axes follow
the camera.

```js
base.focus({ country: "Norway" });
base.focus({ year: 2022, sites: { gte: 10 } });
```

There are no additional options. When no mark matches, the camera remains at
the complete-chart view. Focus never zooms farther out than that view. Repeated
focus calls are joined with AND, so use the earlier state or `.reset()` to
replace an existing focus condition.

The three scopes remain independent:

```js
const next = base
  .where({ year: 2022 })
  .highlight({ country: "Sweden" }, { opacity: 0.1 })
  .focus({ country: ["Denmark", "Sweden"] });
```

Here `where()` determines membership, `highlight()` determines emphasis, and
`focus()` determines the camera. `reset()` returns a new visualization equal to
the declaration before the chain's first semantic operation.

### Lineage-aware delta

For inline data, `delta(from, to)` also exposes a `lineage` correspondence plan:

```js
const change = vd.delta(byYear, byLocation);

change.lineage.mode;             // "reaggregate"
change.lineage.commonRefinement; // ["location", "year"] (canonical order)
change.lineage.edges;            // non-empty joint-grain cells
change.lineage.components;       // connected update/split/merge/... operations
```

Each connected component is classified only by its endpoint cardinality:
`1 -> 1` update, `1 -> N` split, `N -> 1` merge, `N -> M` reaggregate,
`1 -> 0` exit, or `0 -> 1` enter. `mixed` means that disconnected components
with different operations coexist; it is not a seventh primitive operation.

The lower-level functions are available when a data pipeline needs inspection
independently of a chart:

```ts
compileLineage(rows, transforms, { key?, grain? })
buildGroupingTree(table)
correspondLineage(from, to, { fromField?, toField? })
```

At chart level, declare source identity with `.datumKey("id")`; `.key()` remains
the join identity of a mark in the current view. At the low-level compiler,
`key` identifies immutable source records and `grain` identifies marks in one
compiled view. They are intentionally separate. Filtering, sorting, limiting,
binning, time units and folding preserve lineage. `sum` and `count` produce
additive contribution records. `mean` and non-additive aggregates such as
`median` retain provenance, but mark arithmetic decomposition as unsafe because
independently computed subgroup values do not conserve the endpoint value.

Bar transitions use lineage topology to communicate only group membership:
direct splits follow the authored target layout, while a synthetic joint-grain
stage used by reaggregation is grouped. For `sum` and `count`, Bar bridges each
aggregate endpoint through a stacked view that preserves its total, then uses
grouped views on both sides of the regrouping. Other aggregate operators retain
lineage but currently use the ordinary transition rather than implying that
their intermediate values add up to an endpoint value.

## Chart types

### `area(data?)`

```ts
.baseline(number)
.curve(d3AreaCurveName)
.connect("adjacent" | "across")
.breakdown(field, options?)
.layout("stacked" | "stream", { offset?, order? })
.rollup(options?)
```

### `bar(data?)`

```ts
.flip(options?)
.breakdown(field?, options?)
.rollup(groupby?, options?)
.segment(fieldOrConfig?, config?)
.layout("simple" | "grouped" | "stacked", options?)
```

### `line(data?)`

```ts
.curve(d3CurveName)
.connect("adjacent" | "across")
.strokeWidth(number)
.pointSize(number)
.flip(options?)
.breakdown(field, options?)
.rollup(options?)
```

Curve names are exact D3 exports such as `curveLinear`, `curveStep`, and
`curveMonotoneX`. Line also accepts `curveBundle`; Area does not.

### `point(data?)`

```ts
.pointSize(number)
.radius(number)
.connector({ from: number, channel?: "x" | "y" })
.connector({ by: string | string[], orderBy?: string })
.flip(options?)
.rollup(groupby, options?)
.breakdown(detail?, options?)
```

Point connectors are derived geometry behind the dots; they do not change the
data grain or datum identity. A constant `from` creates lollipop stems. VisDelta
infers the connector channel when exactly one positional channel is quantitative;
set `channel` when both x and y are quantitative. A `by` connector groups dots
and connects adjacent members in `orderBy` order, or input order when omitted.

```js
point(rows)
  .x("region")
  .y("sales")
  .connector({ from: 0 });

point(rows)
  .x("value")
  .y("country")
  .color("year")
  .connector({ by: "country", orderBy: "year" });
```

### `unit(data?)`

```ts
.value(field, { unitValue?, maxUnits? })
.group(field)
.layout("grid" | "force" | "bar" | "beeswarm", { columns?, radius? })
.columns(number)
.radius(number)
```

`unitValue` sets the quantity represented by each circle and defaults to `1`.
For example, `.value("sites", { unitValue: 10 })` renders 5 circles for 50
sites. A positive remainder gets another circle, so 51 sites renders 6 circles;
label the chart or legend with the chosen unit value. `maxUnits` remains a
whole-chart safety cap after expansion.

Changing `unitValue` is a semantic change in data grain: a coarser circle is
the parent of the finer circles from the same source row. VisDelta animates
that relationship as a reversible split/merge, using the parent row's current
circle centroid as the shared anchor rather than treating the extra circles as
unrelated enters or exits.

For `force`, shared `.x()` and `.y()` channels become per-unit `forceX` and
`forceY` targets. Without either channel, the target is the plot center.

See [Chart types](/chart-types) for the behavioral rules rather than repeating
them here.

## `delta(from, to)`

`delta()` is DOM-free. It requires matching chart types and returns a semantic
difference with `deltas` plus `hasDelta(type)`.

```js
import { delta } from "visdelta/core";

const change = delta(base, next);
change.hasDelta("encoding.y");
```

## `transition(from, to, options)`

```js
const change = await transition(from, to, {
  target: "#chart",
  data,
  height,
  chartStyle
});

change.progress(0.5);
change.play({ duration: 800, from: 0, to: 1 });
change.pause();
change.resize();
change.destroy();
```

See [Transition runtime](/runtime-api) for lifecycle details.

## `sequence(states, options)`

`sequence()` makes an ordered set of authored states a single seekable
timeline. Adjacent legs are explicit: `A → B`, then `B → C`. Its `value` uses
state positions, so `1.5` is halfway from the second state to the third.

```js
import { sequence } from "visdelta/transition";

const story = await sequence([revenue, profit, ranked], { target: "#chart" });

story.progress(1.5);              // halfway through profit → ranked
story.play({ duration: 900 });    // 900ms for each adjacent leg
story.pause();
story.destroy();
```

The runtime prepares each adjacent pair before showing it. At a shared state it
hands off directly—there is no empty chart frame between `A → B` and `B → C`.
For a repeating story, include the starting state again at the end:
`[revenue, profit, ranked, revenue]`.

## `mount(view, options)` and `select(target)`

Mount a state once, then evolve the chart already at that DOM target. This is
the D3-like imperative entry point: selection finds VisDelta's current endpoint;
grammar calls still return a new immutable state; `play()` promotes it.

```js
import * as vd from "visdelta";

await vd.mount(salesByRegion, { target: "#chart" });

await vd.select("#chart")
  .update(view => view.focus({ region: "North" }))
  .play({ duration: 700 });
```

The `update()` callback receives the current immutable builder, so it exposes
the complete chart grammar without the runtime API having to mirror methods
such as `focus`, `where`, `sort`, or future chart-specific operations.
`select()` only addresses a target mounted by VisDelta. It preserves the
existing chart's runtime dependencies and starts the new state at the current
endpoint without clearing the host between frames.

## Public modules

| Entry | Exports |
| --- | --- |
| `visdelta` | All built-in charts, `delta`, `transition`, `sequence`, `mount`, `select`, data types, styles, and registration |
| `visdelta/core` | DOM-free state/difference helpers plus camera math |
| `visdelta/area`, `/bar`, `/line`, `/point`, `/unit` | One focused chart builder and module |
| `visdelta/transition` | Standalone pair, sequence, and mounted-selection controllers |
| `visdelta/plugins` | Chart-module definition and registration |
| `visdelta/chart-style` | Structural style definition and presets |
| `visdelta/browser` | Browser-global dependency adapter |
| `visdelta/style.css` | Required base stylesheet |
| `visdelta/themes/*.css` | Default, dark, and paper token themes |

The generic transition runtime has no built-in chart-name switch. A focused
builder carries its lazy module. Register a module only when a plain spec cannot
carry that reference.

## Current boundary

- Endpoint chart types must match; Bar-to-Line is rejected.
- D3 is required for rendering.
- Arquero is required only when transforms execute.
- Data cleaning is outside the library.
- Controls call `progress()` from outside the library.
