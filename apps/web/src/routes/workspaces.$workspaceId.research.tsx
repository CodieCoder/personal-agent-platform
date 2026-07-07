import { researchReportHistorySortSchema, researchReportStatusSchema } from "@pap/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { SafeError } from "../features/executions/components";
import {
  ResearchDashboardSummary,
  ResearchHistoryFilterForm,
  ResearchHistoryPagination,
  ResearchReportHistoryList,
  type ResearchHistorySearchState,
} from "../features/research/components";
import { getResearchReportDashboard, listResearchReportHistory } from "../features/research/server";
import { getWorkspace } from "../features/workspaces/server";

type WorkspaceResearchSearch = Omit<ResearchHistorySearchState, "workspaceId">;

export const Route = createFileRoute("/workspaces/$workspaceId/research")({
  validateSearch: (search: Record<string, unknown>): WorkspaceResearchSearch => ({
    status: parseSchemaValue(search.status, researchReportStatusSchema),
    dateFrom: parseDateOnly(search.dateFrom),
    dateTo: parseDateOnly(search.dateTo),
    question: parseQuestion(search.question),
    hasWarnings: parseBooleanFilter(search.hasWarnings),
    hasPendingMemoryProposal: parseBooleanFilter(search.hasPendingMemoryProposal),
    sort:
      parseSchemaValue(search.sort, researchReportHistorySortSchema) ??
      "newest_completed_or_updated_first",
    page: parsePositiveInteger(search.page, 1, 10_000),
    pageSize: parsePositiveInteger(search.pageSize, 10, 50),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const search = {
      ...deps,
      workspaceId: params.workspaceId,
    };
    const [workspace, dashboard, history] = await Promise.all([
      getWorkspace({ data: { id: params.workspaceId } }),
      getResearchReportDashboard({ data: { workspaceId: params.workspaceId } }),
      listResearchReportHistory({ data: compactHistoryInput(search) }),
    ]);

    return {
      dashboard,
      history,
      workspace,
    };
  },
  pendingComponent: WorkspaceResearchPending,
  component: WorkspaceResearchRoute,
});

function WorkspaceResearchRoute() {
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const { dashboard, history, workspace } = Route.useLoaderData();
  const historySearch = {
    ...search,
    workspaceId: undefined,
  };

  if (!workspace.ok) {
    return <SafeError error={workspace.error} />;
  }

  if (!workspace.found) {
    return <WorkspaceResearchNotFoundState />;
  }

  const basePath = `/workspaces/${encodeURIComponent(workspaceId)}/research`;

  return (
    <>
      <div className="detail-actions">
        <a className="text-link" href={`/workspaces/${encodeURIComponent(workspaceId)}`}>
          Back to workspace
        </a>
        <a className="text-link" href="/research/history">
          All research history
        </a>
      </div>

      <section className="page-header" aria-labelledby="workspace-research-title">
        <span className="eyebrow">Workspace research</span>
        <h1 className="page-title" id="workspace-research-title">
          {workspace.workspace.name}
        </h1>
        <p className="page-copy">Saved research reports for this workspace.</p>
      </section>

      <section className="section-panel" aria-labelledby="workspace-research-summary-title">
        <div className="section-heading">
          <h2 id="workspace-research-summary-title">Dashboard</h2>
          <span>{workspace.workspace.status}</span>
        </div>
        <ResearchDashboardSummary result={dashboard} />
      </section>

      <section className="section-panel" aria-labelledby="workspace-research-filters-title">
        <div className="section-heading">
          <h2 id="workspace-research-filters-title">Filters</h2>
          <a className="text-link" href="/research">
            New research
          </a>
        </div>
        <ResearchHistoryFilterForm
          action={basePath}
          scopedWorkspaceId={workspaceId}
          search={historySearch}
        />
      </section>

      <section className="section-panel" aria-labelledby="workspace-research-results-title">
        <div className="section-heading">
          <h2 id="workspace-research-results-title">Reports</h2>
          {history.ok ? (
            <span>
              page {history.page.page} / {history.page.total} total
            </span>
          ) : (
            <span>unavailable</span>
          )}
        </div>
        <ResearchReportHistoryList result={history} />
        {history.ok ? (
          <ResearchHistoryPagination
            basePath={basePath}
            page={history.page}
            search={historySearch}
          />
        ) : null}
      </section>
    </>
  );
}

function WorkspaceResearchPending() {
  return (
    <section className="section-panel" aria-labelledby="workspace-research-loading-title">
      <div className="section-heading">
        <h2 id="workspace-research-loading-title">Loading workspace research</h2>
        <span>pending</span>
      </div>
      <p className="empty-state">Loading workspace research reports.</p>
    </section>
  );
}

function WorkspaceResearchNotFoundState() {
  return (
    <section className="detail-panel" aria-labelledby="workspace-research-not-found-title">
      <div className="section-heading">
        <h2 id="workspace-research-not-found-title">Workspace not found</h2>
        <span>empty</span>
      </div>
      <p className="empty-state">No workspace exists for this research dashboard.</p>
    </section>
  );
}

function parseSchemaValue<TValue>(
  value: unknown,
  schema: { safeParse: (value: unknown) => { success: true; data: TValue } | { success: false } },
): TValue | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = schema.safeParse(value.trim());
  return parsed.success ? parsed.data : undefined;
}

function parseDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return value;
}

function parseQuestion(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const question = value.trim();
  return question.length > 0 && question.length <= 500 ? question : undefined;
}

function parseBooleanFilter(value: unknown): boolean | undefined {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return undefined;
}

function parsePositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function compactHistoryInput(search: ResearchHistorySearchState): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  setInputValue(output, "workspaceId", search.workspaceId);
  setInputValue(output, "status", search.status);
  setInputValue(output, "dateFrom", search.dateFrom);
  setInputValue(output, "dateTo", search.dateTo);
  setInputValue(output, "question", search.question);
  setInputValue(output, "hasWarnings", search.hasWarnings);
  setInputValue(output, "hasPendingMemoryProposal", search.hasPendingMemoryProposal);
  setInputValue(output, "sort", search.sort);
  output.page = search.page;
  output.pageSize = search.pageSize;

  return output;
}

function setInputValue(output: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== "") {
    output[key] = value;
  }
}
