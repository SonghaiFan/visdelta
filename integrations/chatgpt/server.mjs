import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createDemoResult, RESOURCE_URI, TOOL_NAME } from "./demo.mjs";

const MCP_PATH = "/mcp";
const widgetBundlePath = new URL("./dist/widget.js", import.meta.url);

const viewSpecSchema = z.record(z.unknown());
const outputSchema = {
  id: z.string(),
  title: z.string(),
  description: z.string(),
  from: viewSpecSchema,
  to: viewSpecSchema
};

export function createVisDeltaMcpServer() {
  const server = new McpServer(
    { name: "visdelta-chatgpt", version: "0.1.0" },
    {
      instructions: "Render the VisDelta transition demo when the user asks to inspect or try an interactive declarative visualization transition."
    }
  );

  registerAppResource(
    server,
    "visdelta-transition-widget",
    RESOURCE_URI,
    {},
    async () => {
      const widgetBundle = readFileSync(widgetBundlePath, "utf8");
      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">${widgetBundle}</script></body></html>`,
            _meta: { ui: { prefersBorder: true } }
          }
        ]
      };
    }
  );

  registerAppTool(
    server,
    TOOL_NAME,
    {
      title: "Render VisDelta transition",
      description: "Render one interactive VisDelta bar transition demo from Revenue to Profit.",
      inputSchema: {},
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: RESOURCE_URI },
        "openai/toolInvocation/invoking": "Preparing VisDelta transition…",
        "openai/toolInvocation/invoked": "VisDelta transition ready."
      }
    },
    async () => createDemoResult()
  );

  return server;
}

export function createVisDeltaHttpServer() {
  return createHttpServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, mcp-session-id",
        "Access-Control-Expose-Headers": "Mcp-Session-Id"
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("VisDelta MCP server");
      return;
    }

    const mcpMethods = new Set(["POST", "GET", "DELETE"]);
    if (url.pathname === MCP_PATH && req.method && mcpMethods.has(req.method)) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

      const server = createVisDeltaMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      res.on("close", () => {
        transport.close();
        server.close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) res.writeHead(500).end("Internal server error");
      }
      return;
    }

    res.writeHead(404).end("Not Found");
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  createVisDeltaHttpServer().listen(port, () => {
    console.log(`VisDelta MCP server listening on http://localhost:${port}${MCP_PATH}`);
  });
}
