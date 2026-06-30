import assert from "node:assert/strict";
import { test } from "vitest";
import { echoCapability } from "@pap/capability-echo";
import { z } from "@pap/contracts";
import { createRuntime } from "@pap/runtime";
import { createExecutionId, createTraceStepId, nowIso } from "@pap/shared";
import { createTemporarySqliteDatabase } from "@pap/testing";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteExecutionTraceRepository,
} from "../dist/index.js";

test("runMigrations can apply execution trace migrations twice", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-migrate-");

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });

  const { repository, close } = createRepository(temporaryDatabase.databaseUrl);

  try {
    const executionId = createExecutionId();
    const trace = await repository.create({
      id: executionId,
      capabilityId: "capability.test",
      startedAt: nowIso(),
    });

    assert.equal(trace.id, executionId);
    assert.equal(trace.status, "running");
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository persists traces and ordered steps", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-trace-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const executionId = createExecutionId();
    const startedAt = nowIso();

    await repository.create({
      id: executionId,
      capabilityId: "capability.test",
      workspaceId: "workspace_test",
      threadId: "thread_test",
      startedAt,
    });

    await repository.appendStep({
      id: createTraceStepId(),
      executionId,
      sequence: 1,
      kind: "workflow",
      name: "second",
      status: "completed",
      startedAt,
      completedAt: nowIso(),
    });

    await repository.appendStep({
      id: createTraceStepId(),
      executionId,
      sequence: 0,
      kind: "validation",
      name: "first",
      status: "completed",
      summary: "validated input",
      startedAt,
      completedAt: nowIso(),
    });

    const completed = await repository.markCompleted({
      executionId,
      completedAt: nowIso(),
    });

    assert.equal(completed.status, "completed");
    assert.equal(completed.workspaceId, "workspace_test");
    assert.equal(completed.steps.map((step) => step.name).join(","), "first,second");

    const fetched = await repository.getById(executionId);

    assert.equal(fetched?.steps[0]?.sequence, 0);
    assert.equal(fetched?.steps[1]?.sequence, 1);
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository rejects steps for missing executions", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-fk-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    await assert.rejects(
      repository.appendStep({
        id: createTraceStepId(),
        executionId: "exec_missing",
        sequence: 0,
        kind: "workflow",
        name: "orphan step",
        status: "started",
        startedAt: nowIso(),
      }),
      /FOREIGN KEY constraint failed/u,
    );
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository persists failed and cancelled traces", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-terminal-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const failedExecutionId = createExecutionId();
    const cancelledExecutionId = createExecutionId();

    await repository.create({
      id: failedExecutionId,
      capabilityId: "capability.test",
      startedAt: nowIso(),
    });
    await repository.create({
      id: cancelledExecutionId,
      capabilityId: "capability.test",
      startedAt: nowIso(),
    });

    const failed = await repository.markFailed({
      executionId: failedExecutionId,
      completedAt: nowIso(),
      error: {
        code: "TEST_FAILURE",
        message: "The test failed safely.",
        category: "storage",
        retryable: false,
      },
    });
    const cancelled = await repository.markCancelled({
      executionId: cancelledExecutionId,
      completedAt: nowIso(),
      reason: "User cancelled the test.",
    });

    assert.equal(failed.status, "failed");
    assert.equal(failed.errorCode, "TEST_FAILURE");
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.errorCode, "EXECUTION_CANCELLED");
    assert.equal(cancelled.errorMessage, "User cancelled the test.");
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository lists recent traces by start time with filters", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-recent-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    await repository.create({
      id: "exec_old",
      capabilityId: "capability.alpha",
      startedAt: "2026-06-29T09:00:00.000Z",
    });
    await repository.create({
      id: "exec_middle",
      capabilityId: "capability.beta",
      startedAt: "2026-06-29T10:00:00.000Z",
    });
    await repository.create({
      id: "exec_new",
      capabilityId: "capability.alpha",
      startedAt: "2026-06-29T11:00:00.000Z",
    });

    await repository.markCompleted({
      executionId: "exec_new",
      completedAt: "2026-06-29T11:01:00.000Z",
    });

    const recent = await repository.listRecent({ limit: 2 });
    const alphaCompleted = await repository.listRecent({
      capabilityId: "capability.alpha",
      status: "completed",
    });

    assert.deepEqual(
      recent.map((trace) => trace.id),
      ["exec_new", "exec_middle"],
    );
    assert.deepEqual(
      alphaCompleted.map((trace) => trace.id),
      ["exec_new"],
    );
  } finally {
    close();
  }
});

test("createRuntime executes echo and persists a SQLite trace", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-echo-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [echoCapability],
    });

    const result = await runtime.execute({
      capabilityId: "capability.echo",
      input: { message: "  hello \n\t runtime  " },
      source: "cli",
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(result.data.message, "hello runtime");

    const trace = await repository.getById(result.executionId);

    assert.equal(trace?.id, result.traceId);
    assert.equal(trace?.capabilityId, "capability.echo");
    assert.equal(trace?.status, "completed");
    assert.deepEqual(
      trace?.steps.map((step) => step.name),
      ["validate input", "echo.normalize", "validate output", "finalize execution"],
    );
    assert.deepEqual(
      trace?.steps.map((step) => step.sequence),
      [0, 1, 2, 3],
    );
  } finally {
    close();
  }
});

test("createRuntime persists failed validation traces for invalid echo input", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-invalid-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [echoCapability],
    });

    const result = await runtime.execute({
      capabilityId: "capability.echo",
      input: { message: "   " },
      source: "cli",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "CAPABILITY_INPUT_INVALID");

    const trace = await repository.getById(result.executionId);

    assert.equal(trace?.status, "failed");
    assert.equal(trace?.errorCode, "CAPABILITY_INPUT_INVALID");
    assert.deepEqual(
      trace?.steps.map((step) => `${step.name}:${step.status}`),
      ["validate input:failed"],
    );
  } finally {
    close();
  }
});

test("createRuntime does not create a SQLite trace for unknown capabilities", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-unknown-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [],
    });

    const result = await runtime.execute({
      capabilityId: "capability.echo",
      input: { message: "hello" },
      source: "cli",
    });
    const traces = await repository.listRecent();

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "CAPABILITY_NOT_FOUND");
    assert.deepEqual(traces, []);
  } finally {
    close();
  }
});

test("createRuntime serializes unhandled capability errors safely in SQLite traces", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-error-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [createThrowingCapability()],
    });

    const result = await runtime.execute({
      capabilityId: "capability.boom",
      input: { message: "hello" },
      source: "cli",
    });
    const trace = await repository.getById(result.executionId);

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "CAPABILITY_EXECUTION_FAILED");
    assert.equal(result.error.message, "Capability capability.boom failed during execution.");
    assert.equal(trace?.status, "failed");
    assert.equal(trace?.errorCode, "CAPABILITY_EXECUTION_FAILED");
    assert.equal(trace?.errorMessage, "Capability capability.boom failed during execution.");
    assert.equal(JSON.stringify(result).includes("database password leaked"), false);
    assert.equal(JSON.stringify(trace).includes("database password leaked"), false);
  } finally {
    close();
  }
});

function createMigratedRepository(databaseUrl) {
  runMigrations({ databaseUrl });
  return createRepository(databaseUrl);
}

function createRepository(databaseUrl) {
  const connection = createSqliteDatabase({ databaseUrl });
  const repository = new SqliteExecutionTraceRepository(connection.db);

  return {
    repository,
    close: connection.close,
  };
}

function createThrowingCapability() {
  return {
    manifest: {
      id: "capability.boom",
      version: "0.1.0",
      name: "Boom",
      description: "Throws during execution for integration testing.",
      skill: {
        id: "skill.boom",
        version: "0.1.0",
        path: "./skills/boom",
      },
      inputSchemaId: "capability.boom.input.v1",
      outputSchemaId: "capability.boom.output.v1",
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
    inputSchema: z.object({ message: z.string().min(1) }).strict(),
    outputSchema: z.object({ message: z.string().min(1) }).strict(),
    execute: async () => {
      throw new Error("database password leaked in raw exception");
    },
  };
}
