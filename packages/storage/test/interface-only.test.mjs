import assert from "node:assert/strict";
import test from "node:test";
import * as storage from "../dist/index.js";

test("@pap/storage exports interfaces without runtime storage adapters", () => {
  assert.deepEqual(Object.keys(storage), []);
});
