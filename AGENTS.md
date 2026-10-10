# VisDelta agent guide

This file governs how to modify and review VisDelta. Semantic definitions and
transition contracts belong in the constitution; do not copy them into a second
rule set here.

## Source of truth

- [docs/language-framework.md](docs/language-framework.md) is the semantic
  constitution. Read its layer boundaries, vocabulary governance and transition
  contracts before changing state, planning or playback behavior.
- `src/types/index.ts` defines the public state-change vocabulary.
- `src/grammar/state-changes.ts` implements its classification.
- [docs/reference.md](docs/reference.md) records the implemented API, supported
  operation subsets and fallback boundaries.
- For vocabulary or public API changes, update constitution, types, classifier,
  reference, examples and tests together as applicable.
- Document only behavior that exists in the current checkout. Mark uncertain
  behavior as unsupported; do not turn roadmap ideas into present-tense claims.

## Implementation and review

- Extend the chart plugin before changing the generic runtime. Keep codecs,
  validity constraints, correspondence, motion bridges and geometry in chart
  modules. Generic fixes must work through plugin contracts without chart-name
  branches. Share behavior only when its semantics are actually shared.
- Before adding an operation, identify its authored slot and derived fields.
  Reconstruct aliases, bindings and mark keys through the codec instead of
  treating every serialized leaf as an independent edit. Keep independently
  authored presentation controls separate.
- Normalize only renderer-proven equivalents. Check omitted versus explicit
  defaults, overwritten calls and equivalent declaration formats. Preserve
  values whose meaning depends on data, themes or explicit author intent;
  matching pixels in one example do not prove equivalence.
- Validate candidates against the actual transformed data and chart constraints,
  including field availability, grain, identity and layout dependencies. Require
  normalization to reach a fixed point and operations to round-trip exactly.
- Keep search bounded and deterministic. Test unsupported and search-limit
  outcomes and the documented fallback. Do not invent fields, loosen validity
  rules or force every chart to support the same combinations to obtain a route.
- Inspect canonical direction at every phase boundary and during cleanup.
  Evaluate a reversed leg's physical endpoint before cancelling its tracks;
  preserve forward completion callbacks. Distinguish local phase reversal from
  whole-route reversal. Cover generic runtime fixes with a custom plugin test.
- Cache keys must include inputs that affect geometry. For endpoint reuse, verify
  visible mark identities and geometry against the cached result, including keys,
  coordinates and radii where applicable. Test changed dimensions, anchors and
  data, same-host A -> B -> A, and restored reverse endpoints; do not reuse a
  trajectory solely by its destination declaration.
- Avoid hard-coded visual fixes when behavior can be derived from data,
  geometry or container size. Bar marks always use square corners; do not add
  corner-radius style or transition geometry to Bars.

## Verification

- Tests must demonstrate every public claim. A build alone does not prove
  transition behavior or browser appearance.
- For planner changes, independently check deterministic paths, one operation
  per stage, valid complete states, replay, input immutability, the exact
  normalized destination and the inverse route. Check authored sequence
  boundaries and declared color preservation.
- Test motion at the actual phase's local progress, not a guessed global value
  or a phase count equated with operation count. Separately verify the complete
  route and endpoints. Compare boundary frames with independent static renders
  under the same dimensions, margins and chart initialization.
- For transition changes, test forward play, reverse play, scrubbing, axes,
  resize and clean endpoints in the relevant lab. Respect documented directional
  easing exceptions when choosing frame-equality assertions. Test narrow and
  desktop layouts for docs UI changes.
- Regression tests must retain the behavioral assertion. Where practical,
  verify that the test fails with the old behavior, especially for runtime fixes.
- Run the narrowest relevant tests first, then the available release gates.
  Verify public export or packaging changes through an installed package
  consumer as well as source imports. Report environment or pre-existing
  failures separately from regressions.

## Product and documentation

- The homepage should show the result immediately: code changes drive the real
  VisDelta transition. Keep ontology explanation in the documentation.
- Homepage chart-type tabs choose the demonstration; the selected demo then
  auto-plays. The chart is a projection of the changing code, not a separately
  synchronized fake animation.
- In the ontology UI, label public syntax and emitted actions separately.
- Organize playground and lab examples by the seven state-change categories.
  Categories are the primary navigation; do not collapse the example system
  back into one undifferentiated dropdown. A composite example may declare one
  primary teaching category while its inspector reports every emitted change.
- Prefer concise, geometric, restrained UI with small corner radii. Preserve
  VisDelta's own visual identity rather than copying another design system.
- Keep responsive order legible: source data -> chart code -> animated chart.
- Keep live examples and the playground together around ontology and transition
  contracts; avoid duplicate inspectors or decorative controls.

## Working rules

- Preserve unrelated changes in a dirty worktree.
- When delegating chart extensions, assign one owner per chart and keep design
  and independent review explicit. Coordinate ownership of shared files.
- Integrate through one coordinated build and freeze its output during browser
  runs. Do not rebuild shared dist while another agent is testing it.
- Before changing timing assertions, isolate resource contention from product
  failures. Re-run affected tests without competing browsers before increasing
  readiness budgets, changing playback duration or weakening motion assertions.
- Review both working and staged diffs before committing. Include new files in
  whitespace and scope checks; an unstaged diff omits untracked files.
