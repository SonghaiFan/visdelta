import test from "node:test";
import assert from "node:assert/strict";
import { createDemoResult, DEMO_PAYLOAD } from "../integrations/chatgpt/demo.mjs";

test("ChatGPT integration fixture stays JSON-safe", () => {
  assert.doesNotThrow(() => JSON.stringify(DEMO_PAYLOAD));
  const result = createDemoResult();
  assert.equal(result.structuredContent.from.mark, "bar");
  assert.equal(result.structuredContent.to.mark, "bar");
  assert.notEqual(
    result.structuredContent.from.encoding.y.field,
    result.structuredContent.to.encoding.y.field
  );
});
