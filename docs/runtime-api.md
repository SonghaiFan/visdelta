# Transition runtime

## `transition(from, to, options)`

Creates one seekable transition between two states of the same chart type.

```js
const change = await transition(from, to, {
  target: "#chart",
  data: { sales: rows },
  height: 420,
  chartStyle: paperChartStyle
});
```

| Option | Meaning |
| --- | --- |
| `target` | CSS selector or element; defaults to `#app` |
| `d3` | Optional embedding override; VisDelta uses its shared D3 runtime by default |
| `aq` | Optional embedding override; VisDelta uses its shared Arquero runtime by default |
| `data` | Named tidy datasets used by either state |
| `height` | Explicit chart height |
| `chartStyle` | One structural style shared by both endpoints |

The runtime snapshots and resolves both states before mounting. If setup fails,
the previous target contents are restored.

## Controller

| Member | Meaning |
| --- | --- |
| `from`, `to` | Defensive copies of the authored endpoints |
| `delta` | Semantic difference between the resolved endpoints |
| `view` | Mounted chart-view element |
| `value` | Current progress |
| `progress(value)` | Pause playback and show one frame; direction is inferred from the previous value |
| `play({ duration?, from?, to? })` | Animate across any part of the `0`–`1` interval |
| `pause()` | Stop owned playback at the current frame |
| `resize()` | Recompile at the current container size and keep progress |
| `destroy()` | Stop playback and remove the mounted transition |

Finite progress is clamped to `[0, 1]`; non-finite values are rejected.
Arbitrary seek order is supported. For fixed data, size, style, and chart module,
directly seeking to a progress value returns the same frame.

```js
slider.addEventListener("input", event => {
  change.progress(event.currentTarget.valueAsNumber);
});

window.addEventListener("resize", () => change.resize());
```

Controls remain outside VisDelta. Buttons, sliders, scroll, gestures, routes,
media clocks, and tests all use the same `progress()` method.

Call `destroy()` when the host component unmounts.

## `sequence(states, options)`

Use `sequence()` when a chart has more than two authored states. It creates a
timeline of adjacent transitions rather than asking application code to tear
down and recreate one pair at a time.

```js
import { sequence } from "visdelta/transition";

const journey = await sequence([revenue, profit, ranked, revenue], {
  target: "#chart"
});

journey.progress(1.5);           // halfway through profit → ranked
journey.play({ duration: 850 }); // duration per adjacent leg
```

| Member | Meaning |
| --- | --- |
| `states` | Authored states in order |
| `value` | Timeline position from `0` to `states.length - 1` |
| `progress(value)` | Seek a leg or exact authored state; `1.5` is halfway through the second leg |
| `play({ duration?, from?, to? })` | Play across adjacent legs; duration applies to each leg |
| `pause()`, `resize()`, `destroy()` | Same lifecycle meaning as the pair controller |

All adjacent states must still use the same chart type. Repeat the first state
at the end when a sequence should return to its starting visual state.

## `mount(view, options)` and `select(target)`

`mount()` establishes a VisDelta-owned chart at a target. `select()` retrieves
that mounted endpoint later and applies a new grammar operation to it.

```js
await vd.mount(byRegion, { target: "#chart" });

await vd.select("#chart")
  .update(view => view.focus({ region: "North" }))
  .play({ duration: 700 });
```

`update()` returns a pending immutable state; it has no visual effect until
`play()`. The promise resolves to a motion object with its controller and live
chart handle. Selecting the host again is equally valid:

```js
await vd.select("#chart").update(view => view.focus({ region: "North" })).play();
await vd.select("#chart").update(view => view.reset().focus({ region: "South" })).play();
```

The explicit `reset()` matters here: a second `.focus()` narrows the existing
camera scope, so `focus(North).focus(South)` means their intersection rather
than “replace North with South.”

The same live chart can create a sequence from grammar callbacks. Each callback
receives the endpoint from the preceding step, so the path is authored as
`A → B → C`, not as unrelated chart remounts.

```js
await vd.select("#chart")
  .sequence([
    view => view.focus({ region: "North" }),
    view => view.highlight({ region: "North" }),
    view => view.sort("sales", "descending")
  ])
  .play({ duration: 850 });
```
