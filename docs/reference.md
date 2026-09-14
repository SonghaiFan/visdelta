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
.tooltip(fieldOrFields)
```

Channel options can include `type`, `title`, `format`, `domain`, `scale`,
`sort`, `aggregate`, `timeUnit`, and `bin`. Core fills a missing type from data;
an authored type always wins.

### Shared changes

```ts
.data(source)
.sort(field, "ascending" | "descending")
.where(selector)
.highlight(selector, { opacity? })
.focus(selector)
.axis(config)
.transition({ duration?, ease?, stagger? })
```

Selectors accept a field comparison such as:

```js
{ field: "sales", gte: 10, lt: 100 }
{ field: "region", oneOf: ["North", "South"] }
{ region: "North" }
```

`where()` changes membership, `highlight()` changes attention, and `focus()`
changes only the camera.

## Chart types

### `area(data?)`

```ts
.baseline(number)
.curve(d3AreaCurveName)
.connect("adjacent" | "across")
.breakdown(field, options?)
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
.flip(options?)
.rollup(groupby, options?)
.breakdown(detail?, options?)
```

### `unit(data?)`

```ts
.value(field, { maxUnits? })
.group(field)
.layout("grid" | "force" | "bar" | "beeswarm", { columns?, radius? })
.columns(number)
.radius(number)
```

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
  d3,
  aq,
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

const story = await sequence([revenue, profit, ranked], { target: "#chart", d3 });

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

await vd.mount(salesByRegion, { target: "#chart", d3 });

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
