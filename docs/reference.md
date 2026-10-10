# API reference

VisDelta compares two immutable states of the same chart type. Use `delta()` to
inspect what changed, then `transition()` or `sequence()` to evaluate a path.
The seven `stateChanges` categories are semantic facts, not playback phases.

<TransitionWorkbench />

The workbench uses the built package from this checkout. Seek in either
direction and inspect the resolved endpoints and semantic difference.

## Run the grammar against a real transition

Use the [Playground](/playground) to
edit a pair of immutable states, inspect its directional `stateChanges`, and
scrub the generated transition. This reference stays focused on the API shape.

## Chart state

```js
const base = bar(rows)
  .x("category")
  .y("sales");

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

For a declared color field, omit `range` to use VisDelta's default categorical
palette, provide `range` for exact colors, or name a
[D3 Scale Chromatic](https://d3js.org/d3-scale-chromatic) scheme:

```js
bar(rows).color("region", { scheme: "Tableau10" });
point(rows).color("score", { type: "quantitative", scheme: "Viridis" });
```

Categorical schemes such as `Category10`, `Observable10`, `Accent`, `Dark2`,
`Paired`, `Pastel1`, `Pastel2`, `Set1`, `Set2`, `Set3`, and `Tableau10` map
categories to discrete colors. Sequential and diverging names such as `Blues`,
`Viridis`, `RdBu`, and `Spectral` may color categories discretely; for a
quantitative field they use D3's continuous interpolator. An explicit `range`
takes precedence over `scheme`.

Channel options can include `type`, `title`, `format`, `domain`, `scale`,
`sort`, `aggregate`, `timeUnit`, and `bin`. Core fills a missing type from data;
an authored type always wins.

Quantitative position channels support `scale: { type: "linear" }`,
`scale: { type: "sqrt" }`, and `scale: { type: "log", base? }`. Log scales
default to base 10; for example, use `scale: { type: "log", base: 2 }` for
base-2 tick selection.

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
VisDelta owns its D3 runtime and executes transforms itself, so no runtime object is required.
Inline data is read directly; pass source rows only when the state uses a named
dataset.

### Selectors

`where()`, `highlight()`, and `focus()` accept the same `selector`. A selector
is one of two object forms:

```ts
type Selector =
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

Selectors are always objects, never strings. A spec is data: it can be saved,
sent, and compared, and an object selector needs no parser to stay that way.

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
const all = bar(rows).x("country").y("sites");
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

At chart level, source identity is automatic: Core prefers a unique `id`, then
the smallest unique categorical field set, and finally reports an index
fallback when the data contains no stable categorical identity. Use
`.datumKey("id")` only to override ambiguous inference. `.key()` remains the join
identity of a mark in the current view. At the low-level compiler, `key`
identifies immutable source records and `grain` identifies marks in one compiled
view. They are intentionally separate. Filtering, sorting, limiting, binning,
time units and folding preserve lineage. `sum` and `count` produce additive
contribution records. `mean` and non-additive aggregates such as `median` retain
provenance, but mark arithmetic decomposition as unsafe because independently
computed subgroup values do not conserve the endpoint value.

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

`delta()` is DOM-free. It requires matching chart types and returns raw semantic
`deltas`, normalized `stateChanges`, and `hasDelta(type)`.

```js
import { delta } from "visdelta/core";

const change = delta(base, next);
change.hasDelta("encoding.y");
change.stateChanges;
// [{ category: "encoding", action: "remap", channel: "y" }]
```

The seven `stateChanges` categories describe what changed: `data`, `grain`,
`encoding`, `coordinate`, `layout`, `attention`, and `appearance`. They are
non-exclusive and their array order is not an animation schedule. Grain entries
include their previous and next `groupby` and `measures`, including each
aggregate operator, input field, and output field. Identity remains separate in
Core's inferred datum identity (optionally overridden by `.datumKey()`), `.key()`,
and the optional `lineage` correspondence result.

Core also exports `resolveMarkIdentity()`, `correspondMarks()`, and
`markKeyValue()` for chart plugins. `resolveMarkIdentity()` gives an explicit
`.key()` priority over the plugin's default mark key. `correspondMarks()`
returns one-to-one `updates`, `enter`, and `exit`; source lineage continues to
describe split, merge, and reaggregation separately.

When record identity is unavailable, an uncertain Data action is omitted from
`stateChanges`; the original low-level `data` or `filter` delta remains visible.

`delta().edits` additionally describes exact changes to the serialized chart
declaration. Each edit has a `path`, `previous`, and `next`; values explicitly
distinguish absence from `null`, `false`, and zero. Arrays, including ordered
transform pipelines, are atomic values. Inferred channel types are not added to
the authored declaration. These are declaration edits, not
animation commands or additional state-change categories.

```js
import { applyDeclarationEdits, planDeclarationTransition } from "visdelta/core";

const targetSpec = applyDeclarationEdits(base.toSpec(), change.edits);
```

Applying edits returns a detached declaration and rejects stale previous values.
Declaration edits and transition operations are separate: declaration edits
describe exact serialized differences, while a chart plugin's
`DeclarationOperationCodec` defines the canonical operations that can form a
route. A codec decomposes each endpoint, evaluates complete candidate states,
normalizes derived fields, and validates the result. Unsupported states return
a reason instead of being treated as valid partial declarations. An optional
`validateStep(from, to, endpoints)` hook constrains route edges after complete
candidate states pass validation and operation round-trip checks. It receives
the same canonical endpoint pair throughout a search; reverse planning reuses
that canonical route backward. The hook runs only in the canonical search
direction; constraints must be stable and direction-symmetric or defined by
the canonical pair, and must not depend on builder history.
Returning `unsupported` skips that edge without
declaring either state invalid. Codecs without this hook keep their existing
route search. Built-in plugins supply chart-owned codecs for validated declaration
subsets; the operation shape follows each chart's semantics.

| Chart | Supported operation states | Boundaries that retain the chart route or direct fallback |
| --- | --- | --- |
| Bar | Ordinary channels, attention, keys, margins and supported ordered transforms; one aggregate measure with category grouping, optional detail, and grouped offsets in separate Grain/layout slots. | Wide folds, multiple aggregates, unresolved data, mismatched aliases or mark keys, and Grain changes combined with reorientation. |
| Point | Ordinary channels and presentation; summary-to-summary grouping and a complete x/y measure bundle with optional aggregate size. Derived position bindings, mark keys and detail metadata follow those Grain slots. | Raw-to-summary pairs, multiple aggregates, unavailable fields, mismatched keys/aliases, and runtime detail-view stages. |
| Line | Raw y remapping is an Encoding operation. Summary source field, reducer and output alias form one Grain operation with its derived y binding. Curve, connection, appearance and attention remain separate. | Raw-to-summary pairs keep the native zipper when eligible. Pairs crossing ordinary and explicit-detail declarations retain the native route. Custom mark keys and implicit color-derived series remain supported in ordinary declarations; explicit topology/summary declarations require derived keys and declared series. Complex pipelines and runtime zipper stages are outside that subset. |
| Area | Raw y remapping and summary measure semantics follow the same distinction. Stacked-to-stream layout and its offset/order form a separate layout modifier; curve, connection, baseline and appearance remain separate. Ignored series provenance in a single summary is normalized away. | Raw-to-summary pairs retain the native topology fallback. Ordinary raw declarations preserve represented custom mark keys; explicit topology and summary declarations require their derived mark keys. Complex pipelines and runtime stages remain outside that subset. |
| Unit | Quantity field, quantity per circle, circle cap, group, layout, columns and radius are separate slots; x/y, color, tooltip, attention, keys and margins are also supported. Axis metadata is a derived mirror. | Aggregate transforms, unresolved data, legacy unit x/y metadata, axis-order instructions, conflicting mirrors and invalid layout dependencies. |

Point summaries require resolved inline records, one aggregate at its original
pipeline position, and complete quantitative x/y measures. Line and Area
summaries require one aggregate measure grouped by x at the end of the
pipeline. Their transformed observations must have one x value per series and
finite measures. Ordinary `filter`, `sort` and `timeUnit` operations remain
ordered and are validated at their actual pipeline positions.
Unit bar layout requires a group field; beeswarm requires an x field. Candidate
states must satisfy those dependencies, so a valid route may bind a field before
entering its layout, or leave the layout before unbinding the field. Force
positions remain categorical anchors even for numeric fields. Unit grouping
changes layout; `unitValue` changes Grain. Explicit renderer defaults normalize
to the same state as omitted defaults.

Bar Grain planning requires the same orientation at both endpoints. A pair
that combines reorientation with a Grain change is unsupported by this planner
and uses Bar's chart-authored route or direct fallback.

```ts
import { planDeclarationTransition } from "visdelta/core";
import type { DeclarationOperationCodec } from "visdelta/core";

const widthCodec: DeclarationOperationCodec = {
  decompose(spec) {
    return { status: "ok", value: typeof spec.width === "number"
      ? [{ id: "width", path: ["width"], value: { present: true, value: spec.width } }]
      : [] };
  },
  evaluate(template, operations) {
    const next = { ...template };
    const width = operations.find(operation => operation.id === "width");
    if (width?.value.present) next.width = width.value.value;
    else delete next.width;
    return { status: "ok", value: next };
  },
  normalize(spec) { return { status: "ok", value: spec }; },
  validate(spec) { return spec.mark === "custom"
    ? { status: "ok", value: undefined }
    : { status: "unsupported", reason: "wrong mark" }; }
};

const plan = planDeclarationTransition(from, to, widthCodec, { maxSearchStates: 256 });
// plan.status is planned, direct, unsupported, or search-limit.
// Every planned stage contains complete from/to declarations and one operation action.
```

The search is deterministic and bounded. Each planned edge inserts, removes,
or updates one codec operation, and every intermediate must pass the codec's
validator and round-trip through its normalizer. Source data and datum identity are protected route boundaries; mark
keys may change when the chart codec represents a grain change. Inline data
field references and transform declarations are validated at every candidate
state. Missing codecs,
invalid endpoints, and endpoints with no valid
one-operation path return `unsupported` or `search-limit` with an empty `stages`
array; these results do not claim a one-edit route. The runtime uses an
available chart-authored route or its ordinary direct fallback. A chart plugin
opts in by setting `declarationPlanning: true`
and supplying `declarationOperations` in its transition policy. Existing
chart-specific routes keep precedence by default. All five built-in chart
plugins opt into `declarationPlanningOrder: "before-chart"`: they first plan
supported operation states, then refine each leg with chart-owned motion
bridges. Unsupported pairs keep the available native route or ordinary direct
fallback. Authored `sequence()` boundaries remain fixed.

A semantic operation stage and a rendered motion leg are different units. One
operation may need several chart-owned motion bridges, so the number of runtime
phases need not equal the number of planner stages. Those bridges must remain
complete, truthful chart states and cannot invent bindings or color.

Bar's Grain planner currently accepts one aggregate measure over inline source
rows, with a category and optional detail field. It preserves the aggregate's
position in the ordered transform pipeline and only accepts a verifiable
default mark key. For example, a total to stacked-detail path has one complete
grouping state:

```js
import { bar, createBarGrainDeclarationOperationCodec } from 'visdelta/bar';
import { planDeclarationTransition } from 'visdelta';

const from = bar(data).x('state').y('population', { title: 'Metric' })
  .rollup({ title: 'Metric' }).toSpec();
const to = bar(data).x('state').y('population', { title: 'Metric' })
  .breakdown('age', { title: 'Metric' }).toSpec();
const plan = planDeclarationTransition(
  from, to, createBarGrainDeclarationOperationCodec()
);
plan.stages.map(stage => stage.operation.id);
// ['__visdeltaBarGrain/grouping']
```

When endpoints share a category and one aggregate grouping strictly refines the
other, differing focus scopes change only at the coarse endpoint's grouping,
detail, and mark key. A focused detail therefore merges before focus changes;
the split reuses the route backward. Measure, color, and layout operations
remain separate. This is a Bar route constraint, not a chart-state validity
rule or a global ordering of state-change categories.
The preserved focus must also be valid at the coarse Grain; otherwise the
planner has no permitted route and runtime uses the normal Bar fallback.

<BarGrainPlannerDemo />

Wide folds, multiple aggregates, unresolved data, mismatched output aliases,
custom mark keys that do not match the Grain, and reorientation combined with a
Grain change are unsupported by this planner. Runtime uses the Bar-authored
route when it can provide one, or the ordinary direct fallback.

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
story.play({ duration: 900 });    // 900ms for each serial route stage
story.pause();
story.destroy();
```

The runtime prepares each adjacent pair before showing it. At a shared state it
hands off directly—there is no empty chart frame between `A → B` and `B → C`.
For a repeating story, include the starting state again at the end:
`[revenue, profit, ranked, revenue]`.

## Keeping a chart on screen

There is no mounted-chart object. A chart that stays on screen is a transition
held at an endpoint, and the application owns the current state:

```js
let state = salesByRegion;
let held = await transition(state, state, { target: "#chart" });
held.progress(1);

async function go(next) {
  const change = await transition(state, next, { target: "#chart" });
  held.destroy();
  held = change;
  state = next;
  change.play({ duration: 700 });
}

await go(state.focus({ region: "North" }));
```

`transition()` resolves both states before touching the target, so the previous
chart stays visible until the next one is ready. For several adjacent states,
`sequence()` hands off at shared endpoints without an empty frame.

## Public modules

| Entry | Exports |
| --- | --- |
| `visdelta` | All built-in charts, `delta`, `transition`, `sequence`, data types, styles, and registration |
| `visdelta/core` | DOM-free state/difference helpers plus camera math |
| `visdelta/area`, `/bar`, `/line`, `/point`, `/unit` | One focused chart builder and module |
| `visdelta/transition` | Pair and sequence controllers |
| `visdelta/plugins` | Chart-module definition and registration |
| `visdelta/toolkit` | Optional compiler tools, renderer base, and plot-style composition |
| `visdelta/chart-style` | Structural style definition and presets |
| `visdelta/browser` | Browser-global dependency adapter |
| `visdelta/style.css` | Required base stylesheet |
| `visdelta/themes/*.css` | Default, dark, and paper token themes |

The generic transition runtime has no built-in chart-name switch. A focused
builder carries its lazy module. Register a module only when a plain spec cannot
carry that reference.

Importing the convenience entry does not register any chart types. Themes use
capability-level `plot` overrides, not a table keyed by chart names. Compilers
declare their complete `stateOrder` and handlers; no default pipeline is added.

## Current boundary

- Endpoint chart types must match; Bar-to-Line is rejected.
- VisDelta depends on the `d3-*` modules it renders with; nothing is injected or configurable.
- Declared transforms execute within VisDelta; no table-library installation is required.
- Data cleaning is outside the library.
- Controls call `progress()` from outside the library.

## Visualization warnings

Rendering automatically emits advisory `console.warn` messages. Charts still
render; declarations and transition plans are unchanged. Consecutive identical
warning lists are deduplicated per host. A changed list is also exposed as a
bubbling `visdelta:warnings` event (`event.detail` is the warning array) and JSON
in the chart scene element's `data-visdelta-warnings` attribute (inside the target). The event bubbles to the target. An empty array clears the last
reported diagnostics. These describe evaluated chart states, not every animation
frame; cached playback need not re-evaluate a state.

Inspect without rendering:

```js
import { bar, visualizationWarnings } from 'visdelta';

const chart = bar([{ category: 'A', value: 12 }, { category: 'B', value: 14 }])
  .x('category')
  .y('value', { domain: [10, 20] });
const warnings = await visualizationWarnings(chart);
// warnings[0].code === 'bar.truncated-baseline'
```

`visualizationWarnings(visualization, datasets = {})` returns a promise of
`VisualizationWarning[]`. Builders carry their chart module; plain specs require
an explicitly registered chart module/type, just like transitions. Named data
can be supplied in `datasets`; the inspection does not fetch remote data.
Warnings include `code`, `severity: 'warning'`, `message`, `suggestion`,
`evidence`, and an optional `field`. Plugins declare an optional pure
`warnings(spec, rows)` inspector through `defineChartType`. It receives prepared
specs and transformed rows. Plugins without this hook return no warnings.

| Code | Trigger | Suggested response |
| --- | --- | --- |
| `bar.truncated-baseline` | Explicit two-ended measure domain still excludes zero after renderer nicing, including flipped bars | Include zero or use dots |
| `connection.unordered-axis` | Line/Area x channel is nominal, inferred or declared | Use bars/dots, or declare ordinal if order is meaningful |
| `color.too-many-categories` | More than 5 observed nominal/ordinal values share a color channel, in any built-in chart | Consider grouping, filtering or using small multiples; colors and legend entries remain unchanged |
| `line.too-many-series` | More than 10 actual series | Filter, highlight or use small multiples |
| `area.too-many-series` | More than 6 actual layers | Reduce layers or use lines |
| `area.negative-components` | Multiple layers with negative y values | Consider lines or diverging bars |
| `point.small-sample` | 1–4 finite observations on two quantitative axes | Show sample size; avoid strong relationship conclusions |
| `point.coincident-positions` | Finite observations on two quantitative axes have identical x/y positions | Inspect overlap; consider transparency or aggregation |
| `point.negative-size` | Negative values in a mapped bubble-size field | Use position for signed values |

Counts use the transformed rows, so filtering and aggregation affect advice.
The numeric thresholds are VisDelta heuristics, not universal perceptual laws.
Ordinal author declarations are respected; sorting nominal labels alone does
not establish semantic order. Dot plots are not treated as scatterplots.
Focused line y ranges do not automatically warn.

These rules translate the expressiveness/effectiveness principles in
*introduction-what-why-how.tex* and the chart design guides in
*visualisation-of-table-datasets.tex* (Monash teaching materials). The latter's
Bar, Line, Area, Scatterplot and Bubble Plot sections motivate the chart rules;
its category-discrimination guidance motivates the color warning.

Unsupported automatic judgements include author intent, causal claims,
importance of a variable, precise-share comparison goals, annotation quality,
label collisions, near-overlap in pixel space, palette accessibility and pie
chart advice (VisDelta has no pie chart module). Bubble-radius scaling and
nonzero minimum-radius effects are not assessed by these warnings. No universal
warning is emitted merely for using a stack, a focused line scale or a bubble
chart. Advice requiring these contexts remains a manual design review.


### Default categorical colors

With `.color("category")`, each value in the color domain keeps its own color
assignment and legend entry. More than five observed categories trigger
`color.too-many-categories`; the warning does not change the chart, merge
categories, or introduce an `others` entry.

Colors follow explicit `domain` order when supplied, otherwise the existing
data-domain order. Default stacked Area color uses its ranked series order
when no color domain or palette is supplied. Other charts do not automatically
rank color categories by value. Filtering retains the existing full-domain
color assignment and all legend entries; marks that remain do not acquire a
different palette slot. Layout measures the same legend that is drawn,
including on narrow screens.

Provide an explicit `range` or `scheme` to control the colors assigned to
categories:

```js
const compact = point(rows).x("income").y("health").color("region");
const fullPalette = compact.color("region", { scheme: "Tableau10" });
```

Quantitative gradients, constant color and composite hue/luminance encodings
are unchanged. The category-count warning is advisory and does not alter the
palette or collapse categories. Chart-specific series-count warnings can also
apply because the number of lines or layers has not changed.


### Default stacked Area ranking

Ordinary stacked Area places series with larger total y values nearer the
baseline. Totals span the full data domain used by the chart, not just the last
time point. Ties keep first appearance order. One fixed order applies across
all x positions; trailing display filters retain the full-domain ranking.
The positive and negative accumulators remain separate.

When color maps the stacked series with no explicit domain or palette, its
legend and default categorical colors follow this ranking. No color encoding
is invented for an uncolored stack. Explicit color domains, ranges and schemes
retain their assignments. Stream layouts retain their declared D3 order and
offset. To keep input layer order with a fixed baseline, use the existing
`.layout("stream", { offset: "none", order: "none" })` after `breakdown()`.
Ranking is derived geometry, not an extra declaration operation.
