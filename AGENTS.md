# VisDelta

## Sources

- Before changing semantics, planning or playback, read `docs/internal/language-framework.md`.
- Public contracts live in `src/types/index.ts`; classification lives in `src/grammar/state-changes.ts`.
- `website/content/docs/` is the only editable public documentation. `scripts/build-docs.mjs` generates package Markdown; never edit generated docs.
- Studio has Gallery (static idioms), Playground (live chart editing), Story (ordinary website examples) and Liveshow (MCP wrapper). Keep these responsibilities small.

## Design

- Core is chart-agnostic. Chart modules own semantics, geometry, codecs and validation. Never branch on chart names in the generic runtime.
- Applications use public package exports. Keep source preparation outside visualization code. Do not copy chart rules into MCP or UI adapters.
- Identify authored slots and derived fields before changing an API. Normalize only proven equivalents; do not erase data-dependent or explicit author intent.
- Validate against actual transformed fields, grain, identity and layout dependencies. A planner's bounded coverage is not permission to reject unrelated edits.
- Keep search deterministic and bounded. Valid endpoints may use a chart-owned fallback; never invent fields or weaken constraints to obtain a route.
- Greenfield: replace redundant APIs directly. Remove aliases, old parameter translation, compatibility modes, redirects and duplicate documentation together with their obsolete tests.
- Preserve unrelated work and user data. Do not overwrite dirty changes, clear browser drafts, copy credentials or publish without authorization.

## Runtime and tests

- Object identity, state changes, planning and rendered frames are distinct contracts. Preserve each one.
- Check physical endpoints before cancelling reversed tracks. Cancellation must not run completion cleanup needed for reverse playback.
- Cache keys include geometry inputs, dimensions, anchors and data. Compare identities and geometry, not only destination declarations.
- Runtime fixes require custom-plugin coverage. Planner changes require valid stages, one operation per stage, exact destination, deterministic replay, inverse route and input immutability.
- Test actual phase boundaries, forward/reverse progress, scrubbing, axes, resize and clean endpoints. Compare endpoints with independent static renders.
- Keep React chart-host refs stable. Idle Gallery thumbnails must stop rendering; filtering, clearing and resizing must redraw then settle.
- Build once, freeze dist during browser checks, and verify package changes through a real installed consumer. Never weaken timing assertions before ruling out contention.
- Keep behavioral regressions when removing legacy tests. Run focused checks first, then required gates; report build, browser and deployment evidence separately.

## Product

- Lead with the chart and working code. Keep internal planning details out of ordinary user flows.
- Gallery and Playground share idiom declarations/data. Story examples use native VisDelta controllers; do not introduce a Story language or generic editor platform.
- MCP schemas mirror public calls. Warnings are advisory. Require actual browser receipts before claiming a change was applied.
- Prefer concise prose and a restrained UI. Use square corners for Bar marks. Verify narrow and desktop layouts for UI changes.
- Update affected docs, examples and types with public API changes. State only implemented behavior; put engineering evidence under `docs/internal/`.
