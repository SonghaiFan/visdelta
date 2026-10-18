# Diagnostic API design

**Status: proposal only.** None of the APIs named below are implemented or
exported. This document is a design for review, not a usage reference. The
implemented alternatives are `toSpec()`, `rows()`, `delta()`,
`visualizationWarnings()` and controller `inspect()`.

## Problem and scope

An agent should be able to answer “which rows determined this domain?”, “why is
this tick here?” and “is the authored endpoint actually drawn?” without guessing
from screenshots. The answer must come from the same compiler, chart plugin,
scale instances and frame evaluator that produce the chart. A parallel debug
renderer would become a second source of truth.

Respect the four layers in the [constitution](../language-framework.md):
identity/correspondence, semantic difference, route planning, and frame/control.
A recorded track is not a semantic action; an inserted route state is not an
authored keyframe. Diagnostics must name those distinctions.

This proposal adds observations and validation, not new visual encodings,
planner routes, vocabulary categories or controls. Scroll adapters, annotations,
visibility tiers and new scale switches are outside this work.

## Three queries, three levels of evidence

All names and signatures are provisional. Prefer explicit functions in an
optional diagnostic entry over a global singleton or changing `inspect()`'s
existing meaning.

```ts
// PROPOSED: unavailable in 0.4.2.
resolveState(visualization, options?): Promise<StateResolution>;
resolveLayout(visualization, options): Promise<LayoutResolution>;
snapshotFrame(controller, options): Promise<FrameSnapshot>;
```

| Query | Environment | What it can establish | What it must not invent |
| --- | --- | --- | --- |
| `resolveState` | No DOM; inline or explicitly supplied named data | Prepared declaration, detected/authored types, transformed row counts, identity/grain evidence, chart-owned warning results | Final ticks, text metrics, pixel geometry, theme-resolved colors or a rendered mark count |
| `resolveLayout` | Browser target or explicit measurement environment; width, height, margins, fonts, theme | Actual final scale domains/ranges, tick candidates and chosen labels, legend layout, mark count and geometry | A universal DOM-free layout, hidden defaults inferred from one screenshot, or metadata a plugin did not provide |
| `snapshotFrame` | Prepared pair/sequence controller and an isolated evaluation surface | Requested progress, current leg/stage/phase, mark geometry/opacity/clip/drawing state and diagnostics at that frame | A guarantee that every custom tween can be decomposed or that every invisible mark is erroneous |

Creation remains the readiness boundary: `await sequence(...)` already prepares
the controller. Do not add a redundant `ready` Promise. Do not overload existing
`inspect()` with a numeric argument: its output is compiled SVG property tracks,
not a mark snapshot.

## Shared result envelope

Results are detached JSON-safe values, with a versioned diagnostic schema.
Dates use explicit ISO instants plus timezone metadata; no DOM nodes, functions,
live scale objects, data secrets or mutable references are returned. Include
source rows only under an explicit opt-in and an output-size limit.

```ts
// PROPOSED shape; not a declaration of an existing export.
type DiagnosticResult<T> = {
  schemaVersion: 1;
  status: 'ok' | 'partial' | 'unsupported';
  value: T | null;
  unavailable: Array<{ path: string; reason: string; capability?: string }>;
  diagnostics: Array<{
    code: string;
    severity: 'info' | 'warning' | 'error';
    path?: string;
    message: string;
    evidence?: Record<string, unknown>;
  }>;
};
```

`partial` means useful evidence exists alongside explicit unknowns. An absent
capability must never become a guessed `false`, an empty mark list, or a claim
that an ignored option was accepted. Stable diagnostic codes are separate from
`StateChange` vocabulary and need their own compatibility policy.

Data resolution is asynchronous because builders can carry lazy chart modules.
The first version should not fetch remote sources implicitly. Missing named or
remote data returns `partial` with `data-unavailable`; callers can supply the
resolved rows. If explicit remote loading is added later, its cancellation,
credentials, reproducibility and error policy must be specified separately.

## State resolution

Report the authored and prepared declarations separately; preserve the original
input. Each field type records its origin (`authored` or `inferred`). Describe
source and transformed populations with counts and available identity fields,
without assigning rendered mark counts to source rows (one line can represent
many records, and a stack can introduce derived cells).

Do not promise numeric domains at this layer merely because an extent can be
computed. Chart layouts, stacking, baseline constraints, repeat sharing and
focus can change their meaning. A plugin may expose a data-only *candidate*
with its derivation, but final layout fields remain unavailable.

Unknown/ignored options need declaration-schema evidence. A strict-mode design
should validate a local call against chart-owned schemas before rendering;
known unsupported and unknown properties are different diagnostics. Do not
implement global `configure({ strict: true })` or silently alter all charts.

## Layout resolution

Use the existing prepared rendering pipeline on an attached measurement mount.
Fonts must be ready and the request must declare or record the measurement
context. Defaults supplied by the environment are reported, not hidden.
Capture values from the real scales before camera projection and after focus
projection, so focus does not appear to mutate source membership.

Illustrative payload (proposed, not a fixture for the current library):

```json
{
  "schemaVersion": 1,
  "status": "ok",
  "value": {
    "environment": { "width": 640, "height": 400, "timezone": "Australia/Melbourne" },
    "axes": {
      "y": {
        "field": "journeys",
        "scaleType": "linear",
        "domain": [18, 38],
        "domainSource": "visible-transformed-rows",
        "authoredDomain": null,
        "rounding": { "requested": "default", "applied": true },
        "ticks": [
          { "value": 18, "label": "18", "source": "data-endpoint" },
          { "value": 20, "label": "20", "source": "ordinary" },
          { "value": 38, "label": "38", "source": "data-endpoint" }
        ]
      }
    }
  },
  "unavailable": [],
  "diagnostics": []
}
```

The numbers above explain the schema only; they are not claimed output from
`resolveLayout()` or a promise of exact D3 tick choices. Actual tests must read
real layout evidence under a controlled environment.

Domain provenance should support at least authored bounds, visible transformed
rows, lineage rows, shared-panel rows, stacked boundaries and a chart-defined
layout. Record contributing populations independently from rounding and
pixel-padding transformations. Record guard/clamp adjustments separately too:
“not niced” must not imply that authored bounds passed through unchanged.
Keep tick candidates, admitted ticks and
suppressed/crowded labels distinct. Record whether an endpoint value was
injected; do not describe an ordinary log tick as an endpoint injection.

Legend evidence includes its semantic domain, entries, layout and visibility
reason (absent color encoding, constant color, panel caption substitution,
insufficient available space, or rendered). It must not imply that a global
`legend: false` API already exists.

## Frame snapshots and observation safety

`progress` is explicit and uses the controller's public units. For a sequence,
`1.5` means leg 1 at local 0.5. Include:

- Authored endpoint indices and current leg-local progress.
- Planned route-stage metadata, including generated intermediate declarations
  where available. Chart-refined stages without a declaration operation are
  labelled as such; do not fabricate an operation.
- Compiled phase interval and phase-local progress.
- Stable mark identity, parent/panel identity, pixel geometry, opacity, clip
  evidence and drawing completion evidence supplied by the chart.
- Coverage: which properties were measured and which custom tween internals or
  chart capabilities remain unavailable.

A proposed line field could use `drawing: { status: 'complete' | 'partial' |
'not-started' | 'unavailable', fraction?: number, evidence: ... }`. An opacity of
zero, an offscreen mark, or a clipped path alone does not establish that a line
failed to draw. Explain those observations separately.

Sampling must not pause or seek the visible controller, cancel its tracks,
change `value`, fire completion handlers, consume its recording queue or alter
its reverse endpoint cache. Prefer an isolated replay surface that uses the
same prepared inputs and evaluation contracts. Sampling must specify direction
for direction-dependent profiles, or report that it is unavailable. Expose a
`destroy`/cancellation policy for temporary resources and never leak listeners,
observers or preparation mounts.

A controller resize/theme/input change invalidates layout/frame diagnostic
caches. Keys include all geometry-affecting inputs, environment, panel identity
and version; destination declaration alone is insufficient. Inspection results
remain detached after the controller is destroyed.

## Plugin ownership and implementation boundaries

Add optional chart-owned observation hooks/capabilities rather than switching
on chart names in the generic runtime. The generic layer provides the result
envelope, lifecycle, environment, progress mapping and common evidence capture.
Plugins own mark geometry, scale/stack provenance, topology, drawing-completion
semantics and chart-specific invariant checks.

The existing runtime should publish facts from its real scale/tick/legend
construction, instead of recomputing them in a separate diagnostic helper.
Custom plugins without a hook return `partial`/`unsupported` for that coverage.
A custom-plugin test is required before accepting a generic runtime change.

## Optional invariant checks

Start with opt-in checks on diagnostic requests, not per-frame production work.
A future debug renderer can reuse those checks after their cost is measured.
Useful checks have concrete evidence:

- Non-finite required geometry or an unavailable bound field.
- An authored endpoint expected to contain a line still carrying unfinished
  draw tracks, when the plugin can prove both expectation and drawing state.
- Axis/mark projections using inconsistent scale instances or parameters.
- A declared exact domain changed without a documented chart constraint.

Do not warn merely because an explicitly cropped mark lies outside the domain,
a highlight makes a mark faint, a filter removes a mark, or a layout deliberately
uses invisible geometry for matching/tooltips. “Every frame is true” requires
chart-specific evidence; it cannot be validated by one universal bounds check.

## Acceptance plan and rollout

1. Agree on the envelope, provenance fields, missing-capability representation
   and output limits. Add no public exports in this documentation-only phase.
2. Implement DOM-free state resolution with immutability, deterministic results,
   missing/remote data, transformed grain and custom-plugin tests.
3. Instrument real layout construction. Check explicit/inferred/log/time domains,
   filter vs lineage colors, shared/independent panels, focus, narrow/desktop
   sizes, font/theme refresh and timezone changes against actual rendering.
4. Add isolated frame sampling. Check actual phase-local samples, forward and
   reverse, arbitrary seeking, playing-controller noninterference, callbacks,
   resize, cleanup and sequence authored boundaries.
5. Reproduce issues #11–#13 using structured evidence: unfinished entering marks,
   filtered-domain provenance and explicit-domain/tick provenance. Verify tests
   fail with the corresponding old behavior, not just with missing fields.
6. Only then stabilize names and ship an additive public API with constitution,
   types, plugin contracts, reference, site examples and package-consumer tests
   updated together as applicable.

Open design decisions: whether diagnostic helpers belong in `visdelta/debug` or
another optional entry; whether expensive frame sampling should be batched; the
lifetime of prepared diagnostic surfaces; font/environment identity for caches;
and how external plugins publish option schemas without duplicating codecs.
