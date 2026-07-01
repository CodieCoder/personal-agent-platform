import type { FormEvent } from "react";
import { useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SafeError } from "../features/executions/components";
import { WorkspaceList, WorkspaceSelector } from "../features/workspaces/components";
import { createWorkspace, listWorkspaces } from "../features/workspaces/server";
import type { WorkspaceMutationResult } from "../features/workspaces/types";

type WorkspaceSearch = {
  workspaceId?: string | undefined;
  includeArchived: boolean;
};

export const Route = createFileRoute("/workspaces")({
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => ({
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
    includeArchived: search.includeArchived === "true",
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [visibleWorkspaces, allWorkspaces] = await Promise.all([
      listWorkspaces({
        data: {
          includeArchived: deps.includeArchived,
          limit: 100,
        },
      }),
      listWorkspaces({
        data: {
          includeArchived: true,
          limit: 100,
        },
      }),
    ]);

    return {
      visibleWorkspaces,
      allWorkspaces,
    };
  },
  component: WorkspacesRoute,
});

function WorkspacesRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== "/workspaces") {
    return <Outlet />;
  }

  return <WorkspacesIndexContent />;
}

function WorkspacesIndexContent() {
  const search = Route.useSearch();
  const { visibleWorkspaces, allWorkspaces } = Route.useLoaderData();
  const [createResult, setCreateResult] = useState<WorkspaceMutationResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submitCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsPending(true);
    setCreateResult(null);

    try {
      const nextResult = await createWorkspace({ data: new FormData(form) });
      setCreateResult(nextResult);

      if (nextResult.ok) {
        form.reset();
        window.location.assign(
          `/workspaces/${encodeURIComponent(nextResult.workspace.id)}?includeArchived=false`,
        );
      }
    } catch {
      setCreateResult({
        ok: false,
        error: {
          code: "WORKSPACE_CREATE_REQUEST_FAILED",
          message: "Workspace create request could not be completed.",
        },
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <section className="page-header" aria-labelledby="workspaces-title">
        <span className="eyebrow">PAP-034</span>
        <h1 className="page-title" id="workspaces-title">
          Workspaces
        </h1>
        <p className="page-copy">Create, select, and archive local project containers.</p>
      </section>

      <div className="workspace-grid">
        <section className="section-panel" aria-labelledby="workspace-list-title">
          <div className="section-heading">
            <h2 id="workspace-list-title">Workspace list</h2>
            <span>{search.includeArchived ? "all" : "active"}</span>
          </div>

          {allWorkspaces.ok ? (
            <form action="/workspaces" className="filter-bar" method="get">
              <WorkspaceSelector
                workspaces={allWorkspaces.workspaces}
                selectedWorkspaceId={search.workspaceId}
                restoreFromLocalStorage
              />
              <label className="check-control">
                <input
                  defaultChecked={search.includeArchived}
                  name="includeArchived"
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  type="checkbox"
                  value="true"
                />
                Show archived
              </label>
              {search.workspaceId ? (
                <Link
                  className="text-link"
                  to="/workspaces/$workspaceId"
                  params={{ workspaceId: search.workspaceId }}
                  search={{ includeArchived: false }}
                >
                  Open selected
                </Link>
              ) : null}
            </form>
          ) : (
            <SafeError error={allWorkspaces.error} />
          )}

          {visibleWorkspaces.ok ? (
            <WorkspaceList workspaces={visibleWorkspaces.workspaces} />
          ) : (
            <SafeError error={visibleWorkspaces.error} />
          )}
        </section>

        <aside className="section-panel" aria-labelledby="create-workspace-title">
          <div className="section-heading">
            <h2 id="create-workspace-title">Create workspace</h2>
            <span>local</span>
          </div>
          <form className="stack-form" onSubmit={submitCreateWorkspace}>
            <div className="field-grid">
              <label htmlFor="workspace-name">Name</label>
              <input
                disabled={isPending}
                id="workspace-name"
                maxLength={120}
                name="name"
                placeholder="QA Intel"
                required
              />
            </div>
            <div className="field-grid">
              <label htmlFor="workspace-description">Description</label>
              <textarea
                disabled={isPending}
                id="workspace-description"
                maxLength={2000}
                name="description"
                placeholder="Research, memory, and execution context for a project."
              />
            </div>
            <button className="primary-button" disabled={isPending} type="submit">
              {isPending ? "Creating" : "Create workspace"}
            </button>
          </form>
          <div aria-live="polite">
            {createResult && !createResult.ok ? <SafeError error={createResult.error} /> : null}
          </div>
        </aside>
      </div>
    </>
  );
}
