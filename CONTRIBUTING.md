# Contributing

VisDelta keeps Core chart-agnostic and treats every chart type as a peer module.
Before adding a shared abstraction, prove that at least two chart modules need
the same semantic concept.

## Local checks

Use Node 20.19+ or 22.12+ for development tooling. The package supports Node 18
consumers.

```sh
npm ci
npx playwright install chromium
npm test
npm run release:check
```

`npm test` checks TypeScript, generated chart inventory, distribution files,
examples, documentation, package shape, smoke behavior, and Node tests.
`npm run release:check` also runs real-browser tests and validates an installed
package consumer. Bundle size is measured, but the first release is not blocked
by a fixed gzip target.

`npm run clean:check` performs the release gate in a temporary copy of the
tracked workspace. It does not publish or modify the current checkout.

## Add a chart type

An official chart type lives in `src/charts/<name>/`. It owns:

- immutable authoring state and chart-specific public methods;
- compilation from that state to a plain view spec;
- geometry, matching, axes, rendering, and transition planning;
- a `plugin.ts` implementation and a lazy `module.ts` loader;
- focused unit tests, a real-browser lab, and concise documentation.

Core must not import the chart or branch on its name. Do not add aliases, empty
hook bags, silent data encoding, or chart-specific switches to make registration
appear generic.

After adding or removing a built-in chart folder, run:

```sh
node scripts/sync-chart-manifest.mjs
```

Then add the focused package entry and update `docs/chart-types.md` plus
`docs/reference.md`. A focused-module browser test must show that unrelated
chart implementations are not loaded.

## Transition review

For every new transition, verify all of these:

1. Every intermediate frame is a truthful chart state.
2. Marks move with the scale, ticks, labels, and grid lines.
3. Exit completes before reframing; reframing completes before enter.
4. Reverse visits the same cached frames in the opposite order.
5. Explicit keys keep identity; chart-owned fallback matching is deterministic.
6. Style defaults do not silently introduce a data encoding.

Update `CHANGELOG.md` for release-facing changes.
