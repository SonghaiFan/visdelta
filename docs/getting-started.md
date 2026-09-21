# Getting started

VisDelta declares immutable chart states, describes what changed between them,
and creates a seekable transition between states of the same chart type. The
application supplies progress.

## Install

```sh
npm install visdelta
```

VisDelta includes the D3 runtime used by rendering. Declared transforms run
within VisDelta; chart code does not install or pass another dependency.

## Declare two states

```js
import { bar } from "visdelta/bar";
import { transition } from "visdelta/transition";
import "visdelta/style.css";

const rows = [
  { category: "A", revenue: 12, profit: 5 },
  { category: "B", revenue: 18, profit: 11 },
  { category: "C", revenue: 9, profit: 7 }
];

const revenue = bar(rows)
  .x("category")
  .y("revenue")
  .key("category");

const profit = revenue.y("profit");
```

The second declaration branches from the first. It does not mutate `revenue`.

## Inspect the difference

```js
import { delta } from "visdelta/core";

delta(revenue, profit).stateChanges;
// [{ category: "encoding", action: "remap", channel: "y" }]
```

`stateChanges` answers what changed using seven non-exclusive categories:
Data, Grain, Encoding, Coordinate, Layout, Attention, and Appearance. The array
is an inspection result, not a playback schedule.

Data actions are reported only when the endpoint evidence supports them. Add
`.datumKey("id")` when source records have a stable identifier; VisDelta does
not guess value updates from row position.

## Create and control the transition

```js
const change = await transition(revenue, profit, {
  target: "#chart"
});

change.progress(0.42);
change.play({ duration: 800 });
change.play({ from: 1, to: 0 });
change.pause();
change.resize();
change.destroy();
```

`progress(value)` accepts a normalized value from 0 through 1. A range input,
button, gesture, route, timer, or scroll adapter can provide that value.

Continue with the [ontology and contracts](/language-framework), [interactive
reference](/reference), and [chart types](/chart-types).
