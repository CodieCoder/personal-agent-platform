import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createDisabledSearxngProviderHealth,
  resolveSearxngConfig,
  resolveRuntimeSearxngConfig,
} from "../dist/index.js";

test("resolveSearxngConfig applies loopback JSON-search defaults", () => {
  const config = resolveSearxngConfig({});

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    defaultLanguage: "en",
    defaultSafesearch: 1,
  });
});

test("resolveSearxngConfig allows disabled provider with safe defaults", () => {
  const config = resolveRuntimeSearxngConfig({
    SEARXNG_ENABLED: "false",
  });

  assert.equal(config.enabled, false);
  assert.equal(config.baseUrl, "http://127.0.0.1:8080");
});

test("resolveSearxngConfig validates timeout, language, and safesearch bounds", () => {
  assert.throws(() => resolveSearxngConfig({ SEARXNG_TIMEOUT_MS: "999" }));
  assert.throws(() => resolveSearxngConfig({ SEARXNG_TIMEOUT_MS: "60001" }));
  assert.throws(() => resolveSearxngConfig({ SEARXNG_DEFAULT_LANGUAGE: "e" }));
  assert.throws(() => resolveSearxngConfig({ SEARXNG_DEFAULT_SAFESEARCH: "3" }));
  assert.throws(() => resolveSearxngConfig({ SEARXNG_ENABLED: "yes" }));
});

test("resolveSearxngConfig allows only loopback origins", () => {
  const allowedBaseUrls = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://127.42.0.5:8080",
    "http://[::1]:8080",
  ];

  for (const baseUrl of allowedBaseUrls) {
    assert.equal(resolveSearxngConfig({ SEARXNG_BASE_URL: baseUrl }).baseUrl, baseUrl);
  }

  const rejectedBaseUrls = [
    "https://searxng.example.com",
    "http://8.8.8.8:8080",
    "http://10.0.0.12:8080",
    "http://192.168.1.12:8080",
    "http://searxng:8080",
    "http://searxng.local:8080",
    "file:///tmp/searxng",
    "http://user:pass@127.0.0.1:8080",
    "http://127.0.0.1:8080/search",
    "http://127.0.0.1:8080?x=1",
    "http://127.0.0.1:8080/#hash",
  ];

  for (const baseUrl of rejectedBaseUrls) {
    assert.throws(() => resolveSearxngConfig({ SEARXNG_BASE_URL: baseUrl }), baseUrl);
  }
});

test("createDisabledSearxngProviderHealth returns provider health shape", () => {
  const health = createDisabledSearxngProviderHealth({
    providerId: "provider.searxng",
    checkedAt: "2026-07-02T09:00:00.000Z",
  });

  assert.deepEqual(health, {
    providerId: "provider.searxng",
    kind: "searxng",
    status: "disabled",
    checkedAt: "2026-07-02T09:00:00.000Z",
    message: "SearXNG search provider is disabled by configuration.",
  });
});
