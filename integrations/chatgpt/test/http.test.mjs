import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createVisDeltaHttpServer } from "../server.mjs";
import { createDemoResult, RESOURCE_URI, TOOL_NAME } from "../demo.mjs";

test("HTTP tool and bundled UI resource agree", { timeout: 30000 }, async (t) => {
  const http = createVisDeltaHttpServer();
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve));
  const client = new Client({ name: "visdelta-integration-test", version: "1.0.0" });
  t.after(async () => {
    await client.close();
    await new Promise(resolve => http.close(resolve));
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.address().port}/mcp`)));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, TOOL_NAME);
  assert.equal(tools[0]._meta.ui.resourceUri, RESOURCE_URI);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  const result = await client.callTool({ name: TOOL_NAME, arguments: {} });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, createDemoResult().structuredContent);
  const { contents } = await client.readResource({ uri: RESOURCE_URI });
  assert.equal(contents.length, 1);
  assert.equal(contents[0].uri, RESOURCE_URI);
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.equal(contents[0]._meta.ui.prefersBorder, true);
  assert.match(contents[0].text, /ui\/initialize/);
  assert.match(contents[0].text, /ui\/notifications\/tool-result/);
  assert.doesNotMatch(contents[0].text, /<script[^>]+src=/);
  assert.ok(contents[0].text.length > 10000, "resource embeds the compiled widget");
});
