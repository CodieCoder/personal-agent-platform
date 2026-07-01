import assert from "node:assert/strict";
import { test } from "vitest";
import { createTemporarySqliteDatabase } from "@pap/testing";
import { createMemoryService, MemoryServiceError } from "../dist/index.js";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  SqliteWorkspaceRepository,
} from "../../storage-sqlite/dist/index.js";

const fixedNow = "2026-06-30T12:00:00.000Z";
const fixedClock = () => new Date(fixedNow);

test("MemoryService creates manual semantic memory as active even when sensitive", async () => {
  const fixture = await createMemoryFixture("pap-memory-manual-");

  try {
    const memory = await fixture.service.createSemanticMemory({
      id: "memory_manual_sensitive",
      scope: "personal",
      subject: "user.private_preference",
      predicate: "prefers",
      value: "local-only notes",
      confidence: 1,
      sensitivity: "sensitive",
      sourceType: "manual",
    });

    assert.equal(memory.status, "active");
    assert.equal(memory.createdBy, "user");
    assert.equal(memory.sensitivity, "sensitive");
  } finally {
    fixture.close();
  }
});

test("MemoryService proposes, approves, rejects, updates, expires, and soft-deletes semantic memory", async () => {
  const fixture = await createMemoryFixture("pap-memory-semantic-flow-");

  try {
    const proposal = await fixture.service.writeAutomaticSemanticMemory({
      id: "memory_auto_proposal",
      scope: "personal",
      subject: "project.paos",
      predicate: "maybe_prefers",
      value: "memory proposals",
      confidence: 0.7,
      sensitivity: "low",
      sourceType: "capability",
      sourceRef: "exec_semantic_flow",
      sourceExecutionId: "exec_semantic_flow",
      sourceCapabilityId: "capability.memory",
    });
    const updated = await fixture.service.updateSemanticMemory({
      id: proposal.id,
      value: "reviewed memory proposals",
      confidence: 0.8,
    });
    const approved = await fixture.service.approveSemanticMemoryProposal(proposal.id);
    const rejected = await fixture.service.proposeSemanticMemory({
      id: "memory_rejected_proposal",
      scope: "personal",
      subject: "project.paos",
      predicate: "temporary_guess",
      value: true,
      confidence: 0.65,
      sensitivity: "low",
      sourceType: "capability",
      sourceRef: "exec_semantic_flow",
      sourceExecutionId: "exec_semantic_flow",
      sourceCapabilityId: "capability.memory",
    });
    const rejectedResult = await fixture.service.rejectSemanticMemoryProposal(rejected.id);
    const expired = await fixture.service.expireMemoryRecord({
      id: approved.id,
      type: "semantic",
    });
    const deleted = await fixture.service.deleteMemoryRecord({
      id: approved.id,
      type: "semantic",
    });

    assert.equal(proposal.status, "proposed");
    assert.equal(updated.value, "reviewed memory proposals");
    assert.equal(approved.status, "active");
    assert.equal(rejectedResult.status, "rejected");
    assert.equal(expired.record.status, "expired");
    assert.equal(deleted.record.status, "deleted");
  } finally {
    fixture.close();
  }
});

test("MemoryService supersedes the previous semantic record when approving a proposed replacement", async () => {
  const fixture = await createMemoryFixture("pap-memory-approval-supersede-");

  try {
    const original = await fixture.service.createSemanticMemory({
      id: "memory_original_fact",
      scope: "personal",
      subject: "project.paos",
      predicate: "database",
      value: "sqlite",
      confidence: 1,
      sensitivity: "low",
    });
    const replacement = await fixture.service.proposeSemanticMemory({
      id: "memory_replacement_fact",
      scope: "personal",
      subject: "project.paos",
      predicate: "database",
      value: "sqlite with drizzle",
      confidence: 0.8,
      sensitivity: "low",
      sourceType: "capability",
      sourceRef: "exec_semantic_flow",
      sourceExecutionId: "exec_semantic_flow",
      sourceCapabilityId: "capability.memory",
      supersedesMemoryId: original.id,
    });
    const approved = await fixture.service.approveSemanticMemoryProposal(replacement.id);
    const fetchedOriginal = await fixture.service.getMemoryRecord(original.id);

    assert.equal(approved.status, "active");
    assert.equal(approved.supersedesMemoryId, original.id);
    assert.equal(fetchedOriginal?.type, "semantic");
    assert.equal(fetchedOriginal?.record.status, "superseded");
    assert.equal(fetchedOriginal?.record.supersededByMemoryId, replacement.id);
  } finally {
    fixture.close();
  }
});

test("MemoryService rejects low-confidence or unprovenanced automatic semantic writes without persisting", async () => {
  const fixture = await createMemoryFixture("pap-memory-semantic-reject-");

  try {
    await assert.rejects(
      fixture.service.writeAutomaticSemanticMemory({
        id: "memory_low_confidence",
        scope: "personal",
        subject: "project.paos",
        predicate: "guess",
        value: true,
        confidence: 0.39,
        sensitivity: "low",
        sourceType: "capability",
        sourceRef: "exec_semantic_flow",
      }),
      isMemoryWriteRejected,
    );
    await assert.rejects(
      fixture.service.writeAutomaticSemanticMemory({
        id: "memory_without_source",
        scope: "personal",
        subject: "project.paos",
        predicate: "guess",
        value: true,
        confidence: 0.95,
        sensitivity: "low",
      }),
      isMemoryWriteRejected,
    );

    assert.equal(await fixture.semanticMemoryRepository.getById("memory_low_confidence"), null);
    assert.equal(await fixture.semanticMemoryRepository.getById("memory_without_source"), null);
  } finally {
    fixture.close();
  }
});

test("MemoryService validates supplied source execution links and rejects mismatches", async () => {
  const fixture = await createMemoryFixture("pap-memory-source-validation-");

  try {
    await assert.rejects(
      fixture.service.createSemanticMemory({
        id: "memory_missing_source_execution",
        scope: "personal",
        subject: "project.paos",
        predicate: "source",
        value: "missing",
        sourceExecutionId: "exec_missing",
      }),
      (error) =>
        error instanceof MemoryServiceError &&
        error.platformError.code === "MEMORY_SOURCE_EXECUTION_NOT_FOUND",
    );
    await assert.rejects(
      fixture.service.createSemanticMemory({
        id: "memory_mismatched_source_execution",
        scope: "personal",
        capabilityId: "capability.other",
        subject: "project.paos",
        predicate: "source",
        value: "mismatch",
        sourceExecutionId: "exec_semantic_flow",
      }),
      (error) =>
        error instanceof MemoryServiceError &&
        error.platformError.code === "MEMORY_SOURCE_EXECUTION_MISMATCH",
    );
  } finally {
    fixture.close();
  }
});

test("MemoryService creates validated execution-linked episodic memory and rejects unsafe automatic episodes", async () => {
  const fixture = await createMemoryFixture("pap-memory-episodic-");

  try {
    const episode = await fixture.service.createExecutionEpisode({
      id: "memory_episode_completed",
      scope: "capability",
      capabilityId: "capability.memory",
      executionId: "exec_semantic_flow",
      eventType: "capability.completed",
      summary: "Memory capability completed a test execution.",
      confidence: 1,
      sensitivity: "low",
      sourceType: "execution",
      sourceRef: "exec_semantic_flow",
      sourceCapabilityId: "capability.memory",
    });

    await assert.rejects(
      fixture.service.createExecutionEpisode({
        id: "memory_episode_sensitive",
        scope: "capability",
        capabilityId: "capability.memory",
        executionId: "exec_semantic_flow",
        eventType: "capability.completed",
        summary: "Sensitive episode should not be automatic.",
        confidence: 1,
        sensitivity: "sensitive",
        sourceType: "execution",
        sourceRef: "exec_semantic_flow",
      }),
      isMemoryWriteRejected,
    );
    await assert.rejects(
      fixture.service.createExecutionEpisode({
        id: "memory_episode_mismatch",
        scope: "capability",
        capabilityId: "capability.other",
        executionId: "exec_semantic_flow",
        eventType: "capability.completed",
        summary: "Mismatched episode should fail.",
        confidence: 1,
        sensitivity: "low",
        sourceType: "execution",
        sourceRef: "exec_semantic_flow",
      }),
      (error) =>
        error instanceof MemoryServiceError &&
        error.platformError.code === "MEMORY_SOURCE_EXECUTION_MISMATCH",
    );

    assert.equal(episode.status, "active");
    assert.equal(episode.executionId, "exec_semantic_flow");
    assert.equal(await fixture.episodicMemoryRepository.getById("memory_episode_sensitive"), null);
  } finally {
    fixture.close();
  }
});

test("MemoryService applies capability context before validating scoped capability writes", async () => {
  const fixture = await createMemoryFixture("pap-memory-capability-context-");
  const context = {
    executionId: "exec_semantic_flow",
    capabilityId: "capability.memory",
    workspaceId: "workspace_memory",
  };

  try {
    const semantic = await fixture.service.writeFromCapability(context, {
      type: "semantic",
      record: {
        id: "memory_capability_workspace",
        scope: "workspace",
        subject: "project.paos",
        predicate: "uses_context",
        value: true,
        confidence: 1,
        sensitivity: "low",
      },
    });
    const episodic = await fixture.service.writeFromCapability(context, {
      type: "episodic",
      record: {
        id: "memory_capability_episode",
        scope: "capability",
        eventType: "capability.completed",
        summary: "Capability memory write used runtime context.",
        confidence: 1,
        sensitivity: "low",
      },
    });

    assert.equal(semantic.type, "semantic");
    assert.equal(semantic.record.status, "active");
    assert.equal(semantic.record.workspaceId, context.workspaceId);
    assert.equal(semantic.record.capabilityId, context.capabilityId);
    assert.equal(semantic.record.sourceExecutionId, context.executionId);
    assert.equal(semantic.record.sourceCapabilityId, context.capabilityId);
    assert.equal(episodic.type, "episodic");
    assert.equal(episodic.record.status, "active");
    assert.equal(episodic.record.workspaceId, context.workspaceId);
    assert.equal(episodic.record.capabilityId, context.capabilityId);
    assert.equal(episodic.record.executionId, context.executionId);
    assert.equal(episodic.record.sourceCapabilityId, context.capabilityId);
  } finally {
    fixture.close();
  }
});

async function createMemoryFixture(prefix) {
  const temporaryDatabase = await createTemporarySqliteDatabase(prefix);

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  const connection = createSqliteDatabase({ databaseUrl: temporaryDatabase.databaseUrl });
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const service = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
    clock: fixedClock,
  });

  await workspaceRepository.create({
    id: "workspace_memory",
    name: "Memory",
  });
  await traceRepository.create({
    id: "exec_semantic_flow",
    capabilityId: "capability.memory",
    workspaceId: "workspace_memory",
    startedAt: "2026-06-30T10:00:00.000Z",
  });

  return {
    connection,
    traceRepository,
    workspaceRepository,
    semanticMemoryRepository,
    episodicMemoryRepository,
    service,
    close: connection.close,
  };
}

function isMemoryWriteRejected(error) {
  return (
    error instanceof MemoryServiceError && error.platformError.code === "MEMORY_WRITE_REJECTED"
  );
}
