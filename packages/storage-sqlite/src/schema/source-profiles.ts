import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sourceProfileStatuses } from "./constants.js";

export const sourceProfiles = sqliteTable(
  "source_profiles",
  {
    id: text("id").primaryKey(),
    domain: text("domain").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: sourceProfileStatuses }).notNull(),
    articleContainerSelector: text("article_container_selector"),
    titleSelector: text("title_selector"),
    bylineSelector: text("byline_selector"),
    publishedAtSelector: text("published_at_selector"),
    contentSelector: text("content_selector"),
    canonicalUrlSelector: text("canonical_url_selector"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("source_profiles_domain_unique").on(table.domain),
    index("source_profiles_status_idx").on(table.status),
    index("source_profiles_updated_at_idx").on(table.updatedAt),
  ],
);

export type SourceProfileRow = typeof sourceProfiles.$inferSelect;
