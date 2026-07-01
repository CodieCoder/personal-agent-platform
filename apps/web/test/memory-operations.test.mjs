import assert from "node:assert/strict";
import { test } from "vitest";
import { createMemoryService } from "@pap/memory";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
} from "@pap/storage-sqlite";
import { createTemporarySqliteDatabase } from "@pap/testing";
import {
  approveSemanticMemoryProposalOperation,
  createManualSemanticMemoryOperation,
  deleteMemoryRecordOperation,
  getMemoryRecordOperation,
  listProposedSemanticMemoryOperation,
  listSemanticMemoryOperation,
  rejectSemanticMemoryProposalOperation,
  updateSemanticMemoryOperation,
} from "../src/features/memory/operations.ts";

const fixedNow = "2026-06-30T12:00:00.000Z";
const fixedClock = () => new Date(fixedNow);

test("memory operations create, list, update, get, and soft-delete through MemoryService", async () => {
  const fixture = await createMemoryOperationFixture("pap-web-memory-ops-");

  try {
    const created = await createManualSemanticMemoryOperation(fixture.state, {
      scope: "personal",
      subject: "project.paos",
      predicate: "api",
      value: "server functions",
      confidence: 1,
      sensitivity: "sensitive",
      sourceType: "manual",
    });
    assert.equal(created.ok, true);
    const memoryId = created.ok ? created.memory.id : "memory_missing";

    const updated = await updateSemanticMemoryOperation(fixture.state, {
      id: memoryId,
      value: "server functions only",
    });
    const fetched = await getMemoryRecordOperation(fixture.state, {
      id: memoryId,
    });
    const deleted = await deleteMemoryRecordOperation(fixture.state, {
      id: memoryId,
      type: "semantic",
    });
    const defaultList = await listSemanticMemoryOperation(fixture.state, {});
    const deletedList = await listSemanticMemoryOperation(fixture.state, { status: "deleted" });

    assert.equal(created.ok && created.memory.status, "active");
    assert.equal(updated.ok, true);
    assert.equal(updated.ok && updated.memory.value, "server functions only");
    assert.equal(fetched.ok, true);
    assert.equal(fetched.ok && fetched.found, true);
    assert.equal(deleted.ok, true);
    assert.equal(deleted.ok && deleted.memory.record.status, "deleted");
    assert.deepEqual(defaultList.ok && defaultList.records.map((record) => record.id), []);
    assert.deepEqual(deletedList.ok && deletedList.records.map((record) => record.id), [memoryId]);
  } finally {
    fixture.close();
  }
});

test("memory proposal operations list, approve, and reject safely", async () => {
  const fixture = await createMemoryOperationFixture("pap-web-memory-proposals-");

  try {
    const approveTarget = await fixture.state.memoryService.proposeSemanticMemory({
      id: "memory_web_approve",
      scope: "personal",
      subject: "project.paos",
      predicate: "proposal",
      value: "approve",
      confidence: 0.8,
      sensitivity: "low",
      sourceType: "capability",
      sourceRef: "exec_web_memory",
      sourceExecutionId: "exec_web_memory",
      sourceCapabilityId: "capability.web",
    });
    const rejectTarget = await fixture.state.memoryService.proposeSemanticMemory({
      id: "memory_web_reject",
      scope: "personal",
      subject: "project.paos",
      predicate: "proposal",
      value: "reject",
      confidence: 0.8,
      sensitivity: "low",
      sourceType: "capability",
      sourceRef: "exec_web_memory",
      sourceExecutionId: "exec_web_memory",
      sourceCapabilityId: "capability.web",
    });

    const proposed = await listProposedSemanticMemoryOperation(fixture.state, {});
    const approved = await approveSemanticMemoryProposalOperation(fixture.state, {
      id: approveTarget.id,
    });
    const rejected = await rejectSemanticMemoryProposalOperation(fixture.state, {
      id: rejectTarget.id,
    });

    assert.deepEqual(proposed.ok && proposed.records.map((record) => record.id).sort(), [
      "memory_web_approve",
      "memory_web_reject",
    ]);
    assert.equal(approved.ok, true);
    assert.equal(approved.ok && approved.memory.status, "active");
    assert.equal(rejected.ok, true);
    assert.equal(rejected.ok && rejected.memory.status, "rejected");
  } finally {
    fixture.close();
  }
});

test("memory operations return safe errors for invalid IDs and bad source execution links", async () => {
  const fixture = await createMemoryOperationFixture("pap-web-memory-errors-");

  try {
    const invalidId = await getMemoryRecordOperation(fixture.state, {
      id: "",
    });
    const missingExecution = await createManualSemanticMemoryOperation(fixture.state, {
      scope: "personal",
      subject: "project.paos",
      predicate: "source",
      value: "missing",
      sourceExecutionId: "exec_missing",
    });

    assert.equal(invalidId.ok, false);
    assert.equal(invalidId.error.code, "MEMORY_ID_INVALID");
    assert.equal(missingExecution.ok, false);
    assert.equal(missingExecution.error.code, "MEMORY_SOURCE_EXECUTION_NOT_FOUND");
  } finally {
    fixture.close();
  }
});

async function createMemoryOperationFixture(prefix) {
  const temporaryDatabase = await createTemporarySqliteDatabase(prefix);

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  const connection = createSqliteDatabase({ databaseUrl: temporaryDatabase.databaseUrl });
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
    clock: fixedClock,
  });

  await traceRepository.create({
    id: "exec_web_memory",
    capabilityId: "capability.web",
    startedAt: "2026-06-30T10:00:00.000Z",
  });

  return {
    state: {
      memoryService,
    },
    close: connection.close,
  };
}
