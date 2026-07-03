import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { workspaceIdSchema } from "@pap/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  formatTimestamp,
  ProviderHealthPanel,
  SafeError,
  ServerStatus,
} from "../features/executions/components";
import type {
  LocalModelTestExecutionResult,
  ProviderStatusResult,
} from "../features/executions/types";
import { executeLocalModelTest, getStatus } from "../features/executions/server";
import { WorkspaceSelector } from "../features/workspaces/components";
import { listWorkspaces } from "../features/workspaces/server";

type ModelTestSearch = {
  workspaceId?: string | undefined;
};

export const Route = createFileRoute("/model-test")({
  validateSearch: (search: Record<string, unknown>): ModelTestSearch => ({
    workspaceId: parseWorkspaceId(search.workspaceId),
  }),
  loaderDeps: ({ search }) => search,
  loader: async () => {
    const [status, workspaces] = await Promise.all([
      getStatus(),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      status,
      workspaces,
    };
  },
  component: ModelTestRoute,
});

function ModelTestRoute() {
  const router = useRouter();
  const search = Route.useSearch();
  const { status, workspaces } = Route.useLoaderData();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<LocalModelTestExecutionResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const provider = status.ok ? status.provider : providerFromStatusError(status.error);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submitModelTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setResult(null);

    try {
      const nextResult = await executeLocalModelTest({ data: new FormData(event.currentTarget) });
      setResult(nextResult);

      if (nextResult.ok || nextResult.executionId) {
        await router.invalidate();
      }
    } catch {
      setResult({
        ok: false,
        error: {
          code: "LOCAL_MODEL_TEST_REQUEST_FAILED",
          message: "Local model test request could not be completed.",
        },
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <section className="page-header" aria-labelledby="model-test-title">
        <span className="eyebrow">PAP-058 to PAP-059</span>
        <h1 className="page-title" id="model-test-title">
          Local model test
        </h1>
        <p className="page-copy">capability.local-model-test / provider.ollama / validated JSON</p>
      </section>

      <div className="workspace-grid">
        <section className="section-panel" aria-labelledby="model-test-form-title">
          <div className="section-heading">
            <h2 id="model-test-form-title">Run model test</h2>
            <span>server function</span>
          </div>
          {workspaces.ok ? (
            <form action="/model-test" className="filter-bar" method="get">
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
            data-model-test-ready={isHydrated ? "true" : "false"}
            onSubmit={submitModelTest}
          >
            {search.workspaceId ? (
              <input name="workspaceId" type="hidden" value={search.workspaceId} />
            ) : null}
            <div className="field-grid">
              <label htmlFor="model-test-prompt">Prompt</label>
              <textarea
                aria-invalid={result?.ok === false ? true : undefined}
                disabled={isPending}
                id="model-test-prompt"
                maxLength={4000}
                name="prompt"
                onChange={(event) => setPrompt(event.currentTarget.value)}
                placeholder="Summarize why local model execution matters for PAP."
                value={prompt}
              />
            </div>
            <button
              aria-busy={isPending}
              className="primary-button"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Running" : "Run local model"}
            </button>
          </form>

          <div aria-live="polite">
            {isPending ? (
              <div className="result-box" role="status">
                <h3>Running</h3>
                <p className="trace-meta">The runtime is executing the local model capability.</p>
              </div>
            ) : null}
            {result?.ok ? <ModelTestSuccess result={result} /> : null}
            {result && !result.ok ? <ModelTestFailure result={result} provider={provider} /> : null}
          </div>
        </section>

        <aside className="section-panel" aria-labelledby="provider-status-title">
          <div className="section-heading">
            <h2 id="provider-status-title">Provider status</h2>
            <span>local</span>
          </div>
          <ProviderHealthPanel provider={provider} />
        </aside>
      </div>

      <section className="section-panel" aria-labelledby="runtime-status-title">
        <div className="section-heading">
          <h2 id="runtime-status-title">Runtime status</h2>
          <Link className="text-link" search={{ page: 1, pageSize: 10 }} to="/executions">
            View executions
          </Link>
        </div>
        <ServerStatus status={status} />
      </section>
    </>
  );
}

function ModelTestSuccess({
  result,
}: {
  result: Extract<LocalModelTestExecutionResult, { ok: true }>;
}) {
  return (
    <div className="result-box result-success" role="status">
      <h3>Completed</h3>
      <div className="model-result-grid">
        <div>
          <span className="meta-label">Summary</span>
          <p>{result.summary}</p>
        </div>
        <div>
          <span className="meta-label">Confidence</span>
          <p className="stat-inline">{Math.round(result.confidence * 100)}%</p>
        </div>
      </div>
      <div className="model-result-grid">
        <div>
          <span className="meta-label">Provider</span>
          <p className="code-value">{result.provider}</p>
        </div>
        <div>
          <span className="meta-label">Model</span>
          <p className="code-value">{result.model}</p>
        </div>
      </div>
      <div className="model-key-points">
        <span className="meta-label">Key points</span>
        <ul>
          {result.keyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className="result-actions">
        <Link
          className="text-link"
          params={{ executionId: result.executionId }}
          search={{ page: 1, pageSize: 10 }}
          to="/executions/$executionId"
        >
          Open execution detail
        </Link>
      </div>
    </div>
  );
}

function ModelTestFailure({
  result,
  provider,
}: {
  result: Extract<LocalModelTestExecutionResult, { ok: false }>;
  provider: ProviderStatusResult;
}) {
  return (
    <div>
      <SafeError error={result.error} />
      <div className="result-box result-error">
        <h3>Action</h3>
        <p className="trace-meta">{providerActionText(provider, result.error.code)}</p>
        {result.executionId ? (
          <div className="result-actions">
            <Link
              className="text-link"
              params={{ executionId: result.executionId }}
              search={{ page: 1, pageSize: 10 }}
              to="/executions/$executionId"
            >
              Open failed execution detail
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function parseWorkspaceId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = workspaceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function providerFromStatusError(error: { code: string; message: string }): ProviderStatusResult {
  return {
    ok: false,
    providerId: "provider.ollama",
    status: "error",
    error,
  };
}

function providerActionText(provider: ProviderStatusResult, errorCode: string): string {
  if (errorCode === "AI_PROVIDER_DISABLED") {
    return "Enable Ollama on the server and set OLLAMA_DEFAULT_MODEL before retrying.";
  }

  if (errorCode === "AI_PROVIDER_UNAVAILABLE") {
    return "Start Ollama and confirm the configured model is installed before retrying.";
  }

  if (errorCode === "AI_PROVIDER_SCHEMA_INVALID") {
    return "Retry with a simpler prompt or inspect the trace for structured-output validation evidence.";
  }

  if (!provider.ok) {
    return provider.error.message;
  }

  if (provider.checkedAt) {
    return `Provider was last checked at ${formatTimestamp(provider.checkedAt)}.`;
  }

  return "Open the execution detail to inspect the safe trace evidence.";
}
