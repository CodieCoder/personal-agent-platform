import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { researchFeedbackRatings } from "./constants.js";
import { researchReports } from "./research-reports.js";
import { researchSources } from "./research-sources.js";

export const researchSourceFeedback = sqliteTable(
  "research_source_feedback",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    reportId: text("report_id")
      .notNull()
      .references(() => researchReports.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchSources.id, { onDelete: "cascade" }),
    rating: text("rating", { enum: researchFeedbackRatings }).notNull(),
    helpful: integer("helpful").notNull().default(0),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique("research_source_feedback_source_id_unique").on(table.sourceId),
    index("research_source_feedback_workspace_report_idx").on(table.workspaceId, table.reportId),
    index("research_source_feedback_report_source_idx").on(table.reportId, table.sourceId),
    index("research_source_feedback_rating_idx").on(table.rating),
  ],
);

export type ResearchSourceFeedbackRow = typeof researchSourceFeedback.$inferSelect;
