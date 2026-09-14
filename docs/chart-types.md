# Chart types

VisDelta ships five peer chart modules. Import a focused module when an
application uses one chart type:

```js
import { line } from "visdelta/line";

const chart = line(rows)
  .x("date", { type: "temporal" })
  .y("close")
  .key("date");
```

Every chain creates a new immutable state. `.toSpec()` returns a detached plain
object.

## Shared grammar

These methods are available on every chart state:

| Method | Meaning |
| --- | --- |
| `.data(source)` | Use tidy inline rows, `{ values }`, a CSV/JSON URL, or a named source |
| `.x(field, options?)`, `.y(...)` | Map fields to position |
| `.channel(name, field, options?)` | Declare another channel |
| `.color(valueOrField, options?)` | Declare a literal or data-driven color |
| `.size(field, options?)` | Declare a quantitative size mapping |
| `.key(fieldOrFields)` | Match the same item between states |
| `.tooltip(items)` | Declare tooltip fields |
| `.sort(field, order?)` | Sort the current tidy rows |
| `.where(selector)` | Keep matching rows; other marks exit |
| `.highlight(selector, options?)` | Keep all rows; change attention |
| `.focus(selector)` | Keep all rows; fit the camera around matching marks |
| `.axis(config)` | Change the coordinate view or axis order |
| `.transition(timing)` | Set duration, easing, or explicit stagger |

Visual mappings are never inferred. For example, `.breakdown("region")`
declares detail but does not silently add `.color("region")`.

## Area

`area()` shows magnitude over an ordered dimension and supports stacked detail.

| Method | Meaning |
| --- | --- |
| `.baseline(number)` | Set the ordinary area baseline |
| `.curve(d3CurveName)` | Use an exact D3 curve export supported by `d3.area()` |
| `.connect("adjacent" | "across")` | Preserve gaps or connect across filtered observations |
| `.breakdown(field, options?)` | Split a total into stacked layers |
| `.rollup(options?)` | Combine stacked layers into a total |

Area owns `y0`/`y1` geometry. Its divider appears only during a detail
transition; endpoints have no default border.

## Bar

`bar()` compares categories through a shared quantitative baseline.

| Method | Meaning |
| --- | --- |
| `.flip(options?)` | Switch horizontal and vertical orientation |
| `.breakdown(field?, options?)` | Split totals into detail |
| `.rollup(groupby?, options?)` | Combine detail into totals |
| `.segment(fieldOrConfig?, config?)` | Configure segmented bars explicitly |
| `.layout("simple" | "grouped" | "stacked", options?)` | Change bar layout |

Bar owns baseline-preserving enter/exit, grouped and stacked geometry, and
reversible split/merge paths.

## Line

`line()` shows an ordered trend. `.key()` identifies observations inside the
SVG path, not only separate point elements.

| Method | Meaning |
| --- | --- |
| `.curve(d3CurveName)` | Use any exact D3 line-curve export |
| `.connect("adjacent" | "across")` | Keep honest gaps or connect across them |
| `.strokeWidth(number)` | Set line width |
| `.pointSize(number)` | Set point radius |
| `.flip(options?)` | Swap the position mappings in an explicit order |
| `.breakdown(field, options?)` | Split one line into series |
| `.rollup(options?)` | Combine series into one line |

Adding an observation extends the line before revealing its point. Removing or
filtering runs the same frames backward: the point leaves before the segment
retracts.

## Point

`point()` places observations on compact Cartesian axes. It covers scatterplots,
dot plots, dumbbells, and lollipops without changing datum identity.

| Method | Meaning |
| --- | --- |
| `.pointSize(number)`, `.radius(number)` | Set a constant point radius |
| `.connector({ from, channel? })` | Draw a lollipop stem from a quantitative baseline |
| `.connector({ by, orderBy? })` | Connect adjacent dots within each ordered group |
| `.flip(options?)` | Swap x and y in an explicit order |
| `.rollup(groupby, options?)` | Combine details into summary points |
| `.breakdown(detail?, options?)` | Reveal detailed points |

An ordinary entering point grows at its target position. Summary/detail motion
may use a declared parent position because that movement carries meaning.
Connectors are Point-owned derived geometry: they sit behind the dots and never
become object identity. Baseline connectors grow from `from` to each dot;
grouped connectors connect adjacent members after optional ordering.

## Unit

`unit()` turns counts or rows into individually matched circles.

| Method | Meaning |
| --- | --- |
| `.value(field, { unitValue?, maxUnits? })` | Expand a count field into units; `unitValue` is the quantity per circle |
| `.group(field)` | Declare categorical membership without choosing color |
| `.layout("grid" | "force" | "bar" | "beeswarm", options?)` | Arrange the same units |
| `.columns(number)` | Set grid or unit-bar columns |
| `.radius(number)` | Set requested unit radius |
| `.x(field, options?)`, `.y(field, options?)` | Declare force targets; x also positions a beeswarm |

`force` records a D3 simulation's ticks as a reversible physical path and maps
progress to its cumulative movement. With no positional channel, every unit is
attracted to the plot center. An explicit x or y channel instead supplies a
per-unit `forceX` or `forceY` target through that channel's scale; categorical
fields therefore form labelled attractor bands without being inferred from color.
`bar` centers each unit stack on its category tick.
`beeswarm` uses a non-overlapping placement along x. Layout changes preserve matching keys;
remaining unmatched units use a global minimum-travel assignment. Unit layout
changes use a short bounded per-mark stagger unless the author overrides it.

The [interactive reference](/reference) covers exact runtime signatures. Each
lab shows the chart-owned transition rules with real data.
