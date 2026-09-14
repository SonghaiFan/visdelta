# Chart style

Style changes presentation, never data meaning or transition meaning.

<ChartStyleGallery />

## Use a preset

The built-in structural presets are `d3ChartStyle`, `paperChartStyle`, and
`darkChartStyle`. Pass one to the transition; both endpoints use the same style.

```js
import { paperChartStyle } from "visdelta/chart-style";

const change = await transition(from, to, {
  target: "#chart",
  chartStyle: paperChartStyle
});
```

Import `visdelta/style.css` once. The runtime scopes the selected preset to its
own `.vd-style-*` root, so multiple transitions can use different styles on one
page.

## Define a structural style

```js
import { defineChartStyle } from "visdelta/chart-style";

const compact = defineChartStyle({
  key: "compact",
  tickSpacing: { x: 56, y: 44 },
  legendPosition: "right",
  charts: {
    point: { grid: "both", margin: { top: 48, right: 88 } },
    bar: { grid: "horizontal" }
  }
});
```

A chart-style module can set spacing, margins, grid policy, domain lines, title
placement, and legend placement. Omitted values inherit the D3-inspired
default.

## Ownership

- `src/styles.css` owns shared CSS tokens and selectors.
- A chart-style module owns shared structural presentation.
- Each chart module owns how its axes, grids, margins, and marks use those rules.

Every visual encoding remains explicit in the chart state. A style can change a
palette for an already-declared color mapping; it cannot decide to map a field
to color.

The standalone theme CSS entries—`default.css`, `dark.css`, and `paper.css`—are
token presets for pages that prefer CSS selection. They do not add chart
grammar.
