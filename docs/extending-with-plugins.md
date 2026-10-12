# Add a chart type

A chart type is an independent module. Core should work before that module is
imported and should not change when the module is added.

## Live chart plugin: Pie

This example loads the focused `visdelta/pie` module. It uses the same plugin
contract as an external chart package. Pie already exists in this checkout;
the source panels below show its actual implementation, including internal
imports. They are a source walkthrough, not a standalone external package.

<PiePluginDemo />

The selected value field determines each slice's fraction of the total.
The four records retain their keys while the renderer interpolates angles.
Play, reverse, and scrub all control the same VisDelta transition.

## Build a chart plugin from zero

Start with one small, explicit contract: one transformed row becomes one
slice, a declared nonnegative value determines its angle, and a stable key
identifies it. Complete direct rendering and reversible motion before adding
a planner. The following steps follow the Pie implementation above.

### 1. Separate state, meaning, geometry, and control

A plugin participates in the [four-layer constitution](./language-framework.md#the-four-layer-constitution).
Keep these questions separate:

| Layer | Pie example | Owner |
| --- | --- | --- |
| Identity | Does slice A remain slice A? | Core correspondence, using chart-declared mark keys |
| State difference | Did `angle` change from `before` to `after`? | Existing Encoding vocabulary |
| Transition plan | Is a direct pair sufficient? | Chart policy; Pie uses direct fallback |
| Frame and control | What are the angles at progress 0.5? | Renderer records tracks; controller supplies progress |

A fluent call produces a new state, not a queued animation instruction.
Changing the bound field is Encoding; changing values under stable source
identity is Data. Neither implies a split/merge trajectory.

### 2. Give each file one responsibility

For a separate package, begin with this small structure:

```text
my-pie/
  package.json
  index.js        # immutable builder and carried module
  module.js       # lazy loader
  plugin.js       # validation, identity defaults, renderer factory
  geometry.js     # transformed rows -> keyed angular geometry
  render.js       # keyed DOM joins and recorded motion
```

Use `visdelta` as a peer dependency with a range you have actually tested.
Declare the D3 packages you import as dependencies. Export your builder through
your package's `exports`; keep the renderer behind a dynamic import.
Import SDK contracts from `visdelta/plugins` and optional helpers from
`visdelta/toolkit`. Do not import `visdelta/dist/...` or another chart's internals.
The source panels use repository-relative imports because this Pie lives
inside VisDelta; an external implementation must adapt those imports and own
its geometry and identity adapter.

### 3. Define immutable authored slots

Pie maps `.value(field)` to `encoding.angle` and `.label(field)` to
`encoding.label`. It does not store computed angles in the public declaration.
`.innerRadius(fraction)` and `.labels(position)` remain independent
presentation controls.

A minimal external builder can use the public SDK like this. Use a distinct
key such as `example-pie` so it does not collide with the supplied Pie module.

```js
// index.js
import { ChartState, normalizeDataSource } from "visdelta/plugins";
import { chartModule } from "./module.js";

class PieState extends ChartState {
  chartModule() { return chartModule; }
  value(field) {
    return this.channel("angle", field, { type: "quantitative" });
  }
  label(field) {
    return this.channel("label", field, { type: "nominal" });
  }
}

export function pie(data) {
  return new PieState({
    mark: "example-pie",
    data: normalizeDataSource(data),
    encoding: {}
  });
}
```

Inherited `.key()`, `.color()`, and transforms still produce new states.
Use `this.channel()` and `this.with()` rather than mutating `encoding` or data.
Additional syntax needs a compiler only when it needs compilation:
the current Pie has no custom compiler. A custom compiler must declare its
`stateOrder` and matching handlers, as described in the builder contract below.

### 4. Carry a lazy module and declare capabilities

```js
// module.js
import { defineChartModule } from "visdelta/plugins";
export const chartModule = defineChartModule({
  key: "example-pie",
  load: () => import("./plugin.js")
});
```

The loaded module exports `plugin = defineChartType({ ... })` with the same
key. Supply `createRenderer`; add only the hooks needed by the chart.
Pie declares `scenes: []`, its margins, and `layoutChannels` exposing only
color because it draws no Cartesian axes. Its default mark key is the color
field, then the label field; an explicit `.key()` takes priority.

Validate declarations in `prepareSpec`. Current Pie rejects Cartesian
position channels and axes, focus cameras, angle scales/domains/ranges,
invalid label modes, and hole fractions outside `[0, 1)`.
Do not silently accept inherited syntax the renderer cannot honor.

A builder carries this module into `transition()`. When loading a plain JSON
spec, call `registerChartModule(chartModule)` from `visdelta/plugins` first.
Registration is for resolving a module by key; it does not add semantic
categories or teach Core how to draw arcs.

### 5. Validate transformed rows and establish identity

Geometry receives the rows after declared transforms, not just the source
array. Current Pie checks that the value field exists, values are finite and
nonnegative, keys are unique, and a nonempty chart has a finite positive total.
It rejects repeated categories instead of silently aggregating them.
Authors must request aggregation explicitly.

Source-record `datumKey` and slice `key` are different contracts. Preserve
the original row on geometry wrappers so tooltips and correspondence retain
their evidence. The repository's `pieSlices()` uses internal identity helpers;
an external implementation needs its own public-contract-compatible key
adapter. A minimal external version can require one explicit string key
field, validate uniqueness, and reject unsupported key forms rather than
guessing identity.

### 6. Derive polar geometry without changing data

For each value v and total T, the angular span is `2π × v / T`.
Cumulative spans determine start and end angles. Current Pie uses
`d3-shape`'s pie generator with `.sort(null)`, preserving the transformed
row order. A declared sort therefore remains meaningful.

Calculate the outer radius from available inner width and height. Derive the
hole radius by multiplying the outer radius by the authored fraction.
Keep angles, radii, label positions, and leader paths in renderer geometry;
they are not independent authored state-change operations.

### 7. Record motion that can be evaluated at any progress

Join paths by slice key. Entering slices begin with a collapsed angle and
zero radius; exiting paths fade through recorded motion and `.remove()`.
Current Pie retains the previous start/end angles and radii as SVG attributes.
Its `attrTween("d", ...)` interpolates those numbers and calls the arc generator
for each frame. It also records the numeric attributes for later rendering.

This is why a path moves as a wedge instead of interpolating unrelated SVG
string coordinates. Use the injected `runtime.motion` so separately bundled
plugins share the host recorder. Never schedule `selection.transition()`
or use start/end callbacks for state changes.

Use `runtime.colorScale` for declared colors and `runtime.bindTooltip` for
the host tooltip. Without a color binding, marks remain black.
Labels and leaders need their own keyed joins and cleanup. On resize, derive
geometry again from the new dimensions; a destination spec alone is not a
sufficient geometry cache key.

### 8. Keep planning optional and truthful

Current Pie has no declaration-operation codec and no automatic waypoints.
It uses the ordinary direct runtime fallback; this is a working transition,
not a promise of conserved split/merge motion or cross-chart morphing.
Its renderer also does not opt into cached transition evaluation.

If a future plugin needs automatic operation planning, first identify authored
slots and derived bindings. Implement a chart-owned codec that normalizes to
a fixed point, round-trips exactly, and validates every complete candidate
against transformed data. Keep the search bounded and deterministic.
Unsupported combinations must retain an explicit fallback. Do not introduce
a generic Core branch for your chart or treat the seven semantic categories
as an animation schedule.

### 9. Verify the plugin before distributing it

Use the existing `tests/pie.test.mjs` and `tests/browser/pie.spec.mjs` as
concrete starting points:

- Check bindings, input immutability, angular totals, unique keys, invalid
  values, unsupported declarations, and the exact emitted state changes.
- Compare transition endpoints with independent static renders at the same
  size. Test forward play, reverse play, scrubbing, membership cleanup,
  and narrow/desktop resize behavior.
- For multi-phase motion, inspect actual local phase progress. If you add a
  codec, also test deterministic routes, one operation per edge, valid
  complete states, replay, exact normalized endpoints, and inverse routes.
- Bundle an external plugin separately from its host. Test JSON registration,
  disposal, and an installed-package consumer; source imports alone do not
  verify package exports or recorder sharing.

The demo on this page is a focused official-module example. The repository
retains `examples/plugins/orbit/index.js` and its separate-bundle browser test
as an additional packaging fixture; it is not the chart taught on this page.

See [Pie syntax](./chart-types.md#pie) and
[implemented limits](./reference.md) before extending the example.

## Module contract

The runtime starts with no registered chart types, including when importing
the `visdelta` convenience entry. Builders carry their module reference.
Plain JSON specs require explicit `registerChartModule(module)`.
`visdelta/plugins` supplies module and builder contracts; `visdelta/toolkit`
supplies optional compiler utilities, `BaseChart`, and plot-style composition.
Neither entry imports an official chart implementation.

Plugins inherit no scene vocabulary: declare only the `scenes` your module
uses. Chart identity is the explicit `mark` key, never inferred from metadata.
The shared renderer services have no privileged built-in-only subset. Mark
layers are isolated by plugin key, so Core never cleans up shapes by guessing
which named chart owns a rectangle, circle, or path.


A compositor can set `ChartContext.sharedDomains` and supply `domainRows` from
all panels. Renderers should then use those rows for positional domains while
drawing only their panel rows. Line, Area and Point honor this context; ordinary
standalone rendering keeps its existing domain policy.

The module owns its builder, compiler, renderer, matching, transition plan,
axes, examples, and tests.

```js
import { defineChartModule, defineChartType } from "visdelta/plugins";

export const plugin = defineChartType({
  key: "custom",
  presentation: { plot: { margin: { top: 24, right: 20, bottom: 40, left: 44 } } },
  createRenderer: runtime => customRenderer,
  createSpecCompiler: context => customCompiler,
  prepareSpec: spec => spec,
  scenes: ["selection", "axis", "mapping"]
});

export const customModule = defineChartModule({
  key: "custom",
  load: async () => ({ plugin })
});
```

`customRenderer` and `customCompiler` are implementations supplied by the chart
package. Renderer helpers are supplied through `runtime`; the module must not reach
into another built-in chart.

A renderer does not receive a D3 object. Import the `d3-*` modules the chart
uses — `d3-selection`, `d3-scale`, `d3-shape`, … — exactly as any D3 code does.
VisDelta's own `d3-*` dependencies are ordinary, stateless modules, so a second
copy in a plugin bundle is harmless; `chart.g` is a plain `d3-selection`
Selection and interoperates by structure, not by instance.

## Renderer motion contract

For an independently bundled plugin, prefer `runtime.motion` from
`createRenderer(runtime)`. This uses the host's recorder even when the plugin bundle
contains another copy of the SDK. The standalone `motion` export requires the
renderer and host to share the same recorder module instance.

The same injected services are available to built-in and external renderers:

- Optional plot defaults are declared once with `presentation`. A renderer that
  needs them accepts `createRenderer(runtime, presentation)` and reads the active
  structural theme from `presentation.theme` and the complete merged plot rules
  from `presentation.plot`. Plugins without axes may omit presentation entirely.
- `runtime.tooltip.show(element, { clientX, clientY }, html)`, `move`, and `hide`
  use the common HTML tooltip. Escape any data inserted into HTML.
  `runtime.tooltip.svgPosition(frame, x, y)` converts a chart-space anchor to
  screen coordinates, so tooltip text does not scale with the SVG.
- `runtime.bindTooltip` provides the ordinary pointer-following tooltip.

The runtime contains host services: recorded motion, scoped CSS token access,
color registries, axes, grids, legends, and tooltips. Scale construction and
timing calculations are direct imports from `visdelta/toolkit`:

```js
import { bandOrLinear, position, easeFor, staggerDelay } from 'visdelta/toolkit';
```

`BaseChart` is an optional class adapter for `render()`. It owns no coordinate
system or axis defaults. Cartesian renderers may import `setCartesianState`
to publish their scales and position accessors to shared scene helpers.
Other coordinate systems can provide their own projection without inheriting
Cartesian behavior.

Themes declare capabilities rather than chart families, for example
`defineChartStyle({ key: 'compact', plot: { margin: { left: 24 } } })`.
Each official chart keeps its own layout defaults in its chart module.

A renderer joins data with D3 as usual, but animates through `motion()`, never
through `selection.transition()`. VisDelta seeks recorded property tracks;
D3's scheduler is timer-driven and cannot be sought, so anything it animates is
interrupted the moment the transition compiles.

```js
import { defineChartType } from "visdelta/plugins";
import { scaleLinear } from "d3-scale";

const plugin = defineChartType({
  key: "custom",
  presentation: { plot: { grid: "none" } },
  createRenderer: (runtime, presentation) => (chart, rows, spec) => {
  const x = scaleLinear().domain([0, 100]).range([0, chart.innerWidth]);
  const dots = chart.g.selectAll("circle.dot")
    .data(rows, row => row.id)
    .join("circle")
    .attr("class", "dot");

  runtime.motion(dots, chart.transition.base)
    .attr("cx", row => x(row.value))
    .style("opacity", 1);
  }
});
```

`motion(selection, base)` has the d3-transition authoring surface — `attr`,
`style`, `attrTween`, `styleTween`, `tween`, `text`, `delay`, `duration`,
`ease`, `easeVarying`, `remove`, chained `transition()` — and records property
tracks instead of scheduling anything. Three rules follow from seeking:

- `on("start" | "end" | …)` is rejected. Side effects do not seek; compute the
  end state up front.
- `remove()` detaches a node only when the transition finishes, never while
  seeking, so exited marks can be restored on reverse.
- `chart.transition.base`, `enter`, and `exit` are plain `MotionTiming`
  descriptors — `{ delay, duration, ease }` — not D3 transitions. A chart that
  needs its own stage timing builds another descriptor, typically sharing the
  chart's ease: `{ delay: 0, duration: 300, ease: chart.transition.base.ease }`.

`directionalEase(forward, reverse)` gives a track different easing per seek
direction.

## Builder contract

A compiler must declare `stateOrder`, for example `['packing', 'projection']`,
and provide an `operations` handler with the same name for each slot. Inputs
come from `spec.meta.state`. Execution follows that order; there is no implicit
selection, detail, or axis pipeline and no separate operation-name mapping.
Use `stateOrder: []` for a base-only compiler. Duplicate slots or missing
handlers are errors. Only executed slots are consumed; other metadata remains.
These slots are not ontology categories and do not automatically emit new
semantic changes.

A focused builder extends `ChartState`, compiles its own grammar, and returns
its module reference:

```js
import { ChartState, compileViewWithCompiler } from "visdelta/plugins";

class CustomState extends ChartState {
  chartModule() {
    return customModule;
  }

  compileSpec(spec) {
    return compileViewWithCompiler(spec, { scene: [] }, customCompiler);
  }
}

export function custom(data) {
  return new CustomState({ mark: "custom", data, encoding: {} });
}
```

That module reference is the normal path: `custom()` works with
`visdelta/transition` without importing the complete `visdelta` entry or
registering the chart globally.

Use `registerChartModule(customModule)` only for plain JSON specs, because a
plain object cannot carry a module reference.

## Runtime object

Chart plugins follow the [three governing contracts](./language-framework.md#transition-contracts):
states are facts, correspondence is evidence, and paths are chart-owned default
choices constrained by that evidence and the authored endpoints.

The `ChartTransitionPolicy` type groups the three existing transition hooks;
it does not add a second plugin API. `defineChartType()` takes them under
`transition`, while a `createChart()` runtime object exposes these names:

| `defineChartType` configuration | Runtime policy hook | Responsibility |
| --- | --- | --- |
| `transition.intermediateSpecs` | `intermediateSpecs(from, to)` | Choose complete waypoints in authored order, excluding endpoints |
| `transition.canonicalPair` | `canonicalTransitionPair(from, to)` | Select the shared evaluation direction for a pair |
| `transition.plan` | `resolveTransitionPlan(from, to)` | Choose motion steps and timing for one adjacent pair |

These hooks consume states without mutating them. They must not use builder
history as an animation script. Lineage describes correspondence; each chart
still checks whether the measure and layout support its chosen motion.

`IntermediateSpec.scene` is an optional execution hint. Omitting it lets each
leg's own difference supply the scene labels. Returning `[]` retains ordinary
direct motion. Generated waypoints are expanded once, not recursively planned;
an authored `sequence([A, B, C])` preserves B even if A-to-B gains waypoints.

The internal `TransitionRoute` assembles the chosen waypoints into adjacent
pairs and their canonical directions. It is DOM-free and does not choose
chart-specific geometry or timing. Core's public `TransitionPlan` carries only
shared evidence and controls such as lineage, mark correspondence, membership
timing, and generic phase diagnostics. A chart keeps any additional execution
choices in its own module-local plan type and narrows the shared plan at its
rendering boundary. For example, Bar's layout, enter, and exit actions are
available from `visdelta/bar` as `BarTransitionPlan`; they are not part of the
generic plugin contract. A transition plan describes one adjacent pair, not
the complete multi-state route. Explicit sequence continues to own authored
boundaries and delegates each pair to `transition()`.

Other runtime hooks retain their existing responsibilities:

| Hook | Responsibility |
| --- | --- |
| `createRenderer(runtime, presentation)` | Draw marks and chart-owned axes; the second argument is always fully resolved |
| `createChart(runtime, presentation)` | Construct a chart implementation; the factory supplies its default margin from the same presentation |
| `createSpecCompiler(context)` | Compile authoring state into a view spec |
| `prepareSpec(spec)` | Normalize chart-specific defaults |
| `presentation.plot.margin` | Declare default layout space; the active theme may override individual fields |
| `layoutChannels(spec)` | Optional: report the channels actually drawn when layout generates or hides axes; defaults to `spec.encoding`. Used only for spacing, never to mutate chart state |
| `transitionEvaluation` | Opt into cached frame evaluation; safe whenever the renderer animates only through `motion()` |

Only implement hooks the chart needs. Do not add chart-name switches or empty
extension hooks to Core.

## Official chart checklist

The [live Pie example](#live-chart-plugin-pie) exposes the current authoring,
module, plugin, geometry, and renderer sources. An official chart lives in
`src/charts/<name>/`; create compiler or state files only when needed. Then:

1. run `node scripts/sync-chart-manifest.mjs`;
2. add a focused package entry;
3. add authoring and real-browser transition tests;
4. add a live example with explicit data and state declarations;
5. update `chart-types.md` and the API reference;
6. update public types, classifier, constitution, and tests if vocabulary changes.

The inventory check keeps built-in lazy loading aligned with chart folders. A
focused-module browser test must prove that no unrelated built-in chart module
loads.

## Composable construction tools

`visdelta/toolkit` exposes optional tools, without importing or registering any
chart family:

- **Geometry:** `interpolatePathPoints` interpolates equal-length point lists;
  `matchRenderedPaths` and `matchPathStrings` sample SVG geometry and preserve
  exact endpoint path strings. SVG sampling requires a browser. Empty or
  unmeasurable geometry uses an endpoint step, not invented points.
- **Topology:** `connectedStretches` splits visible items at gaps in a reference
  order. Its default minimum run length is two; unknown keys use visible indices.
- **Matching:** `minimumTravelMatching` minimizes total Euclidean distance for
  a one-to-one assignment of the smaller set. `keyFirstTravelMatching` preserves
  matching keys first and applies that assignment to the remainder. Keys are
  string-normalized; duplicate keys claim only the first unused indexed source.
  Coordinates and computed distances must be finite. Returned indices refer to
  the original inputs; `matchedBy` distinguishes key matches from travel fallback.
- **Policy:** `composeCanonicalPolicies(...rules)` tries rules in order. A rule
  returns a complete `{ from, to, reverse }` pair or `null` to decline. A forward
  decision stops evaluation too; if all decline, authored order is preserved.
- **Routes:** `composeIntermediatePolicies(...rules)` selects the first rule
  returning a waypoint array. `null` declines; `[]` explicitly chooses a direct
  route and stops evaluation. Routes are not concatenated or recursively inferred.
  Line and Point use this to prioritize structural routes over axis routes.
- **States:** `encodingWaypoint(from, to, retainedChannels)` deeply clones the
  complete destination state and retains the specified source channels. A channel
  absent at the source is removed, not invented. Channel names are unrestricted;
  the plugin decides whether this mixed state is meaningful and how to render it.

Line and Area use the geometry/topology and policy tools; Unit uses the matching
tools. These are opt-in building blocks, not default motion rules. Geometric
proximity does **not** establish semantic identity or justify conserved motion.
Each plugin still owns the conditions under which a tool is appropriate, its
complete intermediate states, and its rendering strategy.

For example, a plugin can explicitly prioritize its own structural route over
its coordinate route:

```js
import { composeIntermediatePolicies } from 'visdelta/toolkit';

const intermediateSpecs = composeIntermediatePolicies(
  structuralRoute, // plugin rule: complete waypoints, [] for direct, or null
  coordinateRoute // considered only if structuralRoute returns null
);
```

This selects a route inside one authored pair. It does not turn builder history
into an animation script or cross the boundaries supplied to `sequence()`.

### Legend block height

A top legend is drawn in a block above the canvas, outside the chart's SVG.
`defineChartType` supplies `legendHeight(spec, viewport, margin)` from the same
runtime that draws the legend, so wrapping and height never disagree; a plugin
whose renderer draws no top-level legend (for example one that draws a legend in
each panel) returns 0, as repeated states do. A transition holds the tallest
block among its route states for the whole pair, so the canvas below never
moves. The viewport's `legendOutside` flag tells `defaultMargin` that margins
reserve no room for the legend; a compositor that draws a legend inside its own
panel leaves it unset. A chart type that omits `legendHeight` gets no block
above its canvas.

### Optional content height

A plugin may provide `defaultHeight(spec, viewport, margin)` through
`defineChartType`. The viewport includes transformed rows, width and the base
height; margin is the outer layout margin. Return a finite positive height.
Explicit chart/runtime heights take priority. A standalone transition reserves
the largest requested height across its complete route states and recomputes it
on container width changes, retaining progress. Repeat plugins use this hook for
opt-in `autoHeight`; no chart-name branches are needed in the runtime.
