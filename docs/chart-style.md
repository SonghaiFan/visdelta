# Chart style

Style changes presentation, never data meaning or transition meaning.

<ChartStyleGallery />

## Use a preset

The built-in structural presets are `d3ChartStyle` (the default),
`paperChartStyle`, `darkChartStyle`, and `editorialChartStyle`. Pass one to the
transition; both endpoints use the same style.

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

## Editorial style

`editorialChartStyle` is an opt-in preset that treats a chart as ink on paper.
The default remains `d3ChartStyle`.

```js
import { editorialChartStyle } from "visdelta/chart-style";

await transition(from, to, { target: "#chart", chartStyle: editorialChartStyle });
```

- **Neutral ink.** Undeclared marks use a warm near-black (`#1f1e1b`) on a warm
  paper surface (`#fbfaf7`).
- **The same palette.** Declared categorical colors keep VisDelta's palette,
  the colors of the logo. Editorial changes surface and ink, not data hues.
- **Hairline structure.** Grid lines are 0.75px, axis rules use a light outline
  tone, and Point connectors such as lollipop stems are 1px quiet ink, so the
  data carries the visual weight.
- **Flat figure.** No border, radius or shadow; whitespace separates the chart
  from surrounding content.
- **Readable numerals.** Tick labels use a medium weight and tabular figures, so
  values stay aligned while they change during a transition.

Bars keep square corners in every style.

## Define a structural style

```js
import { defineChartStyle } from "visdelta/chart-style";

const compact = defineChartStyle({
  key: "compact",
  tickSpacing: { x: 56, y: 44 },
  legendPosition: "right",
  plot: { grid: "horizontal", margin: { top: 48, right: 88 } }
});
```

A chart-style module can set spacing, margins, grid policy, domain lines, title
placement, and legend placement. Themes contain no chart-name table. A plugin
declares its local defaults once through `presentation`; VisDelta resolves those
defaults with the active theme when the plugin is instantiated:

```js
defineChartType({
  key: "custom",
  presentation: {
    plot: {
      margin: { top: 36, right: 20, bottom: 40, left: 44 },
      grid: "horizontal"
    }
  },
  createRenderer(runtime, presentation) {
    // presentation.theme: active structural theme
    // presentation.plot: complete resolved plot rules
  }
});
```

Values merge in order: neutral defaults, plugin defaults, then explicit theme
overrides, including individual margin fields. The same resolved presentation
supplies the chart margin and renderer, so axes do not resolve styles again.
Both `createRenderer` and `createChart` receive this result. Omitting local
presentation still resolves neutral defaults and theme overrides, including
the margin. Authored `spec.margin` remains the final layout override.

Theme margins are preferred spacing, not fixed reservations. At render time,
horizontal and vertical whitespace adapt independently to the container while
axis text keeps its font size. Tick-label widths contribute to the left inset.
A color legend reserves space only when it exists: Paper prefers the right
side when at least 60% of the width remains for the plot, otherwise the legend
wraps across the top. Top space accounts for the legend rows and axis title.
An individual label wider than the available space is not automatically truncated.

Each transition uses the maximum required margins across its endpoints and
generated intermediate states. Resizing recalculates this shared layout, so
scrubbing does not change the plot bounds independently of its marks.

## Ownership

- `src/styles.css` owns shared CSS tokens and selectors.
- A chart-style module owns shared structural presentation.
- Each chart module owns how its axes, grids, margins, and marks use those rules.

Every visual encoding remains explicit in the chart state. A style can change a
palette for an already-declared color mapping; it cannot decide to map a field
to color.

Without a color declaration, marks use the style's neutral ink and no color
legend: warm near-black (`#1f1e1b`) in the default preset, black (`#000000`)
in Paper, and white (`#ffffff`) in the Dark preset. Declare `.color(...)` explicitly when color
should encode a field or a specific authored color is required.

The standalone theme CSS entries—`default.css`, `dark.css`, and `paper.css`—are
token presets for pages that prefer CSS selection. They do not add chart
grammar.
