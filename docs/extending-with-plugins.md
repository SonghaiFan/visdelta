# Add a chart type

A chart type is an independent module. Core should work before that module is
imported and should not change when the module is added.

## Module contract

The module owns its builder, compiler, renderer, matching, transition plan,
axes, examples, and tests.

```js
import { defineChartModule, defineChartType } from "visdelta/plugins";

export const plugin = defineChartType({
  key: "custom",
  createRenderer: deps => customRenderer,
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
package. Renderer helpers are supplied through `deps`; the module must not reach
into another built-in chart.

A renderer does not receive a D3 object. Import the `d3-*` modules the chart
uses — `d3-selection`, `d3-scale`, `d3-shape`, … — exactly as any D3 code does.
VisDelta's own `d3-*` dependencies are ordinary, stateless modules, so a second
copy in a plugin bundle is harmless; `chart.g` is a plain `d3-selection`
Selection and interoperates by structure, not by instance.

## Renderer motion contract

A renderer joins data with D3 as usual, but animates through `motion()`, never
through `selection.transition()`. VisDelta seeks recorded property tracks;
D3's scheduler is timer-driven and cannot be sought, so anything it animates is
interrupted the moment the transition compiles.

```js
import { motion } from "visdelta/plugins";
import { scaleLinear } from "d3-scale";

function customRenderer(chart, rows, spec) {
  const x = scaleLinear().domain([0, 100]).range([0, chart.innerWidth]);
  const dots = chart.g.selectAll("circle.dot")
    .data(rows, row => row.id)
    .join("circle")
    .attr("class", "dot");

  motion(dots, chart.transition.base)
    .attr("cx", row => x(row.value))
    .style("opacity", 1);
}
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
chart-specific geometry or timing. `TransitionPlan` remains the per-leg
execution decision, not the complete multi-state route. Explicit sequence
continues to own authored boundaries and delegates each pair to `transition()`.

Other runtime hooks retain their existing responsibilities:

| Hook | Responsibility |
| --- | --- |
| `createRenderer(deps)` | Draw marks and chart-owned axes |
| `createSpecCompiler(context)` | Compile authoring state into a view spec |
| `prepareSpec(spec)` | Normalize chart-specific defaults |
| `defaultMargin(spec)` | Reserve chart-owned space |
| `transitionEvaluation` | Opt into cached frame evaluation; safe whenever the renderer animates only through `motion()` |

Only implement hooks the chart needs. Do not add chart-name switches or empty
extension hooks to Core.

## Official chart checklist

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
