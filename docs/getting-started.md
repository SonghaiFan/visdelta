# Getting started

VisDelta works in any modern browser. Give it two immutable chart states and a
DOM target; it creates one transition that can play, reverse, pause, or seek to
any progress value.

## See the model first

The example below changes only the y mapping. Drag the slider, then play the
same frames in either direction.

<GettingStartedDemo />

```text
data → revenue state → profit state → transition → progress
```

The chart is not two screenshots crossfading. Marks, scales, ticks, and labels
are evaluated together at every frame.

## Vanilla HTML with a CDN

Save this as `index.html` and open it through a local web server. The root
`+esm` URL follows the same jsDelivr convention as D3: jsDelivr selects
VisDelta's ESM entry and rewrites its version-pinned `d3-*` dependencies.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My first VisDelta transition</title>
    <link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/visdelta@0.3.0/dist/visdelta.css">
  </head>
  <body>
    <div id="chart"></div>
    <input id="progress" type="range" min="0" max="1" step="0.01" value="0">

    <script type="module">
      import * as vd from
        "https://cdn.jsdelivr.net/npm/visdelta@0.3.0/+esm";

      const rows = [
        { category: "Hardware", revenue: 12, profit: 5 },
        { category: "Software", revenue: 18, profit: 11 },
        { category: "Services", revenue: 9, profit: 7 }
      ];

      const revenue = vd.bar(rows)
        .x("category")
        .y("revenue", { title: "Revenue" })
        .key("category");

      const profit = revenue.y("profit", { title: "Profit" });
      const change = await vd.transition(revenue, profit, { target: "#chart" });

      progress.addEventListener("input", event => {
        change.progress(event.currentTarget.valueAsNumber);
      });
    </script>
  </body>
</html>
```

Browsers restrict module loading from `file://`. In the file's directory, run
any static server you already use—for example `npx serve`—and open the local URL
it prints. See [using VisDelta from a CDN](/for-cdn-users) for the global-script
route and focused module URLs.

`vd` is simply the local namespace chosen by `import * as vd`; it does not add a
global variable. This form makes the package boundary visible in a standalone
page, much like `import * as d3`. Application code can use named imports instead.

## Install from npm

Use the package route when your application already has a build tool.

::: code-group

```sh [npm]
npm install visdelta
```

```sh [pnpm]
pnpm add visdelta
```

```sh [yarn]
yarn add visdelta
```

:::

Import the chart type and transition runtime you use, plus the required CSS:

```js
import { bar } from "visdelta/bar";
import { transition } from "visdelta/transition";
import "visdelta/style.css";
```

Focused package entries keep Area, Bar, Line, Point, and Unit as independent
peers. Importing `visdelta` from the package root is also supported when a
single convenient entry is preferable.

## Read the first transition

### 1. Declare one chart state

```js
const revenue = bar(rows)
  .x("category")
  .y("revenue", { title: "Revenue" })
  .key("category");
```

A state describes facts: its data, grain, encodings, layout, attention, and
appearance. It is not an animation command.

### 2. Branch to the next state

```js
const profit = revenue.y("profit", { title: "Profit" });
```

Chart states are immutable. `profit` reuses the declaration and data from
`revenue`; it does not modify `revenue`.

### 3. Create one transition

```js
const change = await transition(revenue, profit, {
  target: "#chart"
});
```

Both endpoints must use the same chart type. VisDelta compares them, loads that
chart's renderer, matches corresponding marks, and prepares a seekable route.

### 4. Supply progress

```js
change.progress(0.42);                 // seek to one exact frame
change.play({ duration: 800 });        // play 0 → 1
change.play({ from: 1, to: 0 });       // play the same route backward
change.pause();
change.resize();
change.destroy();
```

Progress is normalized from `0` through `1`. A slider, button, scroll position,
gesture, route, or application timeline can control it. Call `resize()` after
the target changes size and `destroy()` when the view is removed.

## Inspect what changed

Inspection is separate from playback:

```js
import { delta } from "visdelta/core";

delta(revenue, profit).stateChanges;
// [{ category: "encoding", action: "remap", channel: "y" }]
```

The seven categories—Data, Grain, Encoding, Coordinate, Layout, Attention, and
Appearance—describe endpoint differences. They are not a phase order or an
animation script. Add `.datumKey("id")` when source rows have stable identity;
VisDelta does not infer record updates from row position.

## Where to go next

| Goal | Next page |
| --- | --- |
| Choose Area, Bar, Line, Point, or Unit | [Chart types](/chart-types) |
| Filter, sort, aggregate, or load data | [Data and transforms](/data-sources-and-transforms) |
| Understand state differences and routes | [Ontology and contracts](/language-framework) |
| Connect play, seek, resize, and lifecycle | [Transition runtime](/runtime-api) |
| Try editable examples | [Transition labs](/examples) |
