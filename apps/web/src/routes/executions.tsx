import {
  capabilityIdSchema,
  type ExecutionStatus,
  executionStatusSchema,
  workspaceIdSchema,
} from "@pap/contracts";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ExecutionHistoryList, SafeError } from "../features/executions/components";
import { listExecutionHistory } from "../features/executions/server";
import { WorkspaceSelector } from "../features/workspaces/components";
import { listWorkspaces } from "../features/workspaces/server";

const executionStatuses = [
  "running",
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly ExecutionStatus[];

type ExecutionsSearch = {
  workspaceId?: string | undefined;
  capabilityId?: string | undefined;
  status?: ExecutionStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
  pageSize: number;
};

export const Route = createFileRoute("/executions")({
  validateSearch: (search: Record<string, unknown>): ExecutionsSearch => ({
    workspaceId: parseSchemaValue(search.workspaceId, workspaceIdSchema),
    capabilityId: parseSchemaValue(search.capabilityId, capabilityIdSchema),
    status: parseSchemaValue(search.status, executionStatusSchema),
    from: parseDateOnly(search.from),
    to: parseDateOnly(search.to),
    page: parsePositiveInteger(search.page, 1, 10_000),
    pageSize: parsePositiveInteger(search.pageSize, 10, 50),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [history, workspaces] = await Promise.all([
      listExecutionHistory({ data: compactObject(deps) }),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      history,
      workspaces,
    };
  },
  component: ExecutionsRoute,
});

function ExecutionsRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== "/executions") {
    return <Outlet />;
  }

  return <ExecutionsIndexContent />;
}

function ExecutionsIndexContent() {
  const search = Route.useSearch();
  const { history, workspaces } = Route.useLoaderData();

  return (
    <>
      <section className="page-header" aria-labelledby="executions-title">
        <span className="eyebrow">PAP-046</span>
        <h1 className="page-title" id="executions-title">
          Execution history
        </h1>
        <p className="page-copy">Persisted runtime traces across workspaces and capabilities.</p>
      </section>

      <section className="section-panel" aria-labelledby="execution-filters-title">
        <div className="section-heading">
          <h2 id="execution-filters-title">Filters</h2>
          <Link className="text-link" to="/">
            Back to echo
          </Link>
        </div>
        {workspaces.ok ? (
          <ExecutionFilterForm search={search} workspaces={workspaces.workspaces} />
        ) : (
          <SafeError error={workspaces.error} />
        )}
      </section>

      <section className="section-panel" aria-labelledby="execution-history-title">
        <div className="section-heading">
          <h2 id="execution-history-title">History</h2>
          {history.ok ? (
            <span>
              page {history.page.page} / {history.page.total} total
            </span>
          ) : (
            <span>unavailable</span>
          )}
        </div>
        {history.ok ? (
          <>
            <ExecutionHistoryList executions={history.page.executions} />
            <ExecutionPagination search={search} result={history.page} />
          </>
        ) : (
          <SafeError error={history.error} />
        )}
      </section>
    </>
  );
}

function ExecutionFilterForm({
  search,
  workspaces,
}: {
  search: ExecutionsSearch;
  workspaces: Parameters<typeof WorkspaceSelector>[0]["workspaces"];
}) {
  return (
    <form action="/executions" className="filter-bar" method="get">
      <WorkspaceSelector
        selectedWorkspaceId={search.workspaceId}
        restoreFromLocalStorage
        workspaces={workspaces}
      />
      <input
        aria-label="Capability"
        className="compact-input"
        defaultValue={search.capabilityId ?? ""}
        name="capabilityId"
        placeholder="capability.echo"
      />
      <select
        aria-label="Status"
        className="select-input"
        defaultValue={search.status ?? ""}
        name="status"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Any status</option>
        {executionStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <input
        aria-label="From date"
        className="compact-input"
        defaultValue={search.from ?? ""}
        name="from"
        type="date"
      />
      <input
        aria-label="To date"
        className="compact-input"
        defaultValue={search.to ?? ""}
        name="to"
        type="date"
      />
      <select
        aria-label="Page size"
        className="select-input"
        defaultValue={String(search.pageSize)}
        name="pageSize"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {[5, 10, 20, 50].map((pageSize) => (
          <option key={pageSize} value={pageSize}>
            {pageSize} rows
          </option>
        ))}
      </select>
      <button className="secondary-button" type="submit">
        Apply filters
      </button>
      <a className="text-link" href="/executions">
        Clear filters
      </a>
    </form>
  );
}

function ExecutionPagination({
  search,
  result,
}: {
  search: ExecutionsSearch;
  result: {
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}) {
  if (!result.hasPreviousPage && !result.hasNextPage) {
    return null;
  }

  return (
    <nav aria-label="Execution history pagination" className="pagination-bar">
      {result.hasPreviousPage ? (
        <a
          className="secondary-button"
          href={buildExecutionsHref({ ...search, page: result.page - 1 })}
        >
          Previous
        </a>
      ) : (
        <span className="secondary-button pagination-disabled">Previous</span>
      )}
      <span className="trace-meta">Page {result.page}</span>
      {result.hasNextPage ? (
        <a
          className="secondary-button"
          href={buildExecutionsHref({ ...search, page: result.page + 1 })}
        >
          Next
        </a>
      ) : (
        <span className="secondary-button pagination-disabled">Next</span>
      )}
    </nav>
  );
}

function buildExecutionsHref(search: ExecutionsSearch): string {
  const params = new URLSearchParams();

  setSearchParam(params, "workspaceId", search.workspaceId);
  setSearchParam(params, "capabilityId", search.capabilityId);
  setSearchParam(params, "status", search.status);
  setSearchParam(params, "from", search.from);
  setSearchParam(params, "to", search.to);
  params.set("page", String(search.page));
  params.set("pageSize", String(search.pageSize));

  return `/executions?${params.toString()}`;
}

function setSearchParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) {
    params.set(key, value);
  }
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

function compactObject(input: ExecutionsSearch): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      output[key] = value;
    }
  }

  return output;
}
