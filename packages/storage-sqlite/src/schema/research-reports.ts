import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { researchReportStatuses } from "./constants.js";
import { executionTraces } from "./execution-traces.js";

export const researchReports = sqliteTable(
  "research_reports",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionTraces.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    question: text("question").notNull(),
    summaryJson: text("summary_json").notNull(),
    findingsJson: text("findings_json").notNull(),
    citationsJson: text("citations_json").notNull(),
    limitationsJson: text("limitations_json").notNull(),
    warningsJson: text("warnings_json").notNull(),
    status: text("status", { enum: researchReportStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("research_reports_execution_id_idx").on(table.executionId),
    index("research_reports_workspace_status_created_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    index("research_reports_status_created_idx").on(table.status, table.createdAt),
    index("research_reports_created_at_idx").on(table.createdAt),
  ],
);

export type ResearchReportRow = typeof researchReports.$inferSelect;
