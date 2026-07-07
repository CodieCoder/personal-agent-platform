import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { executionTraces } from "./execution-traces.js";

export const webSearchEvidence = sqliteTable(
  "web_search_evidence",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionTraces.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    providerId: text("provider_id").notNull(),
    query: text("query").notNull(),
    requestJson: text("request_json").notNull(),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    resultCount: integer("result_count").notNull(),
    resultsJson: text("results_json").notNull(),
    warningsJson: text("warnings_json").notNull(),
    failureCategory: text("failure_category"),
    failureMessage: text("failure_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("web_search_evidence_execution_id_idx").on(table.executionId),
    index("web_search_evidence_workspace_execution_idx").on(table.workspaceId, table.executionId),
    index("web_search_evidence_created_at_idx").on(table.createdAt),
    index("web_search_evidence_expires_at_idx").on(table.expiresAt),
  ],
);

export const webFetchEvidence = sqliteTable(
  "web_fetch_evidence",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionTraces.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    searchEvidenceId: text("search_evidence_id").references(() => webSearchEvidence.id, {
      onDelete: "set null",
    }),
    selectedUrlSource: text("selected_url_source", {
      enum: ["search_result", "explicit_test_allowlist"],
    }).notNull(),
    selectedResultIndex: integer("selected_result_index"),
    requestedUrl: text("requested_url").notNull(),
    finalUrl: text("final_url"),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    contentLength: integer("content_length"),
    contentBytes: integer("content_bytes"),
    bodySha256: text("body_sha256"),
    redirectsJson: text("redirects_json").notNull(),
    warningsJson: text("warnings_json").notNull(),
    failureCategory: text("failure_category"),
    failureMessage: text("failure_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("web_fetch_evidence_execution_id_idx").on(table.executionId),
    index("web_fetch_evidence_workspace_execution_idx").on(table.workspaceId, table.executionId),
    index("web_fetch_evidence_search_evidence_id_idx").on(table.searchEvidenceId),
    index("web_fetch_evidence_created_at_idx").on(table.createdAt),
    index("web_fetch_evidence_expires_at_idx").on(table.expiresAt),
  ],
);

export const webExtractionEvidence = sqliteTable(
  "web_extraction_evidence",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executionTraces.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    fetchEvidenceId: text("fetch_evidence_id").references(() => webFetchEvidence.id, {
      onDelete: "set null",
    }),
    finalUrl: text("final_url").notNull(),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    extractionMethod: text("extraction_method", {
      enum: ["source_profile", "readability", "plain_text"],
    }),
    sourceProfileId: text("source_profile_id"),
    title: text("title"),
    byline: text("byline"),
    siteName: text("site_name"),
    publishedAt: text("published_at"),
    canonicalUrl: text("canonical_url"),
    excerpt: text("excerpt"),
    wordCount: integer("word_count"),
    contentTextSnapshot: text("content_text_snapshot"),
    contentTextSha256: text("content_text_sha256"),
    contentChars: integer("content_chars"),
    originalContentChars: integer("original_content_chars"),
    warningsJson: text("warnings_json").notNull(),
    failureCategory: text("failure_category"),
    failureMessage: text("failure_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("web_extraction_evidence_execution_id_idx").on(table.executionId),
    index("web_extraction_evidence_workspace_execution_idx").on(
      table.workspaceId,
      table.executionId,
    ),
    index("web_extraction_evidence_fetch_evidence_id_idx").on(table.fetchEvidenceId),
    index("web_extraction_evidence_source_profile_id_idx").on(table.sourceProfileId),
    index("web_extraction_evidence_created_at_idx").on(table.createdAt),
    index("web_extraction_evidence_expires_at_idx").on(table.expiresAt),
  ],
);

export type WebSearchEvidenceRow = typeof webSearchEvidence.$inferSelect;
export type WebFetchEvidenceRow = typeof webFetchEvidence.$inferSelect;
export type WebExtractionEvidenceRow = typeof webExtractionEvidence.$inferSelect;
