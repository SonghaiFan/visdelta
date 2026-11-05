# Core lifecycle audit — 2026-10-30

This is a targeted architectural audit prompted by accumulated outgoing axes during
Bar flips. It covers state patching, resolved endpoint snapshots, frame sampling,
layout cache invalidation, inspection, cancellation/completion, persistent updates,
and plugin isolation. It is not a proof that every chart, browser or third-party
plugin is defect-free. Existing unrelated work in this checkout was preserved.

## Confirmed and fixed

| Problem | Evidence before the fix | Change | Regression |
| --- | --- | --- | --- |
| Constant layout interpolation invalidated cached frames | An independent cached custom plugin performed 32 extra renderer calls during 99 seeks with unchanged layout | Interpolate as `from + (to - from) * progress`, so equal legend/margin endpoints remain exactly equal | Custom plugin records zero extra draws while seeking or inspecting; actual resize recompiles, subsequent seeks reuse that result |
| Zero-duration timing disagreed between evaluation paths | At the delayed step's exact start, live sampling returned 0 while compiled sampling returned 10 | Use the same instantaneous boundary rule in both samplers | Forward/backward samples before, at and after the boundary agree |
| Transition endpoints exposed unresolved, reusable mutable objects | A named-source transition returned no resolved rows; modifying one returned endpoint polluted later reads | `from` / `to` getters clone the resolved endpoints on every read | Independent plugin verifies resolved bindings, caller-input isolation, fresh reads, resize and inspection |
| Date patches silently retained old values | `.with()` changed a January filter bound to February, but the state still contained January | Only plain records merge recursively; Date leaves are replaced and cloned | Actual filtered rows change from two to one; source state and caller dates stay independent |

The preceding axis fix remains necessary: source reconstruction removes outgoing
axis/grid copies belonging to discarded recordings. Floating-point cache churn
was an amplifier, not a reason to remove that cleanup. Existing phase snapshots
retain their detached nodes for reverse seeking.

## Reviewed contracts retained

- Core stays chart-agnostic. No chart-name branching or new chart-specific layout
  policy was introduced. Independent custom-plugin coverage exercises the runtime.
- Cancellation does not run completion removal. A blanket `finish()` on cancel
  would destroy nodes needed by reverse frames; existing tests distinguish these.
- `inspect()` restores visible DOM and playback position. Cache tests verify this
  rather than only checking that an inspection result exists.
- Resize is still a real cache invalidation. The correction does not disable
  invalidation or globally round away legitimate layout changes.
- Persistent `view.snapshot()` intentionally reports accepted intent/revision;
  transition `from` / `to` report resolved endpoints. They have different purposes.
- The persistent scheduler retains latest-update ordering, stale revision guards,
  transactional validation and destruction settlement. Existing browser suites
  exercise async data races, failed updates, manual ownership and replacement.
- React continues to own controllers and cleanup through updates and Strict Mode;
  this audit does not add a second rendering or animation path.
- Declaration planning, mark correspondence and chart-owned geometry were reviewed
  through their existing bounded-planning and route tests. No additional defect
  was demonstrated in those areas during this pass, so their policies were kept.

## Validation

- `npm test`: 364 tests passed, including build, manifest, package, bundle,
  documentation and example checks.
- `npm run render:check`: all 3 browser suites passed, including independent
  custom-plugin cache/inspection/snapshot coverage.
- `npm run react:check`: both server and browser lifecycle checks passed.
- `npm run pack:check` and `npm run authoring:check`: installed consumers passed.
- Website: 22 live examples and 24 Playground stories evaluated; production build
  passed using webpack (the environment's Turbopack worker-port restriction is
  documented in this chat). Two existing generated `::highlight` CSS warnings remain.
- All 8 Playground browser tests passed, covering all curated stories at narrow
  width, asynchronous Fit/Fixed changes, keyframes and flip-axis cleanup.
- `git diff --check`: clean.

Focused regression locations: `tests/tracks.test.mjs`,
`tests/authoring-contracts.test.mjs`, `tests/browser/ticks.test.mjs`, and
`website/tests/playground-stories.spec.ts`.

No deployment, release or downstream Liveshow integration is included.

## Follow-up: semantic adapter consistency (2026-11-02)

Bar inspection, coordinate compilation and semantic edits now share layout
interpretation. A canonical grouped declaration must retain grouping through
rehydration and flip even when optional layout metadata is absent. Single layout
edits preserve folded pipelines without broadening the grain codec; preview,
semantic delta and receipt remain distinct stages. Current validation is 369
unit tests, installed-package semantic/geometry checks, render suites and the
settled full-update axis comparison described in LS16 of `liveshow-feedback.md`.
