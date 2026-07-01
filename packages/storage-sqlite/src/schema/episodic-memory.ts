import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { memoryScopes, memorySensitivities, memoryStatuses } from "./constants.js";
import { executionTraces } from "./execution-traces.js";
import { workspaces } from "./workspaces.js";

export const episodicMemory = sqliteTable(
  "episodic_memory",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: memoryScopes }).notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    capabilityId: text("capability_id"),
    threadId: text("thread_id"),
    executionId: text("execution_id").references(() => executionTraces.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    outcome: text("outcome"),
    relatedEntitiesJson: text("related_entities_json").notNull(),
    evidenceRefsJson: text("evidence_refs_json").notNull(),
    confidence: real("confidence").notNull(),
    sensitivity: text("sensitivity", { enum: memorySensitivities }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref"),
    sourceCapabilityId: text("source_capability_id"),
    status: text("status", { enum: memoryStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    expiresAt: text("expires_at"),
  },
  (table) => [
    index("episodic_memory_execution_idx").on(table.executionId),
    index("episodic_memory_workspace_status_idx").on(table.workspaceId, table.status),
    index("episodic_memory_capability_status_idx").on(table.capabilityId, table.status),
    index("episodic_memory_thread_status_idx").on(table.threadId, table.status),
    index("episodic_memory_event_type_idx").on(table.eventType),
    index("episodic_memory_created_at_idx").on(table.createdAt),
    index("episodic_memory_expires_at_idx").on(table.expiresAt),
  ],
);

export type EpisodicMemoryRow = typeof episodicMemory.$inferSelect;
