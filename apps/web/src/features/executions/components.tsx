import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type {
  ExecutionStatus,
  ExecutionTraceSummary,
  ExecutionTrace,
  ExecutionTraceStep,
  JsonValue,
  ProviderHealthStatus,
  TraceStepStatus,
} from "@pap/contracts";
import type {
  ProviderStatusResult,
  RecentExecutionSummary,
  SafeWebError,
  WebStatusResult,
} from "./types";

type DisplayStatus = ExecutionStatus | TraceStepStatus | ProviderHealthStatus | "ready" | "error";

export function StatusPill({ status }: { status: DisplayStatus }) {
  const className =
    status === "completed" || status === "ready" || status === "healthy"
      ? "pill pill-success"
      : status === "degraded" || status === "unknown"
        ? "pill pill-warning"
        : status === "failed" || status === "unavailable" || status === "error"
          ? "pill pill-error"
          : "pill pill-neutral";

  return <span className={className}>{status}</span>;
}

export function ServerStatus({ status }: { status: WebStatusResult }) {
  if (!status.ok) {
    return (
      <div className="status-grid" role="status">
        <SafeError error={status.error} />
      </div>
    );
  }

  return (
    <div className="status-grid">
      <DataRow label="Runtime">
        <StatusPill status={status.runtime} />
      </DataRow>
      <DataRow label="Environment">
        <span className="code-value">{status.environment}</span>
      </DataRow>
      <DataRow label="Capabilities">
        <span className="code-value">{status.capabilityIds.join(", ")}</span>
      </DataRow>
      <DataRow label="Warnings">
        <span>{status.warningCount}</span>
      </DataRow>
      <DataRow label="Provider">
        <span className="provider-status-inline">
          <StatusPill status={status.provider.status} />
          <span className="code-value">{status.provider.providerId}</span>
        </span>
      </DataRow>
      <DataRow label="Model">
        <span>
          {status.provider.ok && status.provider.model ? status.provider.model : "Not configured"}
        </span>
      </DataRow>
      <DataRow label="Provider readiness">
        <ProviderReadinessText provider={status.provider} />
      </DataRow>
    </div>
  );
}

export function ProviderHealthPanel({ provider }: { provider: ProviderStatusResult }) {
  return (
    <div className="status-grid">
      <DataRow label="Provider">
        <span className="provider-status-inline">
          <StatusPill status={provider.status} />
          <span className="code-value">{provider.providerId}</span>
        </span>
      </DataRow>
      {provider.ok ? (
        <>
          <DataRow label="Kind">
            <span>{provider.kind}</span>
          </DataRow>
          <DataRow label="Configured model">
            <span>{provider.model ?? "Not configured"}</span>
          </DataRow>
          <DataRow label="Last checked">
            <span>{formatTimestamp(provider.checkedAt)}</span>
          </DataRow>
          <DataRow label="Provider message">
            <span>{provider.message ?? "No provider message."}</span>
          </DataRow>
        </>
      ) : (
        <DataRow label="Status detail">
          <span>{provider.error.message}</span>
        </DataRow>
      )}
      <DataRow label="Action">
        <ProviderReadinessText provider={provider} />
      </DataRow>
    </div>
  );
}

export function RecentExecutions({ executions }: { executions: RecentExecutionSummary[] }) {
  if (executions.length === 0) {
    return <p className="empty-state">No executions have been recorded yet.</p>;
  }

  return (
    <ul className="recent-list">
      {executions.map((execution, index) => (
        <li className="recent-item" key={execution.id}>
          <Link
            aria-label={index === 0 ? "Latest execution detail" : undefined}
            to="/executions/$executionId"
            params={{ executionId: execution.id }}
            search={{ page: 1, pageSize: 10 }}
          >
            <span className="recent-item-header">
              <span className="code-value">{execution.id}</span>
              <StatusPill status={execution.status} />
            </span>
            <span className="trace-meta">
              {execution.capabilityId} - {formatTimestamp(execution.startedAt)} -{" "}
              {execution.stepCount} steps
              {execution.workspaceId ? ` - workspace ${execution.workspaceId}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ExecutionHistoryList({ executions }: { executions: ExecutionTraceSummary[] }) {
  if (executions.length === 0) {
    return <p className="empty-state">No executions match these filters.</p>;
  }

  return (
    <ul className="entity-list">
      {executions.map((execution) => (
        <li className="entity-item" key={execution.id}>
          <Link
            aria-label={`Open execution ${execution.id}`}
            to="/executions/$executionId"
            params={{ executionId: execution.id }}
            search={{ page: 1, pageSize: 10 }}
          >
            <span className="entity-item-header">
              <span className="code-value">{execution.id}</span>
              <StatusPill status={execution.status} />
            </span>
            <span className="trace-meta">
              {execution.capabilityId} - {formatTimestamp(execution.startedAt)} -{" "}
              {execution.stepCount} steps
            </span>
            {execution.workspaceId ? (
              <span className="trace-meta">
                workspace <span className="code-value">{execution.workspaceId}</span>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ExecutionSummary({ trace }: { trace: ExecutionTrace }) {
  return (
    <div className="detail-panel">
      <div className="section-heading">
        <h2>Execution summary</h2>
        <StatusPill status={trace.status} />
      </div>
      <div className="detail-grid">
        <DataRow label="Execution ID">
          <span className="code-value">{trace.id}</span>
        </DataRow>
        <DataRow label="Capability">
          <span className="code-value">{trace.capabilityId}</span>
        </DataRow>
        {trace.workspaceId ? (
          <DataRow label="Workspace">
            <span className="code-value">{trace.workspaceId}</span>
          </DataRow>
        ) : null}
        <DataRow label="Started">
          <span>{formatTimestamp(trace.startedAt)}</span>
        </DataRow>
        <DataRow label="Completed">
          <span>{trace.completedAt ? formatTimestamp(trace.completedAt) : "Not completed"}</span>
        </DataRow>
        {trace.errorCode ? (
          <DataRow label="Error">
            <span>
              <span className="code-value">{trace.errorCode}</span>
              {trace.errorMessage ? `: ${trace.errorMessage}` : ""}
            </span>
          </DataRow>
        ) : null}
      </div>
    </div>
  );
}

export function TraceSteps({ steps }: { steps: ExecutionTraceStep[] }) {
  if (steps.length === 0) {
    return <p className="empty-state">This execution did not record trace steps.</p>;
  }

  return (
    <ol className="trace-list">
      {steps.map((step) => (
        <li className="trace-step" key={step.id}>
          <div className="trace-step-head">
            <span className="trace-name">
              {step.sequence}. {step.name}
            </span>
            <StatusPill status={step.status} />
          </div>
          <p className="trace-meta">
            {step.kind} - {formatTimestamp(step.startedAt)}
            {step.completedAt ? ` to ${formatTimestamp(step.completedAt)}` : ""}
          </p>
          {step.summary ? <p className="trace-meta">{step.summary}</p> : null}
          {step.errorCode ? (
            <p className="trace-meta">
              <span className="code-value">{step.errorCode}</span>
              {step.errorMessage ? `: ${step.errorMessage}` : ""}
            </p>
          ) : null}
          {step.metadata ? <TraceMetadata metadata={step.metadata} /> : null}
        </li>
      ))}
    </ol>
  );
}

export function SafeError({ error }: { error: SafeWebError }) {
  return (
    <div className="result-box result-error" role="alert">
      <h3>{error.code}</h3>
      <p className="trace-meta">{error.message}</p>
    </div>
  );
}

export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <span className="meta-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function formatTimestamp(timestamp: string) {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(parsed);
}

function ProviderReadinessText({ provider }: { provider: ProviderStatusResult }) {
  if (!provider.ok) {
    return <span>{provider.error.message}</span>;
  }

  switch (provider.status) {
    case "healthy":
      return <span>Ready for local model tests.</span>;
    case "degraded":
      return <span>Ollama answered, but PAP could not confirm the configured model.</span>;
    case "disabled":
      return <span>Enable Ollama and set OLLAMA_DEFAULT_MODEL on the server.</span>;
    case "unavailable":
      return <span>Start Ollama and confirm the configured model is installed.</span>;
    case "unknown":
      return <span>Provider readiness has not been confirmed yet.</span>;
    default:
      return <span>Provider readiness is not available.</span>;
  }
}

function TraceMetadata({ metadata }: { metadata: Record<string, JsonValue> }) {
  const rows = safeMetadataEntries(metadata);

  if (rows.length === 0) {
    return null;
  }

  return (
    <dl className="trace-metadata" aria-label="Trace metadata">
      {rows.map(([key, value]) => (
        <div className="trace-metadata-row" key={key}>
          <dt>{metadataLabel(key)}</dt>
          <dd>{formatMetadataValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function safeMetadataEntries(metadata: Record<string, JsonValue>): [string, JsonValue][] {
  return metadataAllowlist.flatMap((key) =>
    Object.hasOwn(metadata, key) ? [[key, metadata[key] as JsonValue]] : [],
  );
}

function formatMetadataValue(value: JsonValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }

  if (typeof value === "string") {
    return value;
  }

  return "structured value";
}

function metadataLabel(key: string): string {
  return key.replace(/[A-Z]/gu, (match) => ` ${match.toLowerCase()}`);
}

const metadataAllowlist = [
  "providerId",
  "providerKind",
  "healthStatus",
  "checkedAt",
  "query",
  "resultCount",
  "selectedUrl",
  "selectedResultIndex",
  "selectionSource",
  "finalUrl",
  "statusCode",
  "contentType",
  "extractionMethod",
  "sourceProfileId",
  "warningCount",
  "failureCategory",
  "matched",
  "searchEvidenceId",
  "fetchEvidenceId",
  "extractionEvidenceId",
  "evidenceCount",
  "status",
  "model",
  "durationMs",
  "promptTokenCount",
  "completionTokenCount",
  "totalTokenCount",
  "responseSchemaId",
  "timeoutMs",
  "keepAlive",
  "temperature",
  "maxTokens",
  "errorKind",
  "retryable",
  "modelPresent",
  "modelCount",
  "ollamaVersion",
  "httpStatus",
  "requestedModel",
  "promptTemplateId",
  "promptLength",
  "reportId",
  "queryPlanId",
  "queryCount",
  "candidateCount",
  "deduplicationCount",
  "exclusionCount",
  "requestedSourceCount",
  "extractionBudget",
  "selectedSourceCount",
  "extractedSourceCount",
  "failedSourceCount",
  "rankedSourceCount",
  "analyzedSourceCount",
  "citationCount",
  "findingCount",
  "limitationCount",
  "sourceCount",
  "memoryProposalCount",
  "eligibilityReason",
] as const;
