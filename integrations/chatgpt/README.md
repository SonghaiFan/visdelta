# VisDelta ChatGPT MCP + UI demo

A thin ChatGPT integration for VisDelta. It does not change VisDelta's core runtime or its chart-plugin API.

## Architecture

- `render_visdelta_transition`: one read-only MCP tool with no arguments.
- `ui://visdelta/transition-demo-v1.html`: one MCP Apps UI resource.
- Tool output is JSON-safe `from` / `to` VisDelta view specs.
- The iframe registers the existing `barModule` and passes those plain specs to the existing `transition()` API.
- The widget uses the MCP Apps `ui/*` JSON-RPC bridge, not a ChatGPT-only bridge.

This deliberately keeps **VisDelta chart plugins** and **ChatGPT plugins** separate concepts.

## Run locally

Use Node.js 22+ for the full validation workflow (including browser tooling).

```bash
cd integrations/chatgpt
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm start
```

The server listens on:

```text
http://localhost:8787/mcp
```

Inspect it locally with:

```bash
npx @modelcontextprotocol/inspector@latest
```

Choose **Streamable HTTP** and connect to `http://localhost:8787/mcp`.

For repeatable CLI checks with Inspector 2.9.0, keep the server running and use:

```bash
npx @modelcontextprotocol/inspector@2.9.0 --cli http://localhost:8787/mcp --method tools/list --format json
npx @modelcontextprotocol/inspector@2.9.0 --cli http://localhost:8787/mcp --method tools/call --tool-name render_visdelta_transition --format json
npx @modelcontextprotocol/inspector@2.9.0 --cli http://localhost:8787/mcp --method resources/read --uri ui://visdelta/transition-demo-v1.html --format json
```

`npm test` builds the widget and checks the real HTTP tool/resource contract as
well as the JSON fixtures. `npm run test:browser` loads the resource in a sandboxed
iframe with a controlled MCP Apps host and checks rendering, seek/reverse seek,
and replay. It is **not** ChatGPT iframe verification. Set `VISDELTA_CHROME_PATH`
to use an existing Chromium executable when the Playwright download is unavailable.

The integration has a separate CI job and lockfile. It consumes published
`visdelta@0.3.0`; the root release tests independently validate this checkout.

## Connect to ChatGPT

ChatGPT needs a public HTTPS endpoint during development. For example:

```bash
ngrok http 8787
```

Then enable ChatGPT Developer mode and add a plugin using:

```text
https://<your-subdomain>.ngrok.app/mcp
```

Invoke the tool with a prompt such as:

> Show me the VisDelta transition demo.

## Why this shape

The MCP server only describes the capability and returns structured state. Rendering stays in the iframe, where VisDelta already expects browser APIs. The UI bundle is self-contained, so the MCP resource needs no external script, style, API, or iframe origins in its CSP.

The representative transition is intentionally fixed: a bar chart seeks from `revenue` to `profit`. Once this path is validated in ChatGPT, a later adapter can accept validated JSON-safe states without changing `transition()` itself.

## Official references

- https://developers.openai.com/plugins/build/app-quickstart
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/chatgpt-ui
