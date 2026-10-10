# Lessons from the VisDelta codebase review — 2026-10-11

This review took Bar's operation planner to Point, Line, Area and Unit, while
keeping identity, state difference, route planning and frame evaluation separate.
The implemented contracts remain in [the constitution](../docs/language-framework.md);
supported subsets and fallback boundaries are in [the reference](../docs/reference.md).

1. **Plan from canonical states, not builder history.** Overwritten fluent calls
   must disappear from the route. Normalize only proven equivalents: Line and
   Area's explicit renderer defaults, Point's equivalent connector formats, and
   Unit's explicit or omitted defaults. An authored size can differ from a
   theme-dependent default, so equal appearance in one environment is insufficient
   evidence for deleting it.

2. **An operation is a semantic declaration, not a JSON leaf.** A Grain change
   can regenerate aggregate aliases, positional bindings and mark keys together.
   Those derived fields must not become extra operations. Independent encoding,
   layout, attention and appearance declarations remain separate slots.

3. **Intermediate validity is part of route search.** Validate complete candidate
   states against transformed data, field availability, grain, identity and layout
   dependencies. Require stable normalization and exact operation round trips.
   A bounded deterministic search with an explicit unsupported result is safer
   than inventing fields or silently relaxing a chart contract.

4. **Share the planner; keep chart semantics in plugins.** Core owns the operation
   search and route evaluation. Each chart owns its codec, validity constraints,
   correspondence, native bridges and geometry. A common interface does not
   require every chart to support identical state combinations. Unsupported pairs
   retain their native route or direct fallback.

5. **Identity is evidence, not a motion instruction.** Source-record identity and
   mark identity at the current grain are different. Grouping correspondence does
   not establish additive measure conservation; reducer changes need an honest
   chart-owned fallback when conserved motion is inappropriate.

6. **Canonical direction must survive endpoint cleanup.** Reverse playback must
   traverse the same route, including its clean boundaries. A reversed leg ends
   at canonical progress zero. Finishing it at one before static rendering caused
   a roughly 15-pixel Unit force jump. Evaluate the reversed endpoint before
   cancelling its tracks; preserve forward completion callbacks. Force caches
   must also match actual keys, coordinates and radii before reusing an endpoint.

7. **Semantic stages and motion phases are different.** Adding one-operation
   stages changes global progress locations. Test a layout's motion using the
   actual phase interval, while separately checking the full route and endpoint.
   Preserve author-supplied sequence boundaries and compare complete intermediate
   states with independent static renders using the same margins.

8. **Verification needs independent evidence.** Check determinism, one-operation
   changes, replay, immutability, normalized destinations and inverse routes.
   Browser tests must cover forward play, reverse play, scrubbing, axes, resize
   and phase boundaries. A custom cached plugin exposed the generic cleanup bug;
   a negative control with the old code confirmed the regression test detects it.
   Build success alone cannot establish these contracts. Review the staged diff
   too: checks of the unstaged diff omit newly added, untracked files.

9. **Parallel implementation needs controlled integration.** One owner per chart
   and independent review made the extensions easier to audit. Freeze shared
   build output during browser tests. Concurrent Chrome runs caused Unit readiness
   and overall test timeouts; isolated runs passed with their original budgets.
   Separate resource contention from reproducible geometry failures before
   changing tests or product behavior.

Final validation: 278 Node tests, 184 relevant browser tests, package-consumer
and TypeScript checks, plus an independent audit of nine compound endpoint pairs.
The browser total includes Line 33, Area 35, Point 34, Unit and the generic
endpoint regression 35, and shared runtime, Bar planner and documentation 47.
This records the verified scope of this review, not universal support for every
possible chart pair or a claim that the repository has no remaining technical debt.
