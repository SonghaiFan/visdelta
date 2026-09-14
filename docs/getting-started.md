# Getting started

VisDelta declares immutable chart states and creates a seekable transition
between two states of the same chart type. The application supplies progress.

## Install

```sh
npm install visdelta@0.2.0
```

The new package identity is currently a `0.2.0` release candidate in this
checkout; the command becomes valid after publication.

VisDelta includes the D3 and Arquero runtime used by rendering and transforms,
so chart code does not install, import, or pass either dependency separately.

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

Continue with the [interactive reference](/reference), [chart types](/chart-types),
and [design rules](/language-framework).
