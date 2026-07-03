import assert from "node:assert/strict";
import { test } from "vitest";
import { createAIProviderRegistry } from "@pap/ai";
import { createRuntime } from "@pap/runtime";
import {
  buildLocalModelTestPrompt,
  executeLocalModelTest,
  localModelTestCapability,
  localModelTestInputSchema,
  localModelTestManifest,
  localModelTestModelOutputSchema,
  localModelTestOutputSchema,
  localModelTestProviderId,
  localModelTestResponseSchemaId,
} from "../dist/index.js";

const fixedNow = "2026-07-02T09:00:00.000Z";
const model = "llama3.2:latest";
const validModelOutput = {
  summary: "The prompt asks for a concise project summary.",
  keyPoints: ["Summarize the prompt", "Return structured JSON"],
  confidence: 0.82,
};

test("manifest declares a core no-tool, no-memory local model capability", () => {
  assert.equal(localModelTestManifest.id, "capability.local-model-test");
  assert.equal(localModelTestManifest.trustLevel, "core");
  assert.deepEqual(localModelTestManifest.allowedTools, []);
  assert.deepEqual(localModelTestManifest.allowedChildCapabilities, []);
  assert.deepEqual(localModelTestManifest.supportedUiBlocks, []);
  assert.deepEqual(localModelTestManifest.permissions, ["llm.generate"]);
  assert.deepEqual(localModelTestManifest.sideEffects, ["none"]);
  assert.equal(localModelTestManifest.memoryPolicyId, "memory.none");
  assert.equal(localModelTestManifest.approvalPolicyId, "approval.none");
});

test("schemas validate bounded input, model output, and final provider envelope", () => {
  assert.deepEqual(
    localModelTestInputSchema.parse({
      prompt: "  Summarize this. ",
      workspaceId: "workspace_local_model",
      model,
    }),
    {
      prompt: "Summarize this.",
      workspaceId: "workspace_local_model",
      model,
    },
  );
  assert.equal(localModelTestInputSchema.safeParse({ prompt: "   " }).success, false);
  assert.equal(localModelTestInputSchema.safeParse({ prompt: "x".repeat(4_001) }).success, false);
  assert.equal(localModelTestModelOutputSchema.safeParse(validModelOutput).success, true);
  assert.equal(
    localModelTestModelOutputSchema.safeParse({ ...validModelOutput, keyPoints: [] }).success,
    false,
  );
  assert.equal(
    localModelTestOutputSchema.safeParse({
      ...validModelOutput,
      provider: localModelTestProviderId,
      model,
    }).success,
    true,
  );
});

test("prompt builder uses only the submitted prompt and fixed output instructions", () => {
  const prompt = buildLocalModelTestPrompt("Summarize the phase plan.");

  assert.equal(prompt.includes("Summarize the phase plan."), true);
  assert.equal(prompt.includes("summary"), true);
  assert.equal(prompt.includes("keyPoints"), true);
  assert.equal(prompt.includes("confidence"), true);
  assert.equal(prompt.includes("memory"), false);
  assert.equal(prompt.includes("workspace"), false);
});

test("executeLocalModelTest uses runtime llm context and does not call tools or memory", async () => {
  const context = createDirectContext();
  const result = await executeLocalModelTest({ prompt: "Summarize this prompt." }, context);

  assert.deepEqual(result, {
    ...validModelOutput,
    provider: localModelTestProviderId,
    model,
  });
  assert.deepEqual(
    context.steps.map((step) => step.name),
    ["resolve provider", "build prompt"],
  );
  assert.equal(context.healthChecks, 1);
  assert.equal(context.generationRequests.length, 1);
  assert.equal(context.generationRequests[0].providerId, localModelTestProviderId);
  assert.equal(context.generationRequests[0].model, model);
  assert.equal(context.generationRequests[0].temperature, 0);
  assert.equal(context.generationRequests[0].maxTokens, 512);
  assert.equal(context.generationRequests[0].responseSchema.id, localModelTestResponseSchemaId);
  assert.equal(context.toolCalls, 0);
  assert.equal(context.memoryCalls, 0);
});

test("executeLocalModelTest rejects unallowlisted model overrides before generation", async () => {
  const context = createDirectContext();

  await assert.rejects(
    () =>
      executeLocalModelTest(
        { prompt: "Summarize this prompt.", model: "other-model:latest" },
        context,
      ),
    (error) =>
      error.name === "LocalModelTestSafeError" &&
      error.platformError.code === "CAPABILITY_INPUT_INVALID",
  );
  assert.equal(context.healthChecks, 1);
  assert.equal(context.generationRequests.length, 0);
});

test("executeLocalModelTest fails safely when provider health is not ready", async () => {
  const context = createDirectContext({
    health: {
      providerId: localModelTestProviderId,
      kind: "ollama",
      status: "unavailable",
      checkedAt: fixedNow,
      message: "Ollama is unavailable.",
    },
  });

  await assert.rejects(
    () => executeLocalModelTest({ prompt: "Summarize this prompt." }, context),
    (error) =>
      error.name === "LocalModelTestSafeError" &&
      error.platformError.code === "AI_PROVIDER_UNAVAILABLE",
  );
  assert.equal(context.generationRequests.length, 0);
});

test("executeLocalModelTest fails safely when provider is disabled", async () => {
  const context = createDirectContext({
    health: {
      providerId: localModelTestProviderId,
      kind: "ollama",
      status: "disabled",
      checkedAt: fixedNow,
      message: "Ollama provider is disabled by configuration.",
    },
  });

  await assert.rejects(
    () => executeLocalModelTest({ prompt: "Summarize this prompt." }, context),
    (error) =>
      error.name === "LocalModelTestSafeError" &&
      error.platformError.code === "AI_PROVIDER_DISABLED",
  );
  assert.equal(context.generationRequests.length, 0);
});

test("local-model-test runs through RuntimeExecutionService and persists output", async () => {
  const repository = new InMemoryTraceRepository();
  const memoryService = new RecordingMemoryService();
  const provider = createAIProvider();
  const runtime = createRuntime({
    traceRepository: repository,
    memoryService,
    aiProviderRegistry: createAIProviderRegistry([provider]),
    capabilities: [localModelTestCapability],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.local-model-test",
    input: { prompt: "Summarize the local model test." },
    source: "cli",
    workspaceId: "workspace_local_model",
    requestedUi: false,
  });
  const trace = await repository.getById(result.executionId);
  const invokeStep = trace.steps.find((step) => step.name === "invoke model");

  assert.equal(result.status, "completed");
  assert.deepEqual(result.data, {
    ...validModelOutput,
    provider: localModelTestProviderId,
    model,
  });
  assert.deepEqual(trace.output, result.data);
  assert.equal(trace.workspaceId, "workspace_local_model");
  assert.deepEqual(
    trace.steps.map((step) => step.name),
    [
      "validate input",
      "resolve provider",
      "provider health check",
      "build prompt",
      "invoke model",
      "validate structured output",
      "validate output",
      "finalize execution",
    ],
  );
  assert.deepEqual(invokeStep.metadata, {
    providerId: localModelTestProviderId,
    model,
    responseSchemaId: localModelTestResponseSchemaId,
    timeoutMs: 60_000,
    keepAlive: null,
    temperature: 0,
    maxTokens: 512,
    durationMs: 250,
    promptTokenCount: 10,
    completionTokenCount: 20,
    totalTokenCount: 30,
  });
  assert.equal(memoryService.writes.length, 0);
  assert.equal(provider.requests.length, 1);
});

test("provider-unavailable execution fails with inspectable health trace evidence", async () => {
  const repository = new InMemoryTraceRepository();
  const provider = createAIProvider({
    health: {
      providerId: localModelTestProviderId,
      kind: "ollama",
      status: "unavailable",
      checkedAt: fixedNow,
      message: "Ollama is unavailable.",
      model,
      metadata: {
        errorKind: "provider_unavailable",
        retryable: true,
      },
    },
  });
  const runtime = createRuntime({
    traceRepository: repository,
    aiProviderRegistry: createAIProviderRegistry([provider]),
    capabilities: [localModelTestCapability],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.local-model-test",
    input: { prompt: "Summarize the local model test." },
    source: "cli",
  });
  const trace = await repository.getById(result.executionId);
  const healthStep = trace.steps.find((step) => step.name === "provider health check");

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "AI_PROVIDER_UNAVAILABLE");
  assert.equal(provider.requests.length, 0);
  assert.equal(trace.status, "failed");
  assert.equal(trace.output, undefined);
  assert.equal(healthStep.metadata.healthStatus, "unavailable");
  assert.equal(healthStep.metadata.errorKind, "provider_unavailable");
});

test("schema-invalid provider output fails safely with validation trace evidence", async () => {
  const repository = new InMemoryTraceRepository();
  const provider = createAIProvider({ output: { wrong: true }, rawText: '{"wrong":true}' });
  const runtime = createRuntime({
    traceRepository: repository,
    aiProviderRegistry: createAIProviderRegistry([provider]),
    capabilities: [localModelTestCapability],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.local-model-test",
    input: { prompt: "Summarize the local model test." },
    source: "cli",
  });
  const trace = await repository.getById(result.executionId);
  const validationStep = trace.steps.find((step) => step.name === "validate structured output");

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "AI_PROVIDER_SCHEMA_INVALID");
  assert.equal(trace.status, "failed");
  assert.equal(validationStep.status, "failed");
  assert.equal(validationStep.metadata.responseSchemaId, localModelTestResponseSchemaId);
  assert.equal(JSON.stringify(trace).includes("wrong"), false);
  assert.equal(JSON.stringify(trace).includes("rawText"), false);
});

function createDirectContext(overrides = {}) {
  const context = {
    steps: [],
    generationRequests: [],
    healthChecks: 0,
    toolCalls: 0,
    memoryCalls: 0,
    executionId: "exec_local_model",
    capability: localModelTestManifest,
    source: "cli",
    trace: {
      addStep: async (step) => {
        context.steps.push(step);
      },
    },
    tools: {
      execute: async () => {
        context.toolCalls += 1;
        throw new Error("local-model-test must not execute tools.");
      },
    },
    memory: {
      getMasterProfile: async () => failMemoryCall(context),
      search: async () => failMemoryCall(context),
      write: async () => failMemoryCall(context),
    },
    llm: {
      getProviderHealth: async () => {
        context.healthChecks += 1;
        return (
          overrides.health ?? {
            providerId: localModelTestProviderId,
            kind: "ollama",
            status: "healthy",
            checkedAt: fixedNow,
            model,
          }
        );
      },
      generateStructured: async (request) => {
        context.generationRequests.push(request);
        return {
          providerId: request.providerId,
          model: request.model,
          output: validModelOutput,
          rawText: JSON.stringify(validModelOutput),
          startedAt: fixedNow,
          completedAt: "2026-07-02T09:00:00.250Z",
          durationMs: 250,
          promptTokenCount: 10,
          completionTokenCount: 20,
          totalTokenCount: 30,
        };
      },
    },
    ui: {
      build: async () => {
        throw new Error("local-model-test must not build UI.");
      },
    },
    approvals: {
      request: async () => {
        throw new Error("local-model-test must not request approvals.");
      },
    },
  };

  return context;
}

function failMemoryCall(context) {
  context.memoryCalls += 1;
  throw new Error("local-model-test must not use memory.");
}

function createAIProvider(overrides = {}) {
  const requests = [];

  return {
    id: localModelTestProviderId,
    requests,
    async health() {
      return (
        overrides.health ?? {
          providerId: localModelTestProviderId,
          kind: "ollama",
          status: "healthy",
          checkedAt: fixedNow,
          model,
          metadata: {
            modelPresent: true,
            modelCount: 1,
            ollamaVersion: "0.5.0",
          },
        }
      );
    },
    async generateStructured(request) {
      requests.push(request);
      return {
        providerId: localModelTestProviderId,
        model: request.model,
        output: overrides.output ?? validModelOutput,
        rawText: overrides.rawText ?? JSON.stringify(overrides.output ?? validModelOutput),
        startedAt: fixedNow,
        completedAt: "2026-07-02T09:00:00.250Z",
        durationMs: 250,
        promptTokenCount: 10,
        completionTokenCount: 20,
        totalTokenCount: 30,
      };
    },
  };
}

class InMemoryTraceRepository {
  traces = [];
  steps = [];

  async create(input) {
    const trace = {
      id: input.id,
      capabilityId: input.capabilityId,
      status: "running",
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      startedAt: input.startedAt,
      createdAt: input.startedAt,
      updatedAt: input.startedAt,
      steps: [],
    };
    this.traces.push(trace);
    return this.cloneTrace(trace);
  }

  async appendStep(input) {
    const step = {
      id: input.id,
      executionId: input.executionId,
      sequence: input.sequence,
      kind: input.kind,
      name: input.name,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
      startedAt: input.startedAt,
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      createdAt: input.startedAt,
    };
    this.steps.push(step);
    return { ...step };
  }

  async markCompleted(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "completed";
    trace.completedAt = input.completedAt;
    trace.updatedAt = input.completedAt;
    if (input.output !== undefined) {
      trace.output = input.output;
    }
    delete trace.errorCode;
    delete trace.errorMessage;
    return this.cloneTrace(trace);
  }

  async markFailed(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "failed";
    trace.completedAt = input.completedAt;
    trace.errorCode = input.error.code;
    trace.errorMessage = input.error.message;
    trace.updatedAt = input.completedAt;
    delete trace.output;
    return this.cloneTrace(trace);
  }

  async markCancelled(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "cancelled";
    trace.completedAt = input.completedAt;
    trace.errorCode = "EXECUTION_CANCELLED";
    trace.errorMessage = input.reason ?? "Execution cancelled.";
    trace.updatedAt = input.completedAt;
    delete trace.output;
    return this.cloneTrace(trace);
  }

  async getById(executionId) {
    const trace = this.traces.find((candidate) => candidate.id === executionId);
    return trace ? this.cloneTrace(trace) : null;
  }

  async listRecent() {
    return this.traces.map((trace) => this.cloneTrace(trace));
  }

  async listPage() {
    return {
      executions: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }

  requireTrace(executionId) {
    const trace = this.traces.find((candidate) => candidate.id === executionId);

    if (!trace) {
      throw new Error(`Trace not found: ${executionId}`);
    }

    return trace;
  }

  cloneTrace(trace) {
    return {
      ...trace,
      steps: this.steps
        .filter((step) => step.executionId === trace.id)
        .sort((left, right) => left.sequence - right.sequence)
        .map((step) => ({ ...step })),
    };
  }
}

class RecordingMemoryService {
  writes = [];

  async writeFromCapability(context, input) {
    this.writes.push({ context, input });
  }
}

function fixedClock() {
  return new Date(fixedNow);
}
