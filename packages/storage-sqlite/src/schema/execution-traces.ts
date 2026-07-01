import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { executionStatuses } from "./constants.js";

export const executionTraces = sqliteTable(
  "execution_traces",
  {
    id: text("id").primaryKey(),
    capabilityId: text("capability_id").notNull(),
    status: text("status", { enum: executionStatuses }).notNull(),
    workspaceId: text("workspace_id"),
    threadId: text("thread_id"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("execution_traces_started_at_idx").on(table.startedAt),
    index("execution_traces_status_idx").on(table.status),
    index("execution_traces_capability_id_idx").on(table.capabilityId),
    index("execution_traces_workspace_started_at_idx").on(table.workspaceId, table.startedAt),
  ],
);

export type ExecutionTraceRow = typeof executionTraces.$inferSelect;
