import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { loadRepositoryEnvironment, validateEnvironment } from "../dist/index.js";

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

test("loadRepositoryEnvironment reads root env files from nested package cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "pap-env-"));
  const nestedCwd = join(root, "apps", "web");

  try {
    mkdirSync(nestedCwd, { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    writeFileSync(join(root, ".env"), "OLLAMA_ENABLED=false\nPAP_LOG_LEVEL=warn\n");
    writeFileSync(
      join(root, ".env.local"),
      "OLLAMA_ENABLED=true\nOLLAMA_DEFAULT_MODEL=gemma4:e4b\nPAP_LOG_LEVEL=debug\n",
    );

    const loaded = loadRepositoryEnvironment({ cwd: nestedCwd, env: {} });
    assert.equal(loaded.OLLAMA_ENABLED, "true");
    assert.equal(loaded.OLLAMA_DEFAULT_MODEL, "gemma4:e4b");
    assert.equal(loaded.PAP_LOG_LEVEL, "debug");

    const overridden = loadRepositoryEnvironment({
      cwd: nestedCwd,
      env: { OLLAMA_ENABLED: "false" },
    });
    assert.equal(overridden.OLLAMA_ENABLED, "false");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
