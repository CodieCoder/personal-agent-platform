import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { researchSourceStatuses } from "./constants.js";
import { executionTraces } from "./execution-traces.js";
import { researchReports } from "./research-reports.js";
import { webExtractionEvidence } from "./web-evidence.js";

export const researchSources = sqliteTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => researchReports.id, { onDelete: "cascade" }),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionTraces.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    evidenceId: text("evidence_id").references(() => webExtractionEvidence.id, {
      onDelete: "no action",
    }),
    url: text("url").notNull(),
    finalUrl: text("final_url"),
    title: text("title"),
    publishedAt: text("published_at"),
    selectionRank: integer("selection_rank"),
    relevanceScore: real("relevance_score"),
    analysisJson: text("analysis_json"),
    citationIdsJson: text("citation_ids_json").notNull(),
    status: text("status", { enum: researchSourceStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("research_sources_report_id_idx").on(table.reportId),
    index("research_sources_execution_id_idx").on(table.executionId),
    index("research_sources_workspace_execution_idx").on(table.workspaceId, table.executionId),
    index("research_sources_evidence_id_idx").on(table.evidenceId),
    index("research_sources_status_idx").on(table.status),
    index("research_sources_selection_rank_idx").on(table.selectionRank),
  ],
);

export type ResearchSourceRow = typeof researchSources.$inferSelect;
