import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { researchFeedbackRatings } from "./constants.js";
import { researchReports } from "./research-reports.js";

export const researchReportFeedback = sqliteTable(
  "research_report_feedback",
  {
    reportId: text("report_id")
      .primaryKey()
      .references(() => researchReports.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    rating: text("rating", { enum: researchFeedbackRatings }).notNull(),
    useful: integer("useful").notNull().default(0),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("research_report_feedback_workspace_idx").on(table.workspaceId)],
);

export type ResearchReportFeedbackRow = typeof researchReportFeedback.$inferSelect;
