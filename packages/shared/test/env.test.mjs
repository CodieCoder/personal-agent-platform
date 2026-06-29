import assert from "node:assert/strict";
import test from "node:test";
import { validateEnvironment } from "../dist/index.js";

test("validateEnvironment accepts the local PAP environment", () => {
  const result = validateEnvironment({
    PAP_ENVIRONMENT: "local",
    PAP_ALLOW_REMOTE_ACCESS: "false",
    PAP_TRUSTED_PROXY: "false",
  });

  assert.equal(result.env.PAP_ENVIRONMENT, "local");
  assert.deepEqual(result.warnings, []);
});

test("validateEnvironment warns for remote access without auth protection", () => {
  const result = validateEnvironment({
    PAP_ENVIRONMENT: "self_hosted",
    PAP_BIND_HOST: "0.0.0.0",
    PAP_ALLOW_REMOTE_ACCESS: "true",
    PAP_AUTH_MODE: "none",
    PAP_TRUSTED_PROXY: "false",
  });

  assert.equal(result.warnings.length, 2);
});
