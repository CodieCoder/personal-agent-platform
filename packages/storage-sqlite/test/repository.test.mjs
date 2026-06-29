import assert from "node:assert/strict";
import test from "node:test";
import { echoCapability } from "@pap/capability-echo";
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
    assert.equal(trace?.steps.length, 1);
    assert.equal(trace?.steps[0]?.sequence, 0);
    assert.equal(trace?.steps[0]?.kind, "workflow");
    assert.equal(trace?.steps[0]?.name, "echo.normalize");
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
