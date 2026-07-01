import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SafeError } from "../features/executions/components";
import { WorkspaceMetadata } from "../features/workspaces/components";
import { archiveWorkspace, getWorkspace } from "../features/workspaces/server";
import type { WorkspaceRecordResult } from "../features/workspaces/types";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  loader: async ({ params }) => {
    return getWorkspace({ data: { id: params.workspaceId } });
  },
  component: WorkspaceDetailRoute,
});

function WorkspaceDetailRoute() {
  const result = Route.useLoaderData();
  const [archiveResult, setArchiveResult] = useState<WorkspaceRecordResult | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  async function submitArchive(workspaceId: string) {
    const confirmed = window.confirm("Archive this workspace?");

    if (!confirmed) {
      return;
    }

    setIsArchiving(true);
    setArchiveResult(null);

    try {
      const nextResult = await archiveWorkspace({ data: { id: workspaceId } });
      setArchiveResult(nextResult);

      if (nextResult.ok && nextResult.found) {
        window.localStorage.removeItem("pap.activeWorkspaceId");
        window.location.assign(
          `/workspaces/${encodeURIComponent(nextResult.workspace.id)}?includeArchived=true`,
        );
      }
    } catch {
      setArchiveResult({
        ok: false,
        error: {
          code: "WORKSPACE_ARCHIVE_REQUEST_FAILED",
          message: "Workspace archive request could not be completed.",
        },
      });
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <>
      <div className="detail-actions">
        <Link className="text-link" search={{ includeArchived: false }} to="/workspaces">
          Back to workspaces
        </Link>
      </div>

      {!result.ok ? <SafeError error={result.error} /> : null}
      {result.ok && !result.found ? <WorkspaceNotFoundState /> : null}
      {result.ok && result.found ? (
        <>
          <section className="page-header" aria-labelledby="workspace-title">
            <span className="eyebrow">{result.workspace.status}</span>
            <h1 className="page-title" id="workspace-title">
              {result.workspace.name}
            </h1>
            <p className="page-copy">{result.workspace.description || result.workspace.id}</p>
          </section>

          <div className="workspace-grid">
            <section className="detail-panel" aria-labelledby="workspace-metadata-title">
              <div className="section-heading">
                <h2 id="workspace-metadata-title">Metadata</h2>
                <span>workspace</span>
              </div>
              <WorkspaceMetadata workspace={result.workspace} />
              <div className="result-actions">
                <a
                  className="text-link"
                  href={`/memory/semantic?scope=workspace&workspaceId=${encodeURIComponent(
                    result.workspace.id,
                  )}`}
                >
                  Semantic memory
                </a>
                <a
                  className="text-link"
                  href={`/memory/episodes?scope=workspace&workspaceId=${encodeURIComponent(
                    result.workspace.id,
                  )}`}
                >
                  Episodic memory
                </a>
              </div>
            </section>

            <aside className="section-panel" aria-labelledby="workspace-actions-title">
              <div className="section-heading">
                <h2 id="workspace-actions-title">Actions</h2>
                <span>bounded</span>
              </div>
              {result.workspace.status === "active" ? (
                <button
                  className="secondary-button"
                  disabled={isArchiving}
                  onClick={() => void submitArchive(result.workspace.id)}
                  type="button"
                >
                  {isArchiving ? "Archiving" : "Archive workspace"}
                </button>
              ) : (
                <p className="empty-state">Archived workspaces remain inspectable.</p>
              )}
              <div aria-live="polite">
                {archiveResult && !archiveResult.ok ? (
                  <SafeError error={archiveResult.error} />
                ) : null}
                {archiveResult?.ok && !archiveResult.found ? <WorkspaceNotFoundState /> : null}
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}

function WorkspaceNotFoundState() {
  return (
    <section className="detail-panel" aria-labelledby="workspace-not-found-title">
      <div className="section-heading">
        <h2 id="workspace-not-found-title">Workspace not found</h2>
        <span>empty</span>
      </div>
      <p className="empty-state">No workspace exists for this ID.</p>
    </section>
  );
}
