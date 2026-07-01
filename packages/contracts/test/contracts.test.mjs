import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";
import {
  capabilityDefinitionSchema,
  capabilityExecutionContextSchema,
  capabilityExecutionRequestSchema,
  capabilityExecutionResultSchema,
  capabilityManifestSchema,
  createEpisodicMemoryRequestSchema,
  createSemanticMemoryRequestSchema,
  createWorkspaceRequestSchema,
  episodicMemoryQuerySchema,
  episodicMemoryRecordSchema,
  executionStatusSchema,
  listWorkspacesRequestSchema,
  semanticMemoryQuerySchema,
  semanticMemoryRecordSchema,
  parsePlatformError,
  platformErrorSchema,
  updateWorkspaceRequestSchema,
  workspaceSchema,
} from "../dist/index.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("executionStatusSchema accepts the initial execution statuses", () => {
  assert.equal(executionStatusSchema.parse("running"), "running");
  assert.equal(executionStatusSchema.parse("completed"), "completed");
  assert.equal(executionStatusSchema.safeParse("awaiting_approval").success, false);
});

test("platformErrorSchema validates typed platform errors", () => {
  const error = parsePlatformError({
    code: "CAPABILITY_NOT_FOUND",
    message: "Capability was not registered.",
    category: "capability",
  });

  assert.equal(error.retryable, false);
  assert.equal(
    platformErrorSchema.safeParse({ code: "bad", message: "", category: "unknown" }).success,
    false,
  );
});

test("capabilityManifestSchema validates required runtime metadata", () => {
  const manifest = capabilityManifestSchema.parse({
    id: "capability.echo",
    version: "0.1.0",
    name: "Echo",
    description: "Returns normalized text input.",
    skill: {
      id: "skill.echo",
      version: "0.1.0",
      path: "./skills/echo",
    },
    inputSchemaId: "capability.echo.input.v1",
    outputSchemaId: "capability.echo.output.v1",
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
  });

  assert.equal(manifest.skill.entryFile, "SKILL.md");
  assert.deepEqual(manifest.allowedTools, []);
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.sideEffects, ["none"]);
  assert.equal(
    capabilityManifestSchema.safeParse({
      id: "bad id",
      version: "0.1.0",
      name: "Echo",
      description: "Returns normalized text input.",
      skill: {
        id: "skill.echo",
        version: "0.1.0",
        path: "./skills/echo",
      },
      inputSchemaId: "capability.echo.input.v1",
      outputSchemaId: "capability.echo.output.v1",
      approvalPolicyId: "approval.none",
      memoryPolicyId: "memory.none",
      trustLevel: "core",
    }).success,
    false,
  );
  assert.equal(
    capabilityManifestSchema.safeParse({
      id: "capability.echo",
      version: "0.1.0",
      name: "Echo",
    }).success,
    false,
  );
});

test("capabilityExecutionRequestSchema validates capability execution requests", () => {
  const request = capabilityExecutionRequestSchema.parse({
    capabilityId: "capability.echo",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(request.capabilityId, "capability.echo");
  assert.equal(request.requestedUi, true);
  assert.deepEqual(request.context, { initiatedBy: "user" });
  assert.equal(
    capabilityExecutionRequestSchema.safeParse({ input: {}, source: "cli" }).success,
    false,
  );
  assert.equal(
    capabilityExecutionRequestSchema.safeParse({
      capabilityId: "capability echo",
      input: {},
      source: "cli",
    }).success,
    false,
  );
});

test("capabilityExecutionResultSchema validates results and rejects deferred statuses", () => {
  const result = capabilityExecutionResultSchema.parse({
    executionId: "exec_123",
    traceId: "exec_123",
    capabilityId: "capability.echo",
    status: "completed",
    data: { message: "hello" },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.ui, []);
  assert.deepEqual(result.approvals, []);
  assert.equal(
    capabilityExecutionResultSchema.safeParse({
      executionId: "exec_123",
      traceId: "exec_123",
      capabilityId: "capability.echo",
      status: "awaiting_approval",
    }).success,
    false,
  );
});

test("capabilityDefinitionSchema validates executable definitions", () => {
  const manifest = capabilityManifestSchema.parse({
    id: "capability.echo",
    version: "0.1.0",
    name: "Echo",
    description: "Returns normalized text input.",
    skill: {
      id: "skill.echo",
      version: "0.1.0",
      path: "./skills/echo",
    },
    inputSchemaId: "capability.echo.input.v1",
    outputSchemaId: "capability.echo.output.v1",
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
  });

  const definition = capabilityDefinitionSchema.parse({
    manifest,
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ message: z.string() }),
    execute: async (input) => input,
  });

  assert.equal(definition.manifest.id, "capability.echo");
  assert.equal(
    capabilityDefinitionSchema.safeParse({
      manifest,
      inputSchema: {},
      outputSchema: z.unknown(),
      execute: async (input) => input,
    }).success,
    false,
  );
});

test("capabilityExecutionContextSchema validates runtime context shape", () => {
  const manifest = capabilityManifestSchema.parse({
    id: "capability.echo",
    version: "0.1.0",
    name: "Echo",
    description: "Returns normalized text input.",
    skill: {
      id: "skill.echo",
      version: "0.1.0",
      path: "./skills/echo",
    },
    inputSchemaId: "capability.echo.input.v1",
    outputSchemaId: "capability.echo.output.v1",
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
  });

  const context = capabilityExecutionContextSchema.parse({
    executionId: "exec_123",
    capability: manifest,
    source: "cli",
    trace: {
      addStep: async () => undefined,
    },
    tools: {
      execute: async () => undefined,
    },
    memory: {
      getMasterProfile: async () => undefined,
      search: async () => undefined,
      write: async () => undefined,
    },
    llm: {
      generateStructured: async () => undefined,
    },
    ui: {
      build: async (blocks) => blocks,
    },
    approvals: {
      request: async (input) => input,
    },
  });

  assert.equal(context.capability.id, "capability.echo");
});

test("contract JSON fixtures remain valid", async () => {
  const manifest = await loadFixture("manifest.echo.json");
  const result = await loadFixture("execution-result.completed.json");

  assert.equal(capabilityManifestSchema.parse(manifest).id, "capability.echo");
  assert.equal(capabilityExecutionResultSchema.parse(result).status, "completed");
});

test("workspace contracts validate IDs, bounded names, defaults, and list requests", () => {
  const workspace = workspaceSchema.parse({
    id: "workspace_123",
    name: "  Personal OS  ",
    status: "active",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.equal(workspace.name, "Personal OS");
  assert.equal(workspace.description, "");
  assert.equal(createWorkspaceRequestSchema.safeParse({ name: "" }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...workspace, id: "x" }).success, false);
  assert.deepEqual(listWorkspacesRequestSchema.parse({}), {
    includeArchived: false,
    limit: 50,
    offset: 0,
  });
  assert.equal(updateWorkspaceRequestSchema.safeParse({ id: "workspace_123" }).success, false);
});

test("semantic memory contracts validate JSON values, confidence, and scope rules", () => {
  const memory = semanticMemoryRecordSchema.parse({
    id: "memory_123",
    scope: "workspace",
    workspaceId: "workspace_123",
    subject: "project.paos",
    predicate: "uses",
    value: { database: "sqlite", confidence: 1, tags: ["local-first"] },
    sourceType: "manual",
    status: "active",
    confidence: 0.8,
    sensitivity: "low",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.equal(memory.createdBy, "user");
  assert.deepEqual(memory.evidenceRefs, []);
  assert.equal(
    createSemanticMemoryRequestSchema.safeParse({
      scope: "workspace",
      subject: "project.paos",
      predicate: "uses",
      value: "sqlite",
      confidence: 1.1,
    }).success,
    false,
  );
  assert.equal(
    createSemanticMemoryRequestSchema.safeParse({
      scope: "workspace",
      subject: "project.paos",
      predicate: "uses",
      value: "sqlite",
    }).success,
    false,
  );
  assert.equal(
    createSemanticMemoryRequestSchema.safeParse({
      scope: "personal",
      subject: "bad",
      predicate: "bad",
      value: () => undefined,
    }).success,
    false,
  );
});

test("memory query contracts apply bounded defaults and reject inverted ranges", () => {
  const semanticQuery = semanticMemoryQuerySchema.parse({});
  const episodicQuery = episodicMemoryQuerySchema.parse({ limit: 100, offset: 2 });

  assert.equal(semanticQuery.status, "active");
  assert.equal(semanticQuery.includeExpired, false);
  assert.equal(semanticQuery.limit, 50);
  assert.equal(episodicQuery.limit, 100);
  assert.equal(episodicQuery.offset, 2);
  assert.equal(semanticMemoryQuerySchema.safeParse({ limit: 101 }).success, false);
  assert.equal(
    semanticMemoryQuerySchema.safeParse({ confidenceMin: 0.9, confidenceMax: 0.1 }).success,
    false,
  );
});

test("episodic memory contracts validate execution links and JSON-compatible arrays", () => {
  const episode = episodicMemoryRecordSchema.parse({
    id: "memory_episode_123",
    scope: "capability",
    capabilityId: "capability.echo",
    executionId: "exec_123",
    eventType: "capability.completed",
    summary: "Echo completed successfully.",
    relatedEntities: [{ type: "workspace", id: "workspace_123" }],
    evidenceRefs: ["exec_123"],
    sourceType: "execution",
    status: "active",
    confidence: 1,
    sensitivity: "low",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.equal(episode.executionId, "exec_123");
  assert.equal(
    createEpisodicMemoryRequestSchema.safeParse({
      scope: "thread",
      eventType: "capability.completed",
      summary: "Echo completed successfully.",
    }).success,
    false,
  );
  assert.equal(
    createEpisodicMemoryRequestSchema.safeParse({
      scope: "personal",
      eventType: "capability.completed",
      summary: "Echo completed successfully.",
      relatedEntities: [undefined],
    }).success,
    false,
  );
});

async function loadFixture(fileName) {
  return JSON.parse(await readFile(join(fixtureDirectory, fileName), "utf8"));
}
