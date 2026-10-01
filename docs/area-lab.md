# Area transition behavior

Try these scenarios in the unified [Playground](/playground#area/split).

These sixteen editable scenarios use one 54-row tidy US unemployment dataset
to exercise VisDelta's Area module. Each source row is one month and industry;
the sample contains eighteen months for three industries.
The demo asset adds `year` and the industry's `share` of that month's total
before it enters VisDelta; the library receives tidy rows and performs no data
cleaning. The scenarios cover scales, mappings, keyed observations, filtering,
focus, layer and x-range highlight, fill, baseline, stream layout, and reversible
total/stacked changes.

An Area observation still owns half the interval to each neighbour for identity,
transition, and hit testing. A temporal highlight does **not** inherit that
ownership boundary: its foreground overlay is clipped at the exact scale
positions of the authored range. Therefore a range beginning on September 1
starts at `x(new Date("2008-09-01"))`, not at the midpoint from August.

Area is a **band**, not a filled Line. Every x position has a lower boundary
`y0` and an upper boundary `y1`:

- ordinary Area uses `.baseline(0)` for `y0` and the mapped `.y()` value for
  `y1`;
- Stacked Area computes both boundaries from the cumulative values of each
  `.breakdown()` part;
- `.layout("stream")` orders those parts inside-out and applies D3's wiggle
  offset, producing a curved baseline that keeps the stream visually centered;
- positive and negative values accumulate on opposite sides of the baseline.

Area inspection follows that same model. Moving anywhere across the plot first
selects the nearest x observation; pointer height then selects a layer in a
stack. It keeps Line's dashed gray rule and callout, but uses two dots to mark
the selected band's current `y0` and `y1`. The callout stays beside the band,
flipping between its left and right sides near an edge. It defaults to the x
value, layer name when present, and mapped measure. `.tooltip()` adds
declared fields without exposing Area's internal cell or lineage keys. The
dots read rendered boundary positions, so they stay aligned during playback
and progress scrubbing.

Stream defaults to D3's `wiggle` offset and `insideOut` order. Customize either
with `.layout("stream", { offset, order })`:

```js
const stream = detailed.layout("stream", {
  offset: "silhouette", // none | expand | diverging | silhouette | wiggle
  order: "appearance"   // none | reverse | appearance | ascending | descending | insideOut
});
```

`silhouette` places the total stream's center at zero; `wiggle` minimizes its
weighted movement. The `diverging` offset supports signed values. Other stream
offsets are most meaningful with non-negative values. Stream layout owns its
baseline, so `.baseline()` applies to ordinary and fixed stacked Area instead.

On an ordinal x axis, Area exists **between connected observations**. Each
observation owns half of the space to its previous neighbour and half of the
space to its next neighbour. The first observation in a connected stretch owns
only its right half; the last owns only its left half. A stretch with only one
observation draws no Area: one point has no connection, so it cannot enclose a
filled band. Use Point when an isolated observation itself should stay visible.

Color is explicit. `.breakdown("industry")` creates stack geometry but does not
silently assign hues. Pass a color range to `.breakdown()`, or chain
`.color("industry")`. Area has no contrasting default border, so without a
color mapping adjacent layers intentionally remain one visual fill.

Split and merge are one transition evaluated in opposite directions. The
single total stays behind the entering stacked layers. First, a one-pixel
contrast divider is drawn along each internal cumulative boundary. It uses the
same `mix-blend-mode: difference` rule as stacked Bar, so it reads against the
area beneath it without choosing a fixed light or dark color. The detailed
fills then appear over the total. Merge reuses those cached frames backward:
the colors disappear and the divider erases itself. The divider is absent from
both endpoints and exists only while the transition explains the split or
merge. There is no separate merge effect.

Stacked and stream layouts also share one cached boundary transition. Each
layer keeps the same observations while its `y0` and `y1` boundaries move from
the fixed stack to the inside-out wiggle stack. Returning to stacked evaluates
those exact frames backward, including the changing y scale and axes.

Observation membership also has one rule. Restore and Add place each new keyed
observation at its target x with zero thickness (`y1 = y0`), then grow it to its
authored value while the surviving Area geometry updates over the same progress
window. This works in the middle and at either endpoint. Filter and Remove show
those same simultaneous frames backward: leaving cells flatten and fade while
the connected boundaries update, rather than finishing one action before
starting the other. The polygon stays ordered and never tears into crossed
triangles.

Like Line, Area defaults to `.connect("adjacent")`. Filtering observations out
of the middle leaves separate connected stretches at their original x
positions. Use `.connect("across")` only when joining the surviving observations
is the intended statement.

Area cells remain separate SVG paths so their identities and boundaries can be
animated independently. The renderer covers subpixel antialias seams with a
one-pixel stroke that always matches each cell's fill. This is a rasterization
guard, not an authored outline or an additional Appearance encoding. During a
fade, stable, entering, and exiting cells are composited as isolated cohorts;
the renderer never applies partial opacity separately to overlapping seam
strokes.

Area uses the same plain `.curve("curveName")` grammar as Line. The name is an
exact D3 export such as `curveLinear`, `curveMonotoneX`, `curveNatural`, or
`curveStep`; VisDelta does not rename it. D3's `curveBundle` is the one Line-only
exception because it does not implement the Area curve interface. When the
curve changes, VisDelta matches points along the rendered SVG paths so the
boundary does not switch shape abruptly at progress zero.

Every example imports only the focused Area module and the generic transition
entry. The Area builder, compiler, stack geometry, renderer, and transition
rules live together under `src/charts/area/`; Core contains no Area branch.
