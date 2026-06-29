import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionLogger, createLogger } from "../dist/index.js";

test("createExecutionLogger adds execution-aware bindings", () => {
  const logger = createLogger({ enabled: false });
  const executionLogger = createExecutionLogger(logger, {
    executionId: "exec_test",
    capabilityId: "capability.test",
  });

  assert.equal(typeof executionLogger.info, "function");
  assert.deepEqual(executionLogger.bindings(), {
    executionId: "exec_test",
    capabilityId: "capability.test",
  });
});
