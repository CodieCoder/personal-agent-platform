import type { FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import type {
  ResearchCitation,
  ResearchFinding,
  ResearchReport,
  ResearchReportStatus,
  ResearchSelectedSource,
  ResearchWarning,
  Workspace,
} from "@pap/contracts";
import { DataRow, formatTimestamp, SafeError } from "../executions/components";
import { WorkspaceSelector } from "../workspaces/components";
import type { ResearchMemoryStatusSummary, ResearchReportListResult } from "./types";

export function ResearchStatusPill({ status }: { status: ResearchReportStatus }) {
  const className =
    status === "completed"
      ? "pill pill-success"
      : status === "completed_with_warnings"
        ? "pill pill-warning"
        : status === "failed" || status === "cancelled"
          ? "pill pill-error"
          : "pill pill-neutral";

  return <span className={className}>{status}</span>;
}

export function ResearchRequestForm({
  isPending,
  onSubmit,
  workspaces,
  selectedWorkspaceId,
}: {
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  workspaces: Workspace[];
  selectedWorkspaceId?: string | undefined;
}) {
  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <div className="field-grid">
        <label htmlFor="research-question">Question</label>
        <textarea
          disabled={isPending}
          id="research-question"
          maxLength={2_000}
          name="question"
          placeholder="Research local AI engineering opportunities"
          required
        />
      </div>

      <div className="compact-fields field-grid">
        <div className="field-grid">
          <label htmlFor="research-workspace">Workspace</label>
          <WorkspaceSelector
            allOptionLabel="No workspace"
            autoSubmit={false}
            id="research-workspace"
            selectedWorkspaceId={selectedWorkspaceId}
            workspaces={workspaces}
          />
        </div>
        <div className="field-grid">
          <label htmlFor="research-time-range">Time range</label>
          <select
            className="select-input"
            defaultValue="week"
            disabled={isPending}
            id="research-time-range"
            name="timeRange"
          >
            <option value="">Any time</option>
            <option value="day">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <div className="field-grid">
        <label htmlFor="research-focus">Focus</label>
        <input
          disabled={isPending}
          id="research-focus"
          maxLength={1_000}
          name="focus"
          placeholder="local-first agent platforms, QA Intel, product opportunities"
        />
      </div>

      <div className="compact-fields field-grid">
        <div className="field-grid">
          <label htmlFor="research-max-sources">Source limit</label>
          <input
            className="compact-input"
            defaultValue="3"
            disabled={isPending}
            id="research-max-sources"
            max="15"
            min="1"
            name="maxSources"
            type="number"
          />
        </div>
        <div className="field-grid">
          <label htmlFor="research-max-results">Search results</label>
          <input
            className="compact-input"
            defaultValue="12"
            disabled={isPending}
            id="research-max-results"
            max="50"
            min="1"
            name="maxSearchResults"
            type="number"
          />
        </div>
      </div>

      <div className="compact-fields field-grid">
        <div className="field-grid">
          <label htmlFor="research-language">Language</label>
          <input
            className="compact-input"
            defaultValue="en"
            disabled={isPending}
            id="research-language"
            maxLength={32}
            name="language"
          />
        </div>
        <div className="field-grid">
          <label htmlFor="research-categories">Categories</label>
          <input
            className="compact-input"
            defaultValue="general"
            disabled={isPending}
            id="research-categories"
            maxLength={240}
            name="categories"
            placeholder="technology,business"
          />
        </div>
      </div>

      <label className="check-control">
        <input disabled={isPending} name="memoryProposalMode" type="checkbox" value="propose" />
        Propose citation-backed memory
      </label>

      <button aria-busy={isPending} className="primary-button" disabled={isPending} type="submit">
        {isPending ? "Researching" : "Run research"}
      </button>
    </form>
  );
}

export function ResearchReportList({ result }: { result: ResearchReportListResult }) {
  if (!result.ok) {
    return <SafeError error={result.error} />;
  }

  if (result.page.reports.length === 0) {
    return <p className="empty-state">No research reports match this scope.</p>;
  }

  return (
    <ul className="entity-list">
      {result.page.reports.map((report) => (
        <li className="entity-item" key={report.id}>
          <a href={researchReportHref(report)}>
            <span className="entity-item-header">
              <span>{report.question}</span>
              <ResearchStatusPill status={report.status} />
            </span>
            <span className="trace-meta">
              {report.findings.length} findings - {report.sources.length} sources -{" "}
              {formatTimestamp(report.createdAt)}
            </span>
            {report.workspaceId ? (
              <span className="trace-meta">
                workspace <span className="code-value">{report.workspaceId}</span>
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ResearchReportDetail({
  memory,
  report,
}: {
  memory: ResearchMemoryStatusSummary;
  report: ResearchReport;
}) {
  return (
    <div className="detail-grid" data-research-report-detail="true">
      <section className="detail-panel" aria-labelledby="research-summary-title">
        <div className="section-heading">
          <h2 id="research-summary-title">Summary</h2>
          <ResearchStatusPill status={report.status} />
        </div>
        <p>{report.summary.text}</p>
        <div className="detail-grid">
          <DataRow label="Report ID">
            <span className="code-value">{report.id}</span>
          </DataRow>
          <DataRow label="Trace">
            <Link
              className="text-link"
              params={{ executionId: report.executionId }}
              search={{ page: 1, pageSize: 10 }}
              to="/executions/$executionId"
            >
              Open execution trace
            </Link>
          </DataRow>
          <DataRow label="Workspace">
            <span>{report.workspaceId ?? "No workspace"}</span>
          </DataRow>
          <DataRow label="Completed">
            <span>{report.completedAt ? formatTimestamp(report.completedAt) : "Not complete"}</span>
          </DataRow>
          <DataRow label="Coverage">
            <span>
              {report.findings.length} findings, {report.citations.length} citations,{" "}
              {report.sources.length} sources, {report.warnings.length} warnings
            </span>
          </DataRow>
        </div>
      </section>

      <MemoryProposalPanel memory={memory} />
      <FindingsPanel citations={report.citations} findings={report.findings} />
      <SourcesPanel
        citations={report.citations}
        sources={report.sources}
        warnings={report.warnings}
      />
      <WarningsPanel warnings={report.warnings} />
      <LimitationsPanel limitations={report.limitations} />
      <CitationsPanel citations={report.citations} />
    </div>
  );
}

function FindingsPanel({
  citations,
  findings,
}: {
  citations: ResearchCitation[];
  findings: ResearchFinding[];
}) {
  if (findings.length === 0) {
    return (
      <section className="detail-panel" aria-labelledby="research-findings-title">
        <div className="section-heading">
          <h2 id="research-findings-title">Findings</h2>
          <span>none</span>
        </div>
        <p className="empty-state">No source-backed findings were produced.</p>
      </section>
    );
  }

  return (
    <section className="detail-panel" aria-labelledby="research-findings-title">
      <div className="section-heading">
        <h2 id="research-findings-title">Cited findings</h2>
        <span>{findings.length}</span>
      </div>
      <ul className="entity-list">
        {findings.map((finding) => (
          <li className="entity-item" key={finding.id}>
            <span className="entity-item-header">
              <span>{finding.title}</span>
              <span className="pill pill-neutral">{Math.round(finding.confidence * 100)}%</span>
            </span>
            <p className="trace-meta">{finding.claimText}</p>
            <span className="pill-row">
              {finding.citationIds.map((citationId) => {
                const citationIndex = citations.findIndex(
                  (citation) => citation.citationId === citationId,
                );
                return (
                  <a className="citation-chip" href={`#citation-${citationId}`} key={citationId}>
                    C{citationIndex + 1}
                  </a>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SourcesPanel({
  citations,
  sources,
  warnings,
}: {
  citations: ResearchCitation[];
  sources: ResearchSelectedSource[];
  warnings: ResearchWarning[];
}) {
  return (
    <section className="detail-panel" aria-labelledby="research-sources-title">
      <div className="section-heading">
        <h2 id="research-sources-title">Sources</h2>
        <span>{sources.length}</span>
      </div>
      {sources.length === 0 ? (
        <p className="empty-state">No sources were persisted for this report.</p>
      ) : (
        <ul className="entity-list">
          {sources.map((source) => (
            <li className="entity-item" key={source.id}>
              <span className="entity-item-header">
                <span>{source.title ?? source.url}</span>
                <span className="pill pill-neutral">{source.status}</span>
              </span>
              <span className="trace-meta source-url">{source.finalUrl ?? source.url}</span>
              <span className="trace-meta">
                rank {source.selectionRank ?? "n/a"} - relevance{" "}
                {source.relevanceScore === null ? "n/a" : Math.round(source.relevanceScore * 100)}%
                - citations {citations.filter((citation) => citation.sourceId === source.id).length}
              </span>
              {source.evidenceId ? (
                <span className="trace-meta">
                  evidence <span className="code-value">{source.evidenceId}</span>
                </span>
              ) : null}
              {source.analysis?.summary ? (
                <p className="trace-meta">{source.analysis.summary}</p>
              ) : null}
              {sourceWarnings(warnings, source.id).map((sourceWarning) => (
                <p className="trace-meta" key={`${source.id}-${sourceWarning.code}`}>
                  {sourceWarning.message}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WarningsPanel({ warnings }: { warnings: ResearchWarning[] }) {
  return (
    <section className="detail-panel" aria-labelledby="research-warnings-title">
      <div className="section-heading">
        <h2 id="research-warnings-title">Warnings</h2>
        <span>{warnings.length}</span>
      </div>
      {warnings.length === 0 ? (
        <p className="empty-state">No warnings were recorded.</p>
      ) : (
        <ul className="entity-list">
          {warnings.map((warning) => (
            <li className="entity-item" key={researchWarningKey(warning)}>
              <span className="entity-item-header">
                <span className="code-value">{warning.code}</span>
                <span className="pill pill-warning">warning</span>
              </span>
              <span className="trace-meta">{warning.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LimitationsPanel({ limitations }: { limitations: ResearchReport["limitations"] }) {
  return (
    <section className="detail-panel" aria-labelledby="research-limitations-title">
      <div className="section-heading">
        <h2 id="research-limitations-title">Limitations</h2>
        <span>{limitations.length}</span>
      </div>
      {limitations.length === 0 ? (
        <p className="empty-state">No limitations were recorded.</p>
      ) : (
        <ul className="entity-list">
          {limitations.map((limitation) => (
            <li className="entity-item" key={researchLimitationKey(limitation)}>
              <span className="code-value">{limitation.code}</span>
              <span className="trace-meta">{limitation.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CitationsPanel({ citations }: { citations: ResearchCitation[] }) {
  return (
    <section className="detail-panel" aria-labelledby="research-citations-title">
      <div className="section-heading">
        <h2 id="research-citations-title">Citations</h2>
        <span>{citations.length}</span>
      </div>
      {citations.length === 0 ? (
        <p className="empty-state">No citations are available for this report.</p>
      ) : (
        <ol className="entity-list">
          {citations.map((citation, index) => (
            <li
              className="entity-item"
              id={`citation-${citation.citationId}`}
              key={citation.citationId}
            >
              <span className="entity-item-header">
                <span>C{index + 1}</span>
                <span className="code-value">{citation.sourceId}</span>
              </span>
              <span className="trace-meta">{citation.sourceTitle}</span>
              <span className="trace-meta source-url">{citation.sourceUrl}</span>
              <p className="trace-meta">{citation.claimText}</p>
              {citation.sourceExcerpt ? (
                <p className="trace-meta">Excerpt: {citation.sourceExcerpt}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MemoryProposalPanel({ memory }: { memory: ResearchMemoryStatusSummary }) {
  return (
    <section className="detail-panel" aria-labelledby="research-memory-title">
      <div className="section-heading">
        <h2 id="research-memory-title">Memory proposal</h2>
        <span>{memory.status}</span>
      </div>
      <p className="trace-meta">
        {memory.proposed} pending, {memory.active} active, {memory.rejected} rejected.
      </p>
      {memory.records.length > 0 ? (
        <div className="pill-row">
          {memory.records.map((record) => (
            <Link
              className="text-link"
              key={record.id}
              params={{ memoryId: record.id }}
              to="/memory/$memoryId"
            >
              {record.status}
            </Link>
          ))}
        </div>
      ) : (
        <p className="empty-state">No semantic memory was proposed for this report.</p>
      )}
    </section>
  );
}

function sourceWarnings(warnings: ResearchWarning[], sourceId: string): ResearchWarning[] {
  return warnings.filter((warning) => warning.sourceId === sourceId);
}

function researchWarningKey(warning: ResearchWarning): string {
  return [
    warning.code,
    warning.sourceId ?? "report",
    warning.evidenceId ?? "no-evidence",
    warning.message,
  ].join(":");
}

function researchLimitationKey(limitation: ResearchReport["limitations"][number]): string {
  return [
    limitation.code,
    limitation.sourceId ?? "report",
    limitation.evidenceId ?? "no-evidence",
    limitation.message,
  ].join(":");
}

function researchReportHref(report: ResearchReport): string {
  const base = `/research/${encodeURIComponent(report.id)}`;
  return report.workspaceId
    ? `${base}?workspaceId=${encodeURIComponent(report.workspaceId)}`
    : base;
}
