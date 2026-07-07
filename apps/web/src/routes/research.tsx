import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SafeError } from "../features/executions/components";
import { ResearchReportList, ResearchRequestForm } from "../features/research/components";
import { listResearchReports, runResearch } from "../features/research/server";
import type { ResearchRunResult } from "../features/research/types";
import { listWorkspaces } from "../features/workspaces/server";

type ResearchSearch = {
  workspaceId?: string | undefined;
  status?: string | undefined;
  page: number;
  pageSize: number;
};

export const Route = createFileRoute("/research")({
  validateSearch: (search: Record<string, unknown>): ResearchSearch => ({
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    page: typeof search.page === "number" ? search.page : 1,
    pageSize: typeof search.pageSize === "number" ? search.pageSize : 10,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [reports, workspaces] = await Promise.all([
      listResearchReports({
        data: {
          workspaceId: deps.workspaceId ?? null,
          status: deps.status,
          page: deps.page,
          pageSize: deps.pageSize,
        },
      }),
      listWorkspaces({
        data: {
          includeArchived: false,
          limit: 100,
        },
      }),
    ]);

    return { reports, workspaces };
  },
  component: ResearchRoute,
});

function ResearchRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== "/research") {
    return <Outlet />;
  }

  return <ResearchIndexContent />;
}

function ResearchIndexContent() {
  const search = Route.useSearch();
  const { reports, workspaces } = Route.useLoaderData();
  const [runResult, setRunResult] = useState<ResearchRunResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submitResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsPending(true);
    setRunResult(null);

    try {
      const nextResult = await runResearch({ data: new FormData(form) });
      setRunResult(nextResult);

      if (nextResult.ok) {
        const base = `/research/${encodeURIComponent(nextResult.reportId)}`;
        window.location.assign(
          nextResult.workspaceId
            ? `${base}?workspaceId=${encodeURIComponent(nextResult.workspaceId)}`
            : base,
        );
      }
    } catch {
      setRunResult({
        ok: false,
        error: {
          code: "RESEARCH_RUN_REQUEST_FAILED",
          message: "Research request could not be submitted.",
        },
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <section className="page-header" aria-labelledby="research-title">
        <span className="eyebrow">PAP-088</span>
        <h1 className="page-title" id="research-title">
          Research
        </h1>
        <p className="page-copy">Run bounded source-backed research and inspect report evidence.</p>
      </section>

      <div className="workspace-grid">
        <section
          className="section-panel"
          aria-labelledby="research-form-title"
          data-research-ready={isHydrated ? "true" : "false"}
        >
          <div className="section-heading">
            <h2 id="research-form-title">Manual request</h2>
            <span>server-side</span>
          </div>
          {workspaces.ok ? (
            <ResearchRequestForm
              isPending={isPending}
              onSubmit={submitResearch}
              selectedWorkspaceId={search.workspaceId}
              workspaces={workspaces.workspaces}
            />
          ) : (
            <SafeError error={workspaces.error} />
          )}
          <div aria-live="polite">
            {isPending ? (
              <div className="result-box result-success" role="status">
                <h3>Research running</h3>
                <p className="trace-meta">The server is searching, extracting, and validating.</p>
              </div>
            ) : null}
            {runResult && !runResult.ok ? <SafeError error={runResult.error} /> : null}
          </div>
        </section>

        <aside className="section-panel" aria-labelledby="research-recent-title">
          <div className="section-heading">
            <h2 id="research-recent-title">Recent reports</h2>
            <span>{search.workspaceId ? "workspace" : "unscoped"}</span>
          </div>
          <ResearchReportList result={reports} />
        </aside>
      </div>
    </>
  );
}
