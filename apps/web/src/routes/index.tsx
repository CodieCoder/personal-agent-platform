import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { workspaceIdSchema } from "@pap/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  RecentExecutions,
  SafeError,
  ServerStatus,
  formatTimestamp,
} from "../features/executions/components";
import type { EchoExecutionResult } from "../features/executions/types";
import { executeEcho, getStatus, listRecentExecutions } from "../features/executions/server";
import { WorkspaceSelector } from "../features/workspaces/components";
import { listWorkspaces } from "../features/workspaces/server";

type HomeSearch = {
  workspaceId?: string | undefined;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    workspaceId: parseWorkspaceId(search.workspaceId),
  }),
  loaderDeps: ({ search }) => search,
  loader: async () => {
    const [status, recent, workspaces] = await Promise.all([
      getStatus(),
      listRecentExecutions(),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      status,
      recent,
      workspaces,
    };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const router = useRouter();
  const search = Route.useSearch();
  const { status, recent, workspaces } = Route.useLoaderData();
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<EchoExecutionResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submitEcho(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setResult(null);

    try {
      const nextResult = await executeEcho({ data: new FormData(event.currentTarget) });
      setResult(nextResult);

      if (nextResult.ok) {
        await router.invalidate();
      }
    } catch {
      setResult({
        ok: false,
        error: {
          code: "ECHO_REQUEST_FAILED",
          message: "Echo request could not be completed.",
        },
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <section className="page-header" aria-labelledby="home-title">
        <span className="eyebrow">PAP-018 to PAP-021</span>
        <h1 className="page-title" id="home-title">
          Echo runtime
        </h1>
        <p className="page-copy">capability.echo / runtime / SQLite trace</p>
      </section>

      <div className="workspace-grid">
        <section className="section-panel" aria-labelledby="echo-form-title">
          <div className="section-heading">
            <h2 id="echo-form-title">Run echo</h2>
            <span>server function</span>
          </div>
          {workspaces.ok ? (
            <form action="/" className="filter-bar" method="get">
              <WorkspaceSelector
                selectedWorkspaceId={search.workspaceId}
                restoreFromLocalStorage
                workspaces={workspaces.workspaces}
              />
              <button className="secondary-button" type="submit">
                Use workspace
              </button>
            </form>
          ) : (
            <SafeError error={workspaces.error} />
          )}
          <form
            className="echo-form"
            data-runtime-ready={isHydrated ? "true" : "false"}
            onSubmit={submitEcho}
          >
            {search.workspaceId ? (
              <input name="workspaceId" type="hidden" value={search.workspaceId} />
            ) : null}
            <div className="field-grid">
              <label htmlFor="echo-message">Message</label>
              <textarea
                aria-invalid={result?.ok === false ? true : undefined}
                disabled={isPending}
                id="echo-message"
                name="message"
                onChange={(event) => setMessage(event.currentTarget.value)}
                placeholder="Hello Personal Agent"
                value={message}
              />
            </div>
            <button
              className="primary-button"
              disabled={isPending}
              type="submit"
              aria-busy={isPending}
            >
              {isPending ? "Running" : "Run echo"}
            </button>
          </form>

          <div aria-live="polite">
            {isPending ? (
              <div className="result-box" role="status">
                <h3>Running</h3>
                <p className="trace-meta">Execution is in progress.</p>
              </div>
            ) : null}
            {result?.ok ? <EchoSuccess result={result} /> : null}
            {result && !result.ok ? <SafeError error={result.error} /> : null}
          </div>
        </section>

        <aside className="section-panel" aria-labelledby="status-title">
          <div className="section-heading">
            <h2 id="status-title">Status</h2>
            <span>local</span>
          </div>
          <ServerStatus status={status} />
        </aside>
      </div>

      <section className="section-panel" aria-labelledby="recent-title">
        <div className="section-heading">
          <h2 id="recent-title">Recent executions</h2>
          <Link className="text-link" search={{ page: 1, pageSize: 10 }} to="/executions">
            View history
          </Link>
        </div>
        {recent.ok ? (
          <RecentExecutions executions={recent.executions} />
        ) : (
          <SafeError error={recent.error} />
        )}
      </section>
    </>
  );
}

function parseWorkspaceId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = workspaceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function EchoSuccess({ result }: { result: Extract<EchoExecutionResult, { ok: true }> }) {
  return (
    <div className="result-box result-success" role="status">
      <h3>Completed</h3>
      <p className="trace-meta">{result.message}</p>
      <p className="trace-meta">Echoed at {formatTimestamp(result.echoedAt)}</p>
      <div className="result-actions">
        <Link
          className="text-link"
          to="/executions/$executionId"
          params={{ executionId: result.executionId }}
          search={{ page: 1, pageSize: 10 }}
        >
          Open execution detail
        </Link>
      </div>
    </div>
  );
}
