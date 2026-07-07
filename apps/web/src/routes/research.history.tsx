import {
  researchReportHistorySortSchema,
  researchReportStatusSchema,
  workspaceIdSchema,
} from "@pap/contracts";
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
import { listWorkspaces } from "../features/workspaces/server";

export const Route = createFileRoute("/research/history")({
  validateSearch: (search: Record<string, unknown>): ResearchHistorySearchState => ({
    workspaceId: parseSchemaValue(search.workspaceId, workspaceIdSchema),
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
  loader: async ({ deps }) => {
    const historyInput = compactHistoryInput(deps);
    const [dashboard, history, workspaces] = await Promise.all([
      getResearchReportDashboard({
        data: {
          workspaceId: deps.workspaceId ?? null,
        },
      }),
      listResearchReportHistory({ data: historyInput }),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      dashboard,
      history,
      workspaces,
    };
  },
  pendingComponent: ResearchHistoryPending,
  component: ResearchHistoryRoute,
});

function ResearchHistoryRoute() {
  const search = Route.useSearch();
  const { dashboard, history, workspaces } = Route.useLoaderData();

  return (
    <>
      <section className="page-header" aria-labelledby="research-history-title">
        <span className="eyebrow">PAP-092</span>
        <h1 className="page-title" id="research-history-title">
          Research history
        </h1>
        <p className="page-copy">
          Browse saved reports by workspace, status, question, warnings, and review state.
        </p>
      </section>

      <section className="section-panel" aria-labelledby="research-history-filters-title">
        <div className="section-heading">
          <h2 id="research-history-filters-title">Filters</h2>
          <a className="text-link" href="/research">
            New research
          </a>
        </div>
        {workspaces.ok ? (
          <ResearchHistoryFilterForm
            action="/research/history"
            search={search}
            workspaces={workspaces.workspaces}
          />
        ) : (
          <SafeError error={workspaces.error} />
        )}
      </section>

      <section className="section-panel" aria-labelledby="research-history-summary-title">
        <div className="section-heading">
          <h2 id="research-history-summary-title">Summary</h2>
          <span>{search.workspaceId ? "workspace" : "unscoped"}</span>
        </div>
        <ResearchDashboardSummary result={dashboard} />
      </section>

      <section className="section-panel" aria-labelledby="research-history-results-title">
        <div className="section-heading">
          <h2 id="research-history-results-title">Reports</h2>
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
            basePath="/research/history"
            page={history.page}
            search={search}
          />
        ) : null}
      </section>
    </>
  );
}

function ResearchHistoryPending() {
  return (
    <section className="section-panel" aria-labelledby="research-history-loading-title">
      <div className="section-heading">
        <h2 id="research-history-loading-title">Loading research history</h2>
        <span>pending</span>
      </div>
      <p className="empty-state">Loading saved research reports.</p>
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
