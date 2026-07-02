import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import {
  OllamaClient,
  OllamaProvider,
  createOllamaProviderRegistry,
  resolveRuntimeOllamaConfig,
} from "../dist/index.js";

const providerId = "provider.local_ollama";
const model = "llama3.2:latest";
const fixedClock = createClock([
  "2026-07-02T09:00:00.000Z",
  "2026-07-02T09:00:01.250Z",
  "2026-07-02T09:00:02.000Z",
  "2026-07-02T09:00:03.000Z",
]);

const responseSchema = {
  id: "model.echo.output",
  schema: z.object({ message: z.string() }),
};

test("OllamaClient sends explicit non-streaming JSON-schema requests and returns metadata", async () => {
  const calls = [];
  const client = new OllamaClient({
    baseUrl: "http://127.0.0.1:11434",
    timeoutMs: 60_000,
    keepAlive: "5m",
    clock: fixedClock,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        model,
        response: '{"message":"hello"}',
        done: true,
        prompt_eval_count: 7,
        eval_count: 3,
      });
    },
  });

  const result = await client.generateStructured({
    providerId,
    model,
    systemPrompt: "Answer tersely.",
    prompt: "Say hello.",
    responseSchema,
    timeoutMs: 12_000,
    keepAlive: "30s",
    temperature: 0.2,
    maxTokens: 64,
  });

  assert.equal(result.providerId, providerId);
  assert.equal(result.model, model);
  assert.deepEqual(result.output, { message: "hello" });
  assert.equal(result.durationMs, 1250);
  assert.equal(result.promptTokenCount, 7);
  assert.equal(result.completionTokenCount, 3);
  assert.equal(result.totalTokenCount, 10);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/generate");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, model);
  assert.equal(body.stream, false);
  assert.equal(body.keep_alive, "30s");
  assert.equal(body.system, "Answer tersely.");
  assert.equal(body.options.temperature, 0.2);
  assert.equal(body.options.num_predict, 64);
  assert.equal(body.format.type, "object");
  assert.ok(body.prompt.includes("Return only valid JSON"));
});

test("OllamaClient normalizes connection refusal, timeout, and HTTP 503", async () => {
  const unavailableClient = new OllamaClient({
    baseUrl: "http://127.0.0.1:11434",
    timeoutMs: 60_000,
    keepAlive: "5m",
    fetch: async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      });
    },
  });

  await assert.rejects(
    () => unavailableClient.getVersion({ providerId }),
    (error) => isProviderError(error, "provider_unavailable", true),
  );

  const timeoutClient = new OllamaClient({
    baseUrl: "http://127.0.0.1:11434",
    timeoutMs: 60_000,
    keepAlive: "5m",
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });

  await assert.rejects(
    () => timeoutClient.getVersion({ providerId, timeoutMs: 1 }),
    (error) => isProviderError(error, "provider_timeout", true),
  );

  const overloadedClient = new OllamaClient({
    baseUrl: "http://127.0.0.1:11434",
    timeoutMs: 60_000,
    keepAlive: "5m",
    fetch: async () => jsonResponse({ error: "busy" }, 503),
  });

  await assert.rejects(
    () => overloadedClient.getVersion({ providerId }),
    (error) => isProviderError(error, "provider_overloaded", true),
  );
});

test("OllamaClient normalizes malformed provider responses and schema-invalid output", async () => {
  const malformedBodyClient = createGenerateClient(async () => new Response("not-json"));

  await assert.rejects(
    () => generateWithClient(malformedBodyClient),
    (error) => isProviderError(error, "provider_invalid_response", false),
  );

  const invalidShapeClient = createGenerateClient(async () =>
    jsonResponse({
      response: '{"message":"hello"}',
      done: false,
    }),
  );

  await assert.rejects(
    () => generateWithClient(invalidShapeClient),
    (error) => isProviderError(error, "provider_invalid_response", false),
  );

  const malformedOutputClient = createGenerateClient(async () =>
    jsonResponse({
      response: "not-json",
      done: true,
    }),
  );

  await assert.rejects(
    () => generateWithClient(malformedOutputClient),
    (error) => isProviderError(error, "provider_invalid_response", false),
  );

  const schemaInvalidClient = createGenerateClient(async () =>
    jsonResponse({
      response: '{"wrong":true}',
      done: true,
    }),
  );

  await assert.rejects(
    () => generateWithClient(schemaInvalidClient),
    (error) => isProviderError(error, "provider_schema_invalid", false),
  );
});

test("OllamaProvider implements generation and health states", async () => {
  const provider = new OllamaProvider({
    providerId,
    config: enabledConfig(),
    client: new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      timeoutMs: 60_000,
      keepAlive: "5m",
      clock: fixedClock,
      fetch: sequenceFetch([
        jsonResponse({
          model,
          response: '{"message":"hello"}',
          done: true,
        }),
        jsonResponse({ version: "0.5.0" }),
        jsonResponse({ models: [{ name: model }] }),
      ]),
    }),
  });

  const generation = await provider.generateStructured({
    providerId,
    model,
    systemPrompt: null,
    prompt: "Say hello.",
    responseSchema,
    temperature: null,
    maxTokens: null,
    timeoutMs: 60_000,
    keepAlive: null,
    metadata: null,
  });
  const health = await provider.health();

  assert.deepEqual(generation.output, { message: "hello" });
  assert.equal(health.status, "healthy");
  assert.equal(health.metadata.modelPresent, true);
  assert.equal(health.metadata.ollamaVersion, "0.5.0");
});

test("OllamaProvider health reports degraded and unavailable states", async () => {
  const degradedProvider = new OllamaProvider({
    providerId,
    config: enabledConfig(),
    client: new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      timeoutMs: 60_000,
      keepAlive: "5m",
      fetch: sequenceFetch([jsonResponse({ version: "0.5.0" }), jsonResponse({ models: [] })]),
    }),
  });

  assert.equal((await degradedProvider.health()).status, "degraded");

  const unavailableProvider = new OllamaProvider({
    providerId,
    config: enabledConfig(),
    client: new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      timeoutMs: 60_000,
      keepAlive: "5m",
      fetch: async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
        });
      },
    }),
  });

  assert.equal((await unavailableProvider.health()).status, "unavailable");

  const disabledProvider = new OllamaProvider({
    providerId,
    config: {
      enabled: false,
      baseUrl: "http://127.0.0.1:11434",
      defaultModel: null,
      timeoutMs: 60_000,
      keepAlive: "5m",
    },
  });

  assert.equal((await disabledProvider.health()).status, "unavailable");
  await assert.rejects(
    () =>
      disabledProvider.generateStructured({
        providerId,
        model,
        systemPrompt: null,
        prompt: "Say hello.",
        responseSchema,
        temperature: null,
        maxTokens: null,
        timeoutMs: 60_000,
        keepAlive: null,
        metadata: null,
      }),
    (error) => isProviderError(error, "provider_disabled", false),
  );
});

test("Ollama runtime registration defaults disabled unless explicitly enabled", () => {
  const disabledConfig = resolveRuntimeOllamaConfig({});
  const registry = createOllamaProviderRegistry({ env: {} });

  assert.equal(disabledConfig.enabled, false);
  assert.equal(registry.has("provider.ollama"), true);

  const enabledConfigResult = resolveRuntimeOllamaConfig({
    OLLAMA_ENABLED: "true",
    OLLAMA_DEFAULT_MODEL: model,
  });

  assert.equal(enabledConfigResult.enabled, true);
  assert.equal(enabledConfigResult.defaultModel, model);
});

function createGenerateClient(fetch) {
  return new OllamaClient({
    baseUrl: "http://127.0.0.1:11434",
    timeoutMs: 60_000,
    keepAlive: "5m",
    fetch,
  });
}

async function generateWithClient(client) {
  return client.generateStructured({
    providerId,
    model,
    systemPrompt: null,
    prompt: "Say hello.",
    responseSchema,
    timeoutMs: 60_000,
    keepAlive: null,
    temperature: null,
    maxTokens: null,
  });
}

function enabledConfig() {
  return {
    enabled: true,
    baseUrl: "http://127.0.0.1:11434",
    defaultModel: model,
    timeoutMs: 60_000,
    keepAlive: "5m",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function sequenceFetch(responses) {
  const queue = [...responses];

  return async () => {
    const response = queue.shift();

    if (!response) {
      throw new Error("Unexpected fetch call.");
    }

    return response;
  };
}

function createClock(timestamps) {
  const queue = [...timestamps];

  return () => new Date(queue.shift() ?? timestamps.at(-1));
}

function isProviderError(error, code, retryable) {
  return (
    typeof error === "object" &&
    error !== null &&
    error.name === "AIProviderError" &&
    error.code === code &&
    error.retryable === retryable
  );
}
