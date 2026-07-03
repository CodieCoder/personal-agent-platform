import { type AnySQLiteColumn, index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { memoryScopes, memorySensitivities, memoryStatuses } from "./constants.js";
import { executionTraces } from "./execution-traces.js";
import { workspaces } from "./workspaces.js";

export const semanticMemory = sqliteTable(
  "semantic_memory",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: memoryScopes }).notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    capabilityId: text("capability_id"),
    threadId: text("thread_id"),
    subject: text("subject").notNull(),
    predicate: text("predicate").notNull(),
    valueJson: text("value_json").notNull(),
    confidence: real("confidence").notNull(),
    sensitivity: text("sensitivity", { enum: memorySensitivities }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref"),
    sourceExecutionId: text("source_execution_id").references(() => executionTraces.id, {
      onDelete: "set null",
    }),
    sourceCapabilityId: text("source_capability_id"),
    createdBy: text("created_by").notNull(),
    evidenceRefsJson: text("evidence_refs_json").notNull(),
    status: text("status", { enum: memoryStatuses }).notNull(),
    supersedesMemoryId: text("supersedes_memory_id").references(
      (): AnySQLiteColumn => semanticMemory.id,
      { onDelete: "set null" },
    ),
    supersededByMemoryId: text("superseded_by_memory_id").references(
      (): AnySQLiteColumn => semanticMemory.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    expiresAt: text("expires_at"),
  },
  (table) => [
    index("semantic_memory_scope_status_idx").on(table.scope, table.status),
    index("semantic_memory_workspace_status_idx").on(table.workspaceId, table.status),
    index("semantic_memory_capability_status_idx").on(table.capabilityId, table.status),
    index("semantic_memory_thread_status_idx").on(table.threadId, table.status),
    index("semantic_memory_subject_predicate_idx").on(table.subject, table.predicate),
    index("semantic_memory_source_execution_idx").on(table.sourceExecutionId),
    index("semantic_memory_expires_at_idx").on(table.expiresAt),
    index("semantic_memory_updated_at_idx").on(table.updatedAt),
  ],
);

export type SemanticMemoryRow = typeof semanticMemory.$inferSelect;
