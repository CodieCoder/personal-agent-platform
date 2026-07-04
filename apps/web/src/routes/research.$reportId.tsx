import { createFileRoute, Link } from "@tanstack/react-router";
import { SafeError } from "../features/executions/components";
import { ResearchReportDetail } from "../features/research/components";
import { getResearchReport } from "../features/research/server";

type ResearchReportSearch = {
  workspaceId?: string | undefined;
};

export const Route = createFileRoute("/research/$reportId")({
  validateSearch: (search: Record<string, unknown>): ResearchReportSearch => ({
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) =>
    getResearchReport({
      data: {
        reportId: params.reportId,
        workspaceId: deps.workspaceId ?? null,
      },
    }),
  component: ResearchReportRoute,
});

function ResearchReportRoute() {
  const result = Route.useLoaderData();

  return (
    <>
      <section className="page-header" aria-labelledby="research-report-title">
        <span className="eyebrow">Research report</span>
        <h1 className="page-title" id="research-report-title">
          Report review
        </h1>
        <p className="page-copy">
          Inspect cited findings, source coverage, diagnostics, and trace.
        </p>
      </section>

      <div className="detail-actions">
        <Link className="text-link" search={{ page: 1, pageSize: 10 }} to="/research">
          Back to research
        </Link>
      </div>

      {!result.ok ? <SafeError error={result.error} /> : null}
      {result.ok && !result.found ? (
        <section className="detail-panel" aria-labelledby="research-not-found-title">
          <div className="section-heading">
            <h2 id="research-not-found-title">Report not found</h2>
            <span>safe</span>
          </div>
          <p className="empty-state">No research report exists for this ID and workspace scope.</p>
        </section>
      ) : null}
      {result.ok && result.found ? (
        <ResearchReportDetail memory={result.memory} report={result.report} />
      ) : null}
    </>
  );
}
