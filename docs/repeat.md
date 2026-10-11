# Repeat

`.repeat(field, options)` partitions a chart into small multiples in one SVG.
It is core chart syntax: the x and y bindings keep their meaning, each panel
gets its own coordinate frame, and one transition controller controls the chart.
Axis titles appear once in the ordinary chart style; panel ticks show each scale.

```js
const repeated = chart.repeat('component', {
  direction: 'y',
  scales: 'shared'
});
```

## Direction and scales

`direction: 'y'` places panels in rows; `'x'` places them in columns; `'grid'`
uses responsive columns. Grid is the default, with at most two columns,
24 pixels between panels and a 240-pixel minimum panel width. Configure these
with `columns`, `gap` and `minWidth`.

`scales: 'shared'` is the default: numeric domains use all transformed rows.
`'independent'` derives numeric domains separately in each panel. Independent
scales help inspect patterns within a panel, but bar lengths cannot be compared
across panels; Bars emit a nonblocking warning. Explicit domains take priority.
Categorical domains and colors remain consistent across panels.

## Canvas size and container resize

Repeat keeps the outer canvas height by default. Container width controls the
available width; panels are laid out again rather than scaling the SVG contents.
Fonts, strokes and point radii retain their normal dimensions.

Enable content-driven height explicitly:

```js
const repeated = chart.repeat('component', {
  direction: 'grid',
  autoHeight: true,
  minHeight: 240
});
```

`minHeight` is the minimum complete panel height, including its caption and axes.
It defaults to 240 pixels and applies only with `autoHeight: true`. Height grows
when necessary to fit the panel rows, gaps and outer margins; it never drops below
the normal canvas height. An explicit chart or transition `height` takes priority.
Without auto height, all rows share the fixed canvas height. The Playground
uses this same runtime policy; selecting a repeated snapshot does not force a
taller preview.

A transition reserves the largest height required by its route states at the
current container width. This height stays constant while playing, reversing or
scrubbing. Narrowing the container can add grid rows and increase the reserved
height when auto height is enabled.

Standalone `transition()` controllers observe container width automatically.
Resize recompiles geometry at the current progress and direction; paused frames
stay paused and playing transitions keep their existing clock. Marks, axes and
grids are evaluated together at the new size. `.resize()` remains available for
explicit refreshes, including theme changes. Container height is not inferred
from the chart's own rendered content; use explicit `height` to control it.

## Play, reverse and scrub

This live example turns keyed stacked segments into separate component baselines.
Change the arrangement or scale policy, then play, reverse or scrub.
Bars use their ordinary coordinate order: x/width then y/height for vertical
bars, y/height then x/width for horizontal bars. Authored axis order takes
priority. Position and size on the same axis move together; the other axis
stays fixed until its stage. Repeat direction changes panel arrangement,
not coordinate-stage order.
Reverse traverses these same frames backward.

When existing panels change arrangement, each keyed panel is a container
rectangle. The first half moves its x/width and y/height in separate stages;
the title, axes, grid and marks travel together. The child renderer updates
coordinates for the changing panel dimensions using the source data and scale
domains; SVG groups are translated without scaling fonts, strokes or circles. The second half reflows the chart inside the settled container,
using the child chart's own transition. Columns-to-rows is the canonical direction;
reverse restores the internal chart first, then returns the containers.
The container coordinate order is selected from panel geometry to avoid overlap during either stage. Text, strokes and point shapes retain their normal dimensions. This container route requires the same panel membership at both endpoints.

<RepeatMotionDemo />

## Supported transitions

Bars support flat ↔ repeated motion with unchanged mark membership, grain and
globally unique mark keys. Repeated Bars keep their ordinary flip and coordinate
planning; panel layout changes also use staged rectangle geometry.

Lines retain `mark: "line"` and their Line builder. An ordinary multi-series Line
can transition to `.repeat()` of its existing breakdown field and back. The
first half moves each complete series frame through separate container coordinate
stages; the second half reflows the internal chart, including independent scales.
Data, ticks and grid use the same interpolated coordinates throughout. Reverse follows the
same geometry backward. The bridge requires unchanged observations, series,
x/y bindings and declared domains, with globally unique observation keys.
Repeat bridges use chart-owned direct routes; declaration-operation planning is
unsupported for these states. Area, Point and Unit currently support repeat ↔
repeat transitions; their flat ↔ repeat bridge is unsupported.

Expansion or panel rearrangement combined with a flip is unsupported in a
single leg; use a sequence to separate these changes. Within an existing repeat,
panel identity scopes local mark keys for layout changes.

The facet binding is an Encoding change. Arrangement is Layout; changing numeric
scale sharing is Coordinate. Repeat does not aggregate or discard rows.
See the [API reference](./reference.md#native-small-multiples) for identity,
validation and fallback boundaries.

Each chart type also exposes a Repeat example under Layout in the [Playground](./playground.md).


In the Playground, floating previews are resizable by default. Hover over any
edge or corner to see the resize cursor, then drag to adjust that dimension. Width changes reflow panels; height changes are an explicit canvas
size override. The current transition progress is retained. Repeated panels
reserve space for their local ticks and legends; shared axis titles and panel
captions do not reserve duplicate space inside each plot.
