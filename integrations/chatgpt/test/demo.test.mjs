import test from "node:test";
import assert from "node:assert/strict";
import { createDemoResult, DEMO_PAYLOAD, RESOURCE_URI, TOOL_NAME } from "../demo.mjs";

test("demo payload is JSON-safe and describes one bar transition", () => {
  const json = JSON.stringify(DEMO_PAYLOAD);
  const parsed = JSON.parse(json);

  assert.equal(TOOL_NAME, "render_visdelta_transition");
  assert.equal(RESOURCE_URI, "ui://visdelta/transition-demo-v1.html");
  assert.equal(parsed.from.mark, "bar");
  assert.equal(parsed.to.mark, "bar");
  assert.equal(parsed.from.encoding.y.field, "revenue");
  assert.equal(parsed.to.encoding.y.field, "profit");
  assert.deepEqual(parsed.from.data, parsed.to.data);
});

test("tool result returns detached structured content", () => {
  const first = createDemoResult();
  first.structuredContent.from.encoding.y.field = "mutated";
  const second = createDemoResult();

  assert.equal(second.structuredContent.from.encoding.y.field, "revenue");
  assert.match(second.content[0].text, /VisDelta/);
});
