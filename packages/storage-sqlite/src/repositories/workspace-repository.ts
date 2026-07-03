import {
  createWorkspaceRequestSchema,
  updateWorkspaceRequestSchema,
  workspaceSchema,
} from "@pap/contracts";
import type { Workspace, WorkspaceId } from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  ArchiveWorkspaceInput,
  CreateWorkspaceInput,
  ListWorkspacesInput,
  UpdateWorkspaceInput,
  WorkspaceRepository,
} from "@pap/storage";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { workspaces, type WorkspaceRow } from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";

const defaultWorkspaceLimit = 50;
const maxWorkspaceLimit = 100;

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const parsed = createWorkspaceRequestSchema.parse({
      name: input.name,
      description: input.description,
    });
    const timestamp = input.createdAt ?? nowIso();
    const id = input.id ?? createId("workspace");

    await this.db.insert(workspaces).values({
      id,
      name: parsed.name,
      description: parsed.description,
      status: "active",
      createdAt: timestamp,
      updatedAt: input.updatedAt ?? timestamp,
      archivedAt: null,
    });

    const workspace = await this.getById(id);
    return requireWorkspace(workspace, id);
  }

  async getById(id: WorkspaceId): Promise<Workspace | null> {
    const [row] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);

    return row ? toWorkspace(row) : null;
  }

  async list(input: ListWorkspacesInput = {}): Promise<Workspace[]> {
    const includeArchived = input.includeArchived ?? false;
    const limit = normalizeWorkspaceLimit(input.limit);
    const offset = Math.max(Math.trunc(input.offset ?? 0), 0);

    const rows = includeArchived
      ? await this.db
          .select()
          .from(workspaces)
          .orderBy(desc(workspaces.updatedAt))
          .limit(limit)
          .offset(offset)
      : await this.db
          .select()
          .from(workspaces)
          .where(eq(workspaces.status, "active"))
          .orderBy(desc(workspaces.updatedAt))
          .limit(limit)
          .offset(offset);

    return rows.map(toWorkspace);
  }

  async update(input: UpdateWorkspaceInput): Promise<Workspace> {
    const parsed = updateWorkspaceRequestSchema.parse({
      id: input.id,
      name: input.name,
      description: input.description,
    });
    const updates: { name?: string; description?: string; updatedAt: string } = {
      updatedAt: input.updatedAt ?? nowIso(),
    };

    if (parsed.name !== undefined) {
      updates.name = parsed.name;
    }

    if (parsed.description !== undefined) {
      updates.description = parsed.description;
    }

    await this.db.update(workspaces).set(updates).where(eq(workspaces.id, input.id));

    const workspace = await this.getById(input.id);
    return requireWorkspace(workspace, input.id);
  }

  async archive(input: ArchiveWorkspaceInput): Promise<Workspace> {
    const archivedAt = input.archivedAt ?? nowIso();

    await this.db
      .update(workspaces)
      .set({
        status: "archived",
        archivedAt,
        updatedAt: archivedAt,
      })
      .where(eq(workspaces.id, input.id));

    const workspace = await this.getById(input.id);
    return requireWorkspace(workspace, input.id);
  }
}

function normalizeWorkspaceLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return defaultWorkspaceLimit;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), maxWorkspaceLimit);
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return workspaceSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? undefined,
  });
}

function requireWorkspace(workspace: Workspace | null, id: WorkspaceId): Workspace {
  if (!workspace) {
    throw new Error(`Workspace not found: ${id}`);
  }

  return workspace;
}
