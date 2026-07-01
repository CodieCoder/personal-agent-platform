import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type {
  ExecutionStatus,
  ExecutionTraceSummary,
  ExecutionTrace,
  ExecutionTraceStep,
  TraceStepStatus,
} from "@pap/contracts";
import type { RecentExecutionSummary, SafeWebError, WebStatusResult } from "./types";

export function StatusPill({ status }: { status: ExecutionStatus | TraceStepStatus | "ready" }) {
  const className =
    status === "completed" || status === "ready"
      ? "pill pill-success"
      : status === "failed"
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
