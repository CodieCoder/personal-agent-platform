import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { Workspace } from "@pap/contracts";
import { DataRow, formatTimestamp } from "../executions/components";

const activeWorkspaceStorageKey = "pap.activeWorkspaceId";

export function WorkspaceStatusPill({ status }: { status: Workspace["status"] }) {
  const className = status === "active" ? "pill pill-success" : "pill pill-neutral";

  return <span className={className}>{status}</span>;
}

export function WorkspaceSelector({
  workspaces,
  selectedWorkspaceId,
  id,
  includeAllOption = true,
  allOptionLabel = "All active workspaces",
  restoreFromLocalStorage = false,
  autoSubmit = true,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId?: string | undefined;
  id?: string;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  restoreFromLocalStorage?: boolean;
  autoSubmit?: boolean;
}) {
  const activeWorkspaces = workspaces.filter((workspace) => workspace.status === "active");
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const selectedIsArchived = selectedWorkspace?.status === "archived";
  const selectableWorkspaces =
    selectedWorkspace && selectedIsArchived
      ? [...activeWorkspaces, selectedWorkspace]
      : activeWorkspaces;
  const activeWorkspaceIds = useMemo(
    () => new Set(activeWorkspaces.map((workspace) => workspace.id)),
    [activeWorkspaces],
  );

  useEffect(() => {
    const savedWorkspaceId = window.localStorage.getItem(activeWorkspaceStorageKey);

    if (selectedWorkspaceId && activeWorkspaceIds.has(selectedWorkspaceId)) {
      window.localStorage.setItem(activeWorkspaceStorageKey, selectedWorkspaceId);
      return;
    }

    if (selectedWorkspaceId || (savedWorkspaceId && !activeWorkspaceIds.has(savedWorkspaceId))) {
      window.localStorage.removeItem(activeWorkspaceStorageKey);
      return;
    }

    if (restoreFromLocalStorage && savedWorkspaceId && activeWorkspaceIds.has(savedWorkspaceId)) {
      const url = new URL(window.location.href);
      url.searchParams.set("workspaceId", savedWorkspaceId);
      window.location.replace(url.toString());
    }
  }, [activeWorkspaceIds, restoreFromLocalStorage, selectedWorkspaceId]);

  return (
    <select
      aria-label="Workspace"
      className="select-input"
      defaultValue={selectedWorkspaceId ?? ""}
      id={id}
      name="workspaceId"
      onChange={(event) => {
        if (autoSubmit) {
          event.currentTarget.form?.requestSubmit();
        }
      }}
    >
      {includeAllOption ? <option value="">{allOptionLabel}</option> : null}
      {selectableWorkspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
          {workspace.status === "archived" ? " (archived)" : ""}
        </option>
      ))}
    </select>
  );
}

export function WorkspaceList({ workspaces }: { workspaces: Workspace[] }) {
  if (workspaces.length === 0) {
    return <p className="empty-state">No workspaces have been created yet.</p>;
  }

  return (
    <ul className="entity-list">
      {workspaces.map((workspace) => (
        <li
          className={`entity-item${workspace.status === "archived" ? " entity-item-muted" : ""}`}
          key={workspace.id}
        >
          <Link
            params={{ workspaceId: workspace.id }}
            search={{ includeArchived: false }}
            to="/workspaces/$workspaceId"
          >
            <span className="entity-item-header">
              <span>{workspace.name}</span>
              <WorkspaceStatusPill status={workspace.status} />
            </span>
            <span className="trace-meta">{workspace.description || "No description"}</span>
            <span className="trace-meta">
              Updated {formatTimestamp(workspace.updatedAt)} -{" "}
              <span className="code-value">{workspace.id}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function WorkspaceMetadata({ workspace }: { workspace: Workspace }) {
  return (
    <div className="detail-grid">
      <DataRow label="Workspace ID">
        <span className="code-value">{workspace.id}</span>
      </DataRow>
      <DataRow label="Status">
        <WorkspaceStatusPill status={workspace.status} />
      </DataRow>
      <DataRow label="Created">
        <span>{formatTimestamp(workspace.createdAt)}</span>
      </DataRow>
      <DataRow label="Updated">
        <span>{formatTimestamp(workspace.updatedAt)}</span>
      </DataRow>
      {workspace.archivedAt ? (
        <DataRow label="Archived">
          <span>{formatTimestamp(workspace.archivedAt)}</span>
        </DataRow>
      ) : null}
      <DataRow label="Description">
        <span>{workspace.description || "No description"}</span>
      </DataRow>
    </div>
  );
}
