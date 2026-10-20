import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createVisDeltaMcpServer } from "../server.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RESOURCE_URI, TOOL_NAME } from "../demo.mjs";

// A controlled MCP Apps host, not a claim of ChatGPT iframe verification.
test("bundled iframe renders, seeks both ways, and replays", { timeout: 30000 }, async (t) => {
  const server = createVisDeltaMcpServer();
  const client = new Client({ name: "widget-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  t.after(() => client.close());
  t.after(() => server.close());
  const result = await client.callTool({ name: TOOL_NAME, arguments: {} });
  const { contents } = await client.readResource({ uri: RESOURCE_URI });
  const browser = await chromium.launch({ executablePath: process.env.VISDELTA_CHROME_PATH });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<iframe title="VisDelta" sandbox="allow-scripts" style="width:600px;height:460px;border:0"></iframe>');
  await page.evaluate(({ html, result }) => {
    const iframe = document.querySelector("iframe");
    window.addEventListener("message", event => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (message.method === "ui/initialize") {
        iframe.contentWindow.postMessage({ jsonrpc: "2.0", id: message.id, result: {
          protocolVersion: "2026-01-26", hostInfo: { name: "test-host", version: "1.0.0" }, hostCapabilities: {}
        } }, "*");
      } else if (message.method === "ui/notifications/initialized") {
        iframe.contentWindow.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result }, "*");
      }
    });
    iframe.srcdoc = html;
  }, { html: contents[0].text, result });
  const frame = page.frameLocator("iframe");
  await frame.locator("#status").filter({ hasText: "Drag to seek" }).waitFor();
  const bars = frame.locator("rect.vd-bar");
  assert.equal(await bars.count(), 3);
  const geometry = () => bars.evaluateAll(nodes => nodes.map(node => ["x", "y", "width", "height"].map(key => node.getAttribute(key))));
  const seek = value => frame.locator("#progress").evaluate((node, value) => {
    node.value = String(value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  const start = await geometry();
  await seek(1);
  const end = await geometry();
  assert.notDeepEqual(start, end);
  await seek(0.5);
  const middle = await geometry();
  assert.notDeepEqual(middle, start);
  assert.notDeepEqual(middle, end);
  await seek(0);
  assert.deepEqual(await geometry(), start);
  await frame.locator("#replay").click();
  await expect(frame.locator("#progress")).toHaveValue("1");
  assert.deepEqual(await geometry(), end);
  assert.deepEqual(errors, []);
});
