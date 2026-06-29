import assert from "node:assert/strict";
import test from "node:test";
import { executionStatusSchema, parsePlatformError, platformErrorSchema } from "../dist/index.js";

test("executionStatusSchema accepts the initial execution statuses", () => {
  assert.equal(executionStatusSchema.parse("running"), "running");
  assert.equal(executionStatusSchema.parse("completed"), "completed");
  assert.equal(executionStatusSchema.safeParse("awaiting_approval").success, false);
});

test("platformErrorSchema validates typed platform errors", () => {
  const error = parsePlatformError({
    code: "CAPABILITY_NOT_FOUND",
    message: "Capability was not registered.",
    category: "capability",
  });

  assert.equal(error.retryable, false);
  assert.equal(
    platformErrorSchema.safeParse({ code: "bad", message: "", category: "unknown" }).success,
    false,
  );
});
