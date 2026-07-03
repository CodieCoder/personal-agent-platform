import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { traceStepKinds, traceStepStatuses } from "./constants.js";
import { executionTraces } from "./execution-traces.js";

export const executionTraceSteps = sqliteTable(
  "execution_trace_steps",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionTraces.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind", { enum: traceStepKinds }).notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: traceStepStatuses }).notNull(),
    summary: text("summary"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("execution_trace_steps_execution_id_idx").on(table.executionId),
    uniqueIndex("execution_trace_steps_execution_id_sequence_idx").on(
      table.executionId,
      table.sequence,
    ),
  ],
);

export type ExecutionTraceStepRow = typeof executionTraceSteps.$inferSelect;
