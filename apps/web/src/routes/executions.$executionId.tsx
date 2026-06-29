import { createFileRoute, Link } from "@tanstack/react-router";
import { ExecutionSummary, SafeError, TraceSteps } from "../features/executions/components";
import { getExecutionTrace } from "../features/executions/server";

export const Route = createFileRoute("/executions/$executionId")({
  component: ExecutionDetailRoute,
  loader: async ({ params }) => {
    return getExecutionTrace({ data: { executionId: params.executionId } });
  },
});

function ExecutionDetailRoute() {
  const result = Route.useLoaderData();

  return (
    <>
      <div className="detail-actions">
        <Link className="text-link" to="/">
          Back to echo
        </Link>
      </div>

      {!result.ok ? <SafeError error={result.error} /> : null}
      {result.ok && !result.found ? <NotFoundState /> : null}
      {result.ok && result.found ? (
        <>
          <section className="page-header" aria-labelledby="execution-title">
            <span className="eyebrow">{result.trace.status}</span>
            <h1 className="page-title" id="execution-title">
              Execution detail
            </h1>
            <p className="page-copy">{result.trace.id}</p>
          </section>

          <div className="detail-grid">
            <ExecutionSummary trace={result.trace} />
            <section className="detail-panel" aria-labelledby="trace-steps-title">
              <div className="section-heading">
                <h2 id="trace-steps-title">Trace steps</h2>
                <span>{result.trace.steps.length} recorded</span>
              </div>
              <TraceSteps steps={result.trace.steps} />
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}

function NotFoundState() {
  return (
    <section className="detail-panel" aria-labelledby="not-found-title">
      <div className="section-heading">
        <h2 id="not-found-title">Execution not found</h2>
        <span>empty</span>
      </div>
      <p className="empty-state">No persisted trace exists for this execution ID.</p>
    </section>
  );
}
