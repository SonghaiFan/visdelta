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

## Public modules

| Entry | Exports |
| --- | --- |
| `visdelta` | All built-in charts, `delta`, `transition`, data types, styles, and registration |
| `visdelta/core` | DOM-free state/difference helpers plus camera math |
| `visdelta/area`, `/bar`, `/line`, `/point`, `/unit` | One focused chart builder and module |
| `visdelta/transition` | Standalone transition controller |
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
