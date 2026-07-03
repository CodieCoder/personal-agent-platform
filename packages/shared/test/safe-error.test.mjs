import assert from "node:assert/strict";
import { test } from "vitest";
import { serializeError } from "../dist/index.js";

test("serializeError omits stack traces by default", () => {
  const error = new Error("hidden stack");
  const serialized = serializeError(error);

  assert.equal(serialized.name, "Error");
  assert.equal(serialized.message, "hidden stack");
  assert.equal("stack" in serialized, false);
});
