import type { Workspace, WorkspaceId } from "@pap/contracts";

export type CreateWorkspaceInput = {
  id?: WorkspaceId;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListWorkspacesInput = {
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export type UpdateWorkspaceInput = {
  id: WorkspaceId;
  name?: string;
  description?: string;
  updatedAt?: string;
};

export type ArchiveWorkspaceInput = {
  id: WorkspaceId;
  archivedAt?: string;
};

export interface WorkspaceRepository {
  create(input: CreateWorkspaceInput): Promise<Workspace>;
  getById(id: WorkspaceId): Promise<Workspace | null>;
  list(input?: ListWorkspacesInput): Promise<Workspace[]>;
  update(input: UpdateWorkspaceInput): Promise<Workspace>;
  archive(input: ArchiveWorkspaceInput): Promise<Workspace>;
}
