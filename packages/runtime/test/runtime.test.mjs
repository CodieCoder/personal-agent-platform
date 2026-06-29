import assert from "node:assert/strict";
import test from "node:test";
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
  return {
    manifest: {
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
    },
    inputSchema: passingSchema(),
    outputSchema: passingSchema(),
    execute: async (input) => input,
    ...overrides,
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

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
