import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveProviderMode, shouldRunFeature } from "../src/config.ts";

test("QA provider mode defaults to live and preserves explicit fixture mode", () => {
  assert.equal(resolveProviderMode(undefined), "live");
  assert.equal(resolveProviderMode(""), "live");
  assert.equal(resolveProviderMode("  "), "live");
  assert.equal(resolveProviderMode(" LIVE "), "live");
  assert.equal(resolveProviderMode(" fixture "), "fixture");
  assert.throws(
    () => resolveProviderMode("mock"),
    /PAP_QA_PROVIDER_MODE must be 'live' or 'fixture'/u,
  );
});

test("QA feature selection includes only mode-specific feature files", () => {
  assert.equal(
    shouldRunFeature({ entry: "source-backed-research.feature", providerMode: "live" }),
    true,
  );
  assert.equal(
    shouldRunFeature({ entry: "source-backed-research.feature", providerMode: "fixture" }),
    true,
  );
  assert.equal(
    shouldRunFeature({ entry: "source-backed-research.live.feature", providerMode: "live" }),
    true,
  );
  assert.equal(
    shouldRunFeature({ entry: "source-backed-research.live.feature", providerMode: "fixture" }),
    false,
  );
  assert.equal(
    shouldRunFeature({ entry: "source-backed-research.fixture.feature", providerMode: "live" }),
    false,
  );
  assert.equal(
    shouldRunFeature({ entry: "source-backed-research.fixture.feature", providerMode: "fixture" }),
    true,
  );
});
