import assert from "node:assert/strict";
import test from "node:test";
import { err, isErr, isOk, ok, unwrap } from "../dist/index.js";

test("Result helpers represent success and failure outcomes", () => {
  const success = ok("done");
  const failure = err(new Error("nope"));

  assert.equal(isOk(success), true);
  assert.equal(isErr(failure), true);
  assert.equal(unwrap(success), "done");
  assert.throws(() => unwrap(failure), /nope/u);
});
