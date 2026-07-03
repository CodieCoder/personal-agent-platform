import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { workspaceStatuses } from "./constants.js";

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: workspaceStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    index("workspaces_status_idx").on(table.status),
    index("workspaces_updated_at_idx").on(table.updatedAt),
  ],
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
