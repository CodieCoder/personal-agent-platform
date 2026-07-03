import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import {
  AIProviderError,
  createAIProviderRegistry,
  createStructuredGenerationService,
  isAIProviderError,
  selectAIProvider,
  validateStructuredGenerationResult,
} from "../dist/index.js";

const baseResult = {
  providerId: "provider.local_ollama",
  model: "llama3.2:latest",
  rawText: '{"message":"hello"}',
  startedAt: "2026-07-02T09:00:00.000Z",
  completedAt: "2026-07-02T09:00:01.000Z",
  durationMs: 1000,
  promptTokenCount: null,
  completionTokenCount: null,
  totalTokenCount: null,
};

function createProvider({
  id = "provider.local_ollama",
  output = { message: "hello" },
  resultOverrides = {},
} = {}) {
  return {
    id,
    async health() {
      return {
        providerId: id,
        kind: "ollama",
        status: "healthy",
        checkedAt: "2026-07-02T09:00:00.000Z",
      };
    },
    async generateStructured() {
      return {
        ...baseResult,
        providerId: id,
        output,
        ...resultOverrides,
      };
    },
  };
}

test("provider registry registers, lists, and selects providers", () => {
  const provider = createProvider();
  const registry = createAIProviderRegistry([provider]);

  assert.equal(registry.has(provider.id), true);
  assert.equal(registry.get(provider.id), provider);
  assert.deepEqual(registry.list(), [provider]);
  assert.equal(selectAIProvider(registry, provider.id), provider);
});

test("provider registry throws typed errors for duplicate and unknown providers", () => {
  const provider = createProvider();
  const registry = createAIProviderRegistry([provider]);

  assert.throws(
    () => registry.register(provider),
    (error) =>
      error instanceof AIProviderError &&
      error.code === "provider_duplicate" &&
      error.providerId === provider.id,
  );
  assert.throws(
    () => registry.get("provider.missing"),
    (error) =>
      isAIProviderError(error) &&
      error.code === "provider_not_found" &&
      error.providerId === "provider.missing",
  );
});

test("structured validation returns typed output after schema validation", () => {
  const responseSchema = {
    id: "model.echo.output",
    schema: z.object({ message: z.string() }),
  };
  const result = validateStructuredGenerationResult(
    {
      ...baseResult,
      output: { message: "hello" },
    },
    responseSchema,
  );

  assert.equal(result.output.message, "hello");
});

test("structured generation service validates request and provider result contracts", async () => {
  const responseSchema = {
    id: "model.echo.output",
    schema: z.object({ message: z.string() }),
  };
  const validRequest = {
    providerId: "provider.local_ollama",
    model: "llama3.2:latest",
    systemPrompt: null,
    prompt: "Say hello.",
    responseSchema,
    temperature: null,
    maxTokens: null,
    timeoutMs: 60_000,
    keepAlive: null,
    metadata: null,
  };
  const invalidResultProvider = createProvider({ resultOverrides: { durationMs: -1 } });
  const invalidResultService = createStructuredGenerationService(
    createAIProviderRegistry([invalidResultProvider]),
  );

  await assert.rejects(
    () => invalidResultService.generateStructured(validRequest),
    (error) =>
      error instanceof AIProviderError &&
      error.code === "provider_invalid_response" &&
      error.providerId === "provider.local_ollama",
  );

  const requestService = createStructuredGenerationService(
    createAIProviderRegistry([createProvider()]),
  );
  await assert.rejects(
    () => requestService.generateStructured({ ...validRequest, prompt: "" }),
    (error) => error instanceof z.ZodError,
  );
});

test("structured validation throws a typed failure for invalid provider output", () => {
  const responseSchema = {
    id: "model.echo.output",
    schema: z.object({ message: z.string() }),
  };

  assert.throws(
    () =>
      validateStructuredGenerationResult(
        {
          ...baseResult,
          output: { wrong: true },
        },
        responseSchema,
      ),
    (error) =>
      error instanceof AIProviderError &&
      error.code === "provider_schema_invalid" &&
      error.providerId === "provider.local_ollama",
  );
});

test("structured generation service selects provider and validates provider output", async () => {
  const provider = createProvider();
  const registry = createAIProviderRegistry([provider]);
  const service = createStructuredGenerationService(registry);
  const result = await service.generateStructured({
    providerId: provider.id,
    model: "llama3.2:latest",
    systemPrompt: null,
    prompt: "Say hello.",
    responseSchema: {
      id: "model.echo.output",
      schema: z.object({ message: z.string() }),
    },
    temperature: null,
    maxTokens: null,
    timeoutMs: 60_000,
    keepAlive: null,
    metadata: null,
  });

  assert.equal(result.output.message, "hello");
});
