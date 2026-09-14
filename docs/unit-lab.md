# Unit transition lab

These fifteen editable scenarios use the 150-observation Iris dataset to define
the first complete transition matrix for VisDelta's Unit module. Each flower is
one row and one unit. The added `flowerId` field gives every observation a stable
identity, including the two flowers whose measurements are otherwise identical.

A Unit chart treats quantity as **countable, equal marks**. With raw observation
data, each row is one unit. With `.value("count")`, each row creates that many
units. A unit keeps the same size and identity across states; position, layout,
and color explain how the units are organised.

The public grammar separates meaning from arrangement:

- `.group("team")` declares which categorical group owns each unit;
- `.layout("bar")` arranges those groups as unit bars;
- `.layout("grid")` makes one overall grid;
- `.layout("force")` packs units around the center or around explicitly mapped
  x and y force targets;
- `.x("year").layout("beeswarm")` places units around mapped positions without
  overlaps.

That separation is deliberate. `.group()` never silently changes layout or
color. Add `.color("team")` only when color should also carry the category.

```js
const byTeam = unit(rows)
  .value("count")
  .key("id")
  .group("team")
  .layout("bar", { columns: 3 })
  .color("team");
```

Most lab scenarios do not call `.value()`: they keep the Iris observation grain.
The represented-quantity scenario explicitly aggregates a small Iris sample to
counts and changes `unitValue` from `4` to `1`.

Unit does not expose `.rollup()` or `.breakdown()`, but changing `unitValue`
does change visual grain. Each coarse circle owns the quantity interval it
represents. On split, its finer overlapping intervals emerge from that specific
parent circle; on merge, those same children gather back into it. During motion,
the crisp endpoint dots hand visibility to the same temporary liquid-like
parent/child silhouette used by Point Blend. Parent radius is transferred only
while its children remain visually connected, and both authored directions
evaluate one cached coarse-to-fine path.

`.focus()` uses the same Core camera as every other chart type. Unit contributes
only each circle's visual bounds; Core applies one 2D pan and zoom while all 150
unit identities remain present.

Layout changes follow one reversible path: **Set view → move units**. Matching
always keeps the same key first, however far that unit needs to travel. Only
source and target units that cannot be paired by key are matched to open slots
using the shortest total travel. Short trips start before long trips to reduce
visual overlap. The opposite transition preserves those keyed assignments and
reverses the phase order: units move first, then the old view returns.

Bar and beeswarm layouts make that path more specific: **Set view →
move across → fall**. Every existing unit first reaches its truthful x position
while keeping its old height. It then falls into the bar or non-overlapping
swarm.
Downward travel uses a short bounce; upward travel settles without pretending
that gravity points upward. Reverse playback preserves the same keyed route and
reverses the phase order, but chooses easing from the actual screen direction:
down can bounce; up never does.

The `force` layout starts from the marks' current positions and records every
tick of a deterministic D3 simulation. Those positions become the transition
trajectory: progress seeks between adjacent ticks, and reverse reads the same
ticks backward. Centering and collision are therefore visible in every frame
without leaving a live simulation running after the endpoint. The sample count,
starting alpha, minimum alpha, and alpha decay are coupled so the final recorded
tick is cooled. Playback re-parameterizes that shared path by the units'
collective movement, so rapid early ticks and tiny late ticks occupy a useful,
smooth progress range with gentle symmetric easing, without putting different
units on different simulation frames. A clean endpoint reuses the last recorded
position instead of reheating the simulation. Unit enter/update/exit and
key-first matching remain part of the same cached path.

Force position remains an explicit encoding. With no x or y channel, every unit
uses the plot center. `.x("species").layout("force")` instead makes the center of
each categorical x band that flower's `forceX` target and draws the explaining
axis. `.y(...)` works the same way with a reversed screen range. Color never
silently becomes a force target.

Unit transitions use a light per-mark delay by default. Layout changes order
marks by travel distance, so short moves start first; other Unit changes use
data order with a 4 ms step capped at 100 ms. Write
`.transition({ stagger: 0 })` when every unit should move together, or provide
an explicit `stagger` object to replace the Unit default.

<SyntaxPlayground mode="unit-lab" initial="bar" />

Every example imports only `visdelta/unit` and the generic transition entry.
The Unit builder, compiler, layouts, key-first matching, renderer,
identity, and transition rules
remain inside `src/charts/unit/`; Core does not know any Unit layout name.
