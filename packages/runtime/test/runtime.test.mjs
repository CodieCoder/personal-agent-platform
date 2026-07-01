import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CapabilityRegistry,
  RuntimeExecutionService,
  RuntimeSafeError,
  TraceWriter,
  createRuntime,
} from "../dist/index.js";

const fixedNow = "2026-06-29T12:00:00.000Z";
const fixedClock = () => new Date(fixedNow);

test("CapabilityRegistry rejects duplicate registrations", () => {
  const registry = new CapabilityRegistry();
  const capability = createCapability();

  registry.register(capability);

  assert.throws(
    () => registry.register(capability),
    (error) =>
      error instanceof RuntimeSafeError &&
      error.platformError.code === "CAPABILITY_ALREADY_REGISTERED",
  );
});

test("CapabilityRegistry rejects unknown lookups and lists manifests", () => {
  const registry = new CapabilityRegistry();
  registry.register(createCapability());

  assert.deepEqual(
    registry.listManifests().map((manifest) => manifest.id),
    ["capability.test"],
  );

  assert.throws(
    () => registry.get("capability.missing"),
    (error) =>
      error instanceof RuntimeSafeError && error.platformError.code === "CAPABILITY_NOT_FOUND",
  );
});

test("TraceWriter assigns deterministic sequence numbers and finalizes once", async () => {
  const repository = new InMemoryTraceRepository();
  const writer = new TraceWriter(repository, { clock: fixedClock });

  await writer.start({ executionId: "exec_trace", capabilityId: "capability.test" });
  await writer.addStep({ kind: "workflow", name: "first step" });
  await writer.addStep({ kind: "workflow", name: "second step" });
  const completed = await writer.complete();

  assert.equal(completed.status, "completed");
  assert.deepEqual(
    repository.steps.map((step) => step.sequence),
    [0, 1],
  );
  await assert.rejects(
    () =>
      writer.fail({
        code: "CAPABILITY_EXECUTION_FAILED",
        message: "Should not be accepted.",
        category: "capability",
        retryable: false,
      }),
    (error) =>
      error instanceof RuntimeSafeError && error.platformError.code === "TRACE_ALREADY_FINALIZED",
  );
});

test("TraceWriter rejects invalid steps before persistence or sequence reservation", async () => {
  const repository = new InMemoryTraceRepository();
  const writer = new TraceWriter(repository, { clock: fixedClock });

  await writer.start({ executionId: "exec_invalid_step", capabilityId: "capability.test" });
  await assert.rejects(
    () => writer.addStep({ kind: "unknown", name: "bad step" }),
    (error) => typeof error === "object" && error !== null && Array.isArray(error.issues),
  );

  assert.equal(repository.steps.length, 0);

  await writer.addStep({ kind: "workflow", name: "first valid step" });
  assert.deepEqual(
    repository.steps.map((step) => step.sequence),
    [0],
  );
});

test("TraceWriter reserves sequence numbers before concurrent step writes complete", async () => {
  const repository = new InMemoryTraceRepository({ appendStepDelayMs: 5 });
  const writer = new TraceWriter(repository, { clock: fixedClock });

  await writer.start({ executionId: "exec_concurrent_trace", capabilityId: "capability.test" });
  await Promise.all([
    writer.addStep({ kind: "workflow", name: "first concurrent step" }),
    writer.addStep({ kind: "workflow", name: "second concurrent step" }),
  ]);

  assert.deepEqual(
    repository.steps.map((step) => step.sequence),
    [0, 1],
  );
});

test("RuntimeExecutionService fails unknown capabilities before trace creation", async () => {
  const repository = new InMemoryTraceRepository();
  const service = new RuntimeExecutionService({
    registry: new CapabilityRegistry(),
    traceRepository: repository,
    clock: fixedClock,
  });

  const result = await service.execute({
    capabilityId: "capability.missing",
    input: {},
    source: "cli",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "CAPABILITY_NOT_FOUND");
  assert.equal(repository.traces.length, 0);
});

test("RuntimeExecutionService creates a failed trace for invalid capability input", async () => {
  const repository = new InMemoryTraceRepository();
  const registry = new CapabilityRegistry();
  registry.register(createCapability({ inputSchema: failingSchema("message is required") }));
  const service = new RuntimeExecutionService({ registry, traceRepository: repository });

  const result = await service.execute({
    capabilityId: "capability.test",
    input: {},
    source: "cli",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "CAPABILITY_INPUT_INVALID");
  assert.equal(repository.traces.length, 1);
  assert.equal(repository.traces[0].status, "failed");
});

test("RuntimeExecutionService completes valid capability output", async () => {
  const repository = new InMemoryTraceRepository();
  const runtime = createRuntime({
    traceRepository: repository,
    capabilities: [
      createCapability({
        execute: async () => ({ message: "hello" }),
      }),
    ],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.test",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.data, { message: "hello" });
  assert.deepEqual(
    runtime.listCapabilities().map((manifest) => manifest.id),
    ["capability.test"],
  );
  assert.equal(repository.traces[0].status, "completed");
});

test("RuntimeExecutionService exposes service-backed memory reads with trace steps", async () => {
  const repository = new InMemoryTraceRepository();
  const memoryService = new RecordingMemoryService();
  const runtime = createRuntime({
    traceRepository: repository,
    memoryService,
    capabilities: [
      createCapability({
        manifest: {
          permissions: ["memory.read"],
        },
        execute: async (_input, context) => {
          const profile = await context.memory.getMasterProfile();
          const search = await context.memory.search({ semantic: { limit: 1 } });

          return {
            profileCount: profile.length,
            searchSemanticCount: search.semantic.length,
          };
        },
      }),
    ],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.test",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.data, {
    profileCount: 1,
    searchSemanticCount: 1,
  });
  assert.deepEqual(
    repository.steps
      .filter((step) => step.kind === "memory")
      .map((step) => `${step.name}:${step.status}`),
    ["memory.getMasterProfile:completed", "memory.search:completed"],
  );
});

test("RuntimeExecutionService routes capability memory writes through MemoryService only", async () => {
  const repository = new InMemoryTraceRepository();
  const memoryService = new RecordingMemoryService();
  const runtime = createRuntime({
    traceRepository: repository,
    memoryService,
    capabilities: [
      createCapability({
        manifest: {
          permissions: ["memory.write"],
        },
        execute: async (_input, context) => {
          assert.equal("traceRepository" in context, false);
          assert.equal("semanticMemoryRepository" in context, false);
          assert.equal("repository" in context.memory, false);

          const write = await context.memory.write({
            type: "episodic",
            record: {
              scope: "capability",
              capabilityId: "capability.test",
              eventType: "capability.completed",
              summary: "Runtime memory write test completed.",
              confidence: 1,
              sensitivity: "low",
            },
          });

          return {
            writeType: write.type,
          };
        },
      }),
    ],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.test",
    input: { message: "hello" },
    source: "cli",
    workspaceId: "workspace_runtime",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.data.writeType, "episodic");
  assert.equal(memoryService.writes.length, 1);
  assert.equal(memoryService.writes[0].context.executionId, result.executionId);
  assert.equal(memoryService.writes[0].context.capabilityId, "capability.test");
  assert.equal(memoryService.writes[0].context.workspaceId, "workspace_runtime");
  assert.deepEqual(
    repository.steps
      .filter((step) => step.kind === "memory")
      .map((step) => `${step.name}:${step.status}`),
    ["memory.write:completed"],
  );
});

test("RuntimeExecutionService denies memory writes without manifest permission", async () => {
  const repository = new InMemoryTraceRepository();
  const memoryService = new RecordingMemoryService();
  const runtime = createRuntime({
    traceRepository: repository,
    memoryService,
    capabilities: [
      createCapability({
        execute: async (_input, context) => {
          await context.memory.write({
            type: "episodic",
            record: {
              scope: "capability",
              capabilityId: "capability.test",
              eventType: "capability.completed",
              summary: "This should be denied.",
              confidence: 1,
              sensitivity: "low",
            },
          });
        },
      }),
    ],
    clock: fixedClock,
  });

  const result = await runtime.execute({
    capabilityId: "capability.test",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "CAPABILITY_MEMORY_PERMISSION_DENIED");
  assert.equal(memoryService.writes.length, 0);
  assert.deepEqual(
    repository.steps
      .filter((step) => step.kind === "memory")
      .map((step) => `${step.name}:${step.status}:${step.errorCode}`),
    ["memory.write:failed:CAPABILITY_MEMORY_PERMISSION_DENIED"],
  );
});

test("RuntimeExecutionService fails traces for invalid output", async () => {
  const repository = new InMemoryTraceRepository();
  const registry = new CapabilityRegistry();
  registry.register(
    createCapability({
      outputSchema: failingSchema("output is invalid"),
      execute: async () => ({ message: "hello" }),
    }),
  );
  const service = new RuntimeExecutionService({ registry, traceRepository: repository });

  const result = await service.execute({
    capabilityId: "capability.test",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "CAPABILITY_OUTPUT_INVALID");
  assert.equal(repository.traces[0].status, "failed");
});

test("RuntimeExecutionService serializes unhandled capability errors safely", async () => {
  const repository = new InMemoryTraceRepository();
  const registry = new CapabilityRegistry();
  registry.register(
    createCapability({
      execute: async () => {
        throw new Error("database password leaked in raw exception");
      },
    }),
  );
  const service = new RuntimeExecutionService({ registry, traceRepository: repository });

  const result = await service.execute({
    capabilityId: "capability.test",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "CAPABILITY_EXECUTION_FAILED");
  assert.equal(result.error.message, "Capability capability.test failed during execution.");
  assert.equal(repository.traces[0].errorCode, "CAPABILITY_EXECUTION_FAILED");
  assert.equal(
    repository.traces[0].errorMessage,
    "Capability capability.test failed during execution.",
  );
});

function createCapability(overrides = {}) {
  const defaultManifest = {
    id: "capability.test",
    version: "0.1.0",
    name: "Test Capability",
    description: "A test capability.",
    skill: {
      id: "skill.test",
      version: "0.1.0",
      path: "./skills/test",
    },
    inputSchemaId: "capability.test.input.v1",
    outputSchemaId: "capability.test.output.v1",
    allowedTools: [],
    allowedChildCapabilities: [],
    supportedUiBlocks: [],
    permissions: [],
    sideEffects: ["none"],
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
    tags: ["test"],
  };
  const manifestOverrides = overrides.manifest ?? {};

  return {
    manifest: {
      ...defaultManifest,
      ...manifestOverrides,
      skill: {
        ...defaultManifest.skill,
        ...(manifestOverrides.skill ?? {}),
      },
    },
    inputSchema: passingSchema(),
    outputSchema: passingSchema(),
    execute: async (input) => input,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "manifest")),
  };
}

function passingSchema() {
  return {
    safeParse(value) {
      return { success: true, data: value };
    },
  };
}

function failingSchema(message) {
  return {
    safeParse() {
      return {
        success: false,
        error: {
          issues: [{ path: ["message"], message }],
        },
      };
    },
  };
}

class InMemoryTraceRepository {
  traces = [];
  steps = [];

  constructor(options = {}) {
    this.appendStepDelayMs = options.appendStepDelayMs ?? 0;
  }

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
    if (this.appendStepDelayMs > 0) {
      await sleep(this.appendStepDelayMs);
    }

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
    return this.cloneTrace(trace);
  }

  async markCancelled(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "cancelled";
    trace.completedAt = input.completedAt;
    trace.errorCode = "EXECUTION_CANCELLED";
    trace.errorMessage = input.reason ?? "Execution cancelled.";
    trace.updatedAt = input.completedAt;
    return this.cloneTrace(trace);
  }

  async getById(executionId) {
    const trace = this.traces.find((candidate) => candidate.id === executionId);
    return trace ? this.cloneTrace(trace) : null;
  }

  async listRecent() {
    return this.traces.map((trace) => this.cloneTrace(trace));
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

  async listSemanticMemory() {
    return [createSemanticMemoryRecord("memory_semantic_list")];
  }

  async listEpisodicMemory() {
    return [];
  }

  async getMemoryRecord() {
    return null;
  }

  async createSemanticMemory() {
    return createSemanticMemoryRecord("memory_created");
  }

  async writeAutomaticSemanticMemory() {
    return createSemanticMemoryRecord("memory_automatic");
  }

  async proposeSemanticMemory() {
    return createSemanticMemoryRecord("memory_proposed", { status: "proposed" });
  }

  async updateSemanticMemory() {
    return createSemanticMemoryRecord("memory_updated");
  }

  async supersedeSemanticMemory() {
    return {
      previous: createSemanticMemoryRecord("memory_previous", { status: "superseded" }),
      replacement: createSemanticMemoryRecord("memory_replacement"),
    };
  }

  async approveSemanticMemoryProposal() {
    return createSemanticMemoryRecord("memory_approved");
  }

  async rejectSemanticMemoryProposal() {
    return createSemanticMemoryRecord("memory_rejected", { status: "rejected" });
  }

  async createEpisodicMemory() {
    return createEpisodicMemoryRecord("memory_episode");
  }

  async createExecutionEpisode() {
    return createEpisodicMemoryRecord("memory_execution_episode");
  }

  async expireMemoryRecord() {
    return {
      type: "semantic",
      record: createSemanticMemoryRecord("memory_expired", { status: "expired" }),
    };
  }

  async deleteMemoryRecord() {
    return {
      type: "semantic",
      record: createSemanticMemoryRecord("memory_deleted", { status: "deleted" }),
    };
  }

  async getMasterProfile() {
    return [createSemanticMemoryRecord("memory_profile")];
  }

  async search() {
    return {
      semantic: [createSemanticMemoryRecord("memory_search")],
      episodic: [],
    };
  }

  async writeFromCapability(context, input) {
    this.writes.push({ context, input });

    return {
      type: "episodic",
      record: createEpisodicMemoryRecord("memory_runtime_write", {
        executionId: context.executionId,
      }),
    };
  }
}

function createSemanticMemoryRecord(id, overrides = {}) {
  return {
    id,
    scope: "personal",
    subject: "project.paos",
    predicate: "test",
    value: true,
    sourceType: "manual",
    evidenceRefs: [],
    createdBy: "test",
    confidence: 1,
    sensitivity: "low",
    status: "active",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

function createEpisodicMemoryRecord(id, overrides = {}) {
  return {
    id,
    scope: "capability",
    capabilityId: "capability.test",
    eventType: "capability.completed",
    summary: "Test episode.",
    relatedEntities: [],
    sourceType: "execution",
    evidenceRefs: [],
    confidence: 1,
    sensitivity: "low",
    status: "active",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
