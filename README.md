# VisDelta

VisDelta is a declarative visualization-transition library. Describe a chart
before and after a change; VisDelta finds the difference and lets any external
control play or seek the transition.

```text
Data -> Chart state -> Difference -> Transition -> Frame
```

```js
import { bar } from "visdelta/bar";
import { transition } from "visdelta/transition";
import "visdelta/style.css";

const revenue = bar(rows)
  .x("category")
  .y("revenue")
  .key("category");

const profit = revenue.y("profit");
const change = await transition(revenue, profit, {
  target: "#chart"
});

change.progress(0.42);
change.play({ duration: 800 });
```

Chart states are immutable: creating `profit` does not change `revenue`.

## Install

```sh
npm install visdelta@0.2.0
```

`0.2.0` is the first-release candidate in this checkout. VisDelta includes its
D3 runtime. Declared transforms such as `.where()`, `.sort()`, `.breakdown()`,
and `.rollup()` need no extra package.

VisDelta expects tidy input. Data cleaning and reshaping belong before the
library.

## Chart types

| Import | Use |
| --- | --- |
| `visdelta/area` | Ordered magnitude and composition |
| `visdelta/bar` | Categorical comparison |
| `visdelta/line` | Ordered trends |
| `visdelta/point` | Relationships between quantities |
| `visdelta/unit` | Countable items in `grid`, `force`, `bar`, or `beeswarm` layouts |

The chart modules are peers. Each owns its builder, compiler, marks, axes,
matching, and transition rules. Core has no branches for built-in chart types.

```js
base.where({ region: "North" })     // remove other rows
base.highlight({ region: "North" }) // keep rows; change attention
base.focus({ region: "North" })     // keep rows; move the camera
```

Every visual mapping is explicit. VisDelta can supply presentation defaults,
but it never decides that a data field should mean x, y, color, size, or detail.

## Public entries

| Entry | Responsibility |
| --- | --- |
| `visdelta` | All built-in builders plus the core API |
| `visdelta/core` | State normalization, data types, camera math, and `delta()` |
| `visdelta/transition` | `transition()`, seek, play, pause, resize, and destroy |
| `visdelta/area`, `/bar`, `/line`, `/point`, `/unit` | Focused chart modules |
| `visdelta/plugins` | Define and register independent chart modules |
| `visdelta/chart-style` | Structural chart-style modules |
| `visdelta/browser` | Browser-global dependency adapter |
| `visdelta/style.css` | Required chart styles |

## Design rules

- Every frame is true: marks, scales, ticks, grid lines, and titles agree.
- Exit marks before changing the scale; change the scale before entering marks.
- Canonical reversible paths use the same frames backward; explicit directional easing profiles are an exception (see [design rules](docs/language-framework.md#reverse-means-the-same-frames-backward)).
- `focus()` is a camera move, never a data filter.
- Core stays chart-agnostic; chart-specific behavior stays in its module.
- Public terminology uses plain English and has no greenfield compatibility aliases.

See the [design principles](docs/language-framework.md), [API
reference](docs/reference.md), and the [five live labs](docs/examples.md).

## Development

```sh
npm ci
npm run check
npm run build
npm run docs:check
npm run test:browser
```

Run the docs locally:

```sh
npm run docs:dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before adding a chart type. Generated
`dist/`, VitePress output, test results, and screenshots are not source files.

Released under the MIT License.
