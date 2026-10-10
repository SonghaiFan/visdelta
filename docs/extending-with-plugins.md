# Add a chart type

A chart type is an independent module. Core should work before that module is
imported and should not change when the module is added.

## Live external plugin: Orbit

This example loads the Orbit plugin through its own module, using the same
host services as built-in charts. It is an extension example, not a new
built-in export. Play forward, reverse, or scrub the same transition below.

<OrbitPluginDemo />

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

Chart plugins follow the [three governing contracts](./language-framework.md#three-governing-contracts):
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

The [live Orbit example](#live-external-plugin-orbit), with expandable plugin source, demonstrates
an external chart using only `visdelta/plugins`, `visdelta/toolkit`, and injected host services.
Its circles are arranged around a ring and use a declared size field. It is a
reference for packaging and runtime integration, not a built-in chart or a
claim of specialized split/merge semantics. Browser tests independently bundle
it and check seek, reverse seek, resize, disposal, and plain JSON registration.

An official chart folder lives at `src/charts/<name>/` and contains its
authoring, compile, state, render, plugin, and module files. Then:

1. run `node scripts/sync-chart-manifest.mjs`;
2. add a focused package entry;
3. add authoring and real-browser transition tests;
4. add one real-data lab;
5. update `chart-types.md` and the API reference.

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
