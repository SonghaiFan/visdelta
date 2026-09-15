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
Arbitrary seek order is supported. For fixed data, size, style, and a
direction-independent motion profile, directly seeking to a progress value
returns the same frame. Opt-in `directionalEase()` profiles, including Unit's
directional bounce, also depend on seek direction; they preserve endpoints and
matching but are not strict frame reversal.

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

Endpoint states do not determine a unique route. Automatic intermediate states
are the chart's constrained default choice; use `sequence()` to require
particular waypoints. Those authored states are fixed boundaries, not hints the
planner may discard. A leg may still contain additional inferred states.

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

Each adjacent transition may include automatically inferred intermediate
states. For example, additive Bar detail can merge while retaining its focus,
then return the camera to the complete chart. These generated steps occupy
the existing leg: they do not add entries to `states`, move authored integer
positions, or increase the leg duration passed to `play()`.

## Keeping a chart on screen

The runtime keeps no registry of mounted charts. Hold a transition at an
endpoint and let the application own the current state:

```js
let state = byRegion;
let held = await transition(state, state, { target: "#chart" });
held.progress(1);

async function go(next) {
  const change = await transition(state, next, { target: "#chart" });
  held.destroy();
  held = change;
  state = next;
  change.play({ duration: 700 });
}
```

Every grammar call returns a new immutable state, so `go(state.focus(...))` is
the whole update. Note that a second `.focus()` narrows the existing camera
scope: `state.focus(North).focus(South)` means their intersection, so use
`state.reset().focus(South)` to replace North with South.

For a path through several states, build them up front and use `sequence()`;
it hands off at shared endpoints, so `A → B → C` never shows an empty frame
between legs.
