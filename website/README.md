# VisDelta Studio

Gallery, Playground, Story and Liveshow share this website, navigation, chart
library and documentation. The library remains independently consumable.

Run `npm ci` and `npm run dev` from the repository root. Production: `npm run
studio:build && npm start`. Local URL: http://127.0.0.1:4347/.

## Sources

| Area | Source |
| --- | --- |
| Gallery idioms | `components/interactive/gallery-idioms.js` |
| Playground transitions | `components/playground/demos.ts` |
| Live documentation figures | `examples/registry.ts` |
| Story websites | `../examples/story/` |
| Liveshow UI | `components/liveshow/` |
| Optional model/voice client | `server/liveshow/` |
| MCP schemas | `../integrations/mcp/` |
| Public documentation | `content/docs/` |

Gallery's Edit in Playground action loads the same declaration and data.
Keyframes teach changes; static idioms do not require animation. Story contains
ordinary websites. Liveshow calls public APIs; chart semantics stay in the library.

## Documentation

Each MDX page has a title and description. Search, Markdown endpoints, LLM indexes
and installed-package docs derive from these pages. `../scripts/build-docs.mjs`
lowers presentation tags and includes documented TypeScript declarations. Never
maintain a separate reference or copy documentation into an integration.

Examples use tidy input. `npm run examples:check --workspace website` verifies
every curated transition. `prepare.mjs` checks the built library, copies datasets
and standalone Story websites, bundles the weather example and records the
browser's build fingerprint. No vendored-package sync is required.

## Runtime

The root dev command starts Next and the loopback-only MCP/AI service. The
production static server also mounts the service for local use and tests.
`DOCS_BASE_PATH` sets the export prefix, recorded by `postbuild.mjs`. Choose dev
ports with `STUDIO_PORT` and `LIVESHOW_API_PORT`; use `SITE_TEST_PORT` for tests.

Pages hosting exports `out/` without a shared-key service. Optional text and
push-to-talk use server-side `OPENAI_API_KEY`. External MCP clients need no key
for that demonstration provider. All routes share accepted declarations and
browser receipts. Run `npm run test:studio` at the root for integration tests.
