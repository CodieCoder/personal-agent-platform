import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionId, createId } from "../dist/index.js";

test("createId produces unique IDs with a stable prefix", () => {
  const first = createId("test");
  const second = createId("test");

  assert.match(first, /^test_[a-f0-9]{32}$/u);
  assert.notEqual(first, second);
});

test("createExecutionId uses the execution prefix", () => {
  assert.match(createExecutionId(), /^exec_[a-f0-9]{32}$/u);
});
