import assert from "node:assert/strict";
import { test } from "vitest";
import { createDisabledOllamaProviderHealth, resolveOllamaConfig } from "../dist/index.js";

test("resolveOllamaConfig applies defaults when enabled with a model", () => {
  const config = resolveOllamaConfig({
    OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: "http://127.0.0.1:11434",
    defaultModel: "llama3.2:latest",
    timeoutMs: 60_000,
    keepAlive: "5m",
  });
});

test("resolveOllamaConfig requires a default model when enabled", () => {
  assert.throws(() => resolveOllamaConfig({}));
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_ENABLED: "true",
      OLLAMA_DEFAULT_MODEL: "",
    }),
  );
});

test("resolveOllamaConfig allows disabled provider without a model", () => {
  const config = resolveOllamaConfig({
    OLLAMA_ENABLED: "false",
  });

  assert.equal(config.enabled, false);
  assert.equal(config.defaultModel, null);
});

test("resolveOllamaConfig rejects invalid timeout and keep-alive values", () => {
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_TIMEOUT_MS: "999",
    }),
  );
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_TIMEOUT_MS: "300001",
    }),
  );
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_KEEP_ALIVE: "forever",
    }),
  );
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_KEEP_ALIVE: "25h",
    }),
  );
});

test("resolveOllamaConfig rejects arbitrary public Ollama URLs", () => {
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_BASE_URL: "https://ollama.example.com",
    }),
  );
  assert.throws(() =>
    resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_BASE_URL: "http://8.8.8.8:11434",
    }),
  );
});

test("resolveOllamaConfig allows loopback, private LAN, local, and service hosts", () => {
  const allowedBaseUrls = [
    "http://localhost:11434",
    "http://127.0.0.1:11434",
    "http://10.0.0.12:11434",
    "http://172.16.0.12:11434",
    "http://192.168.1.12:11434",
    "http://ollama.local:11434",
    "http://ollama:11434",
  ];

  for (const baseUrl of allowedBaseUrls) {
    const config = resolveOllamaConfig({
      OLLAMA_DEFAULT_MODEL: "llama3.2:latest",
      OLLAMA_BASE_URL: baseUrl,
    });

    assert.equal(config.baseUrl, baseUrl);
  }
});

test("createDisabledOllamaProviderHealth returns provider health shape", () => {
  const health = createDisabledOllamaProviderHealth({
    providerId: "provider.local_ollama",
    checkedAt: "2026-07-02T09:00:00.000Z",
  });

  assert.deepEqual(health, {
    providerId: "provider.local_ollama",
    kind: "ollama",
    status: "disabled",
    checkedAt: "2026-07-02T09:00:00.000Z",
    message: "Ollama provider is disabled by configuration.",
  });
});
