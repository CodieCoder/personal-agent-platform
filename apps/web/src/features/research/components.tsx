import { type FormEvent, useCallback, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import type {
  ResearchCitation,
  ResearchFinding,
  ResearchReport,
  ResearchReportFeedback,
  ResearchReportHistoryItem,
  ResearchReportHistoryPage,
  ResearchReportHistorySort,
  ResearchReportStatus,
  ResearchSelectedSource,
  ResearchSourceFeedback,
  ResearchSourceFeedbackRating,
  ResearchWarning,
  Workspace,
} from "@pap/contracts";
import { DataRow, formatTimestamp, SafeError } from "../executions/components";
import { WorkspaceSelector } from "../workspaces/components";
import type {
  ResearchMemoryStatusSummary,
  ResearchReportDashboardResult,
  ResearchReportHistoryResult,
  ResearchReportListResult,
} from "./types";
import {
  createSourceFeedback,
  deleteSourceFeedback,
  updateSourceFeedback,
  upsertReportFeedback,
} from "./server";

const researchReportStatuses = [
  "pending",
  "running",
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
] as const satisfies readonly ResearchReportStatus[];

export type ResearchHistorySearchState = {
  workspaceId?: string | undefined;
  status?: ResearchReportStatus | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  question?: string | undefined;
  hasWarnings?: boolean | undefined;
  hasPendingMemoryProposal?: boolean | undefined;
  sort: ResearchReportHistorySort;
  page: number;
  pageSize: number;
};

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

export function ResearchDashboardSummary({ result }: { result: ResearchReportDashboardResult }) {
  if (!result.ok) {
    return <SafeError error={result.error} />;
  }

  const { summary } = result;

  return (
    <div className="dashboard-grid">
      <article className="stat-card">
        <span className="meta-label">Reports</span>
        <p className="stat-value">{summary.totalReportCount}</p>
        <p className="trace-meta">
          {summary.workspaceId ? `Workspace ${summary.workspaceId}` : "Unscoped research"}
        </p>
      </article>
      <article className="stat-card">
        <span className="meta-label">Completed</span>
        <p className="stat-value">
          {summary.statusCounts.completed + summary.statusCounts.completed_with_warnings}
        </p>
        <p className="trace-meta">
          {summary.statusCounts.failed} failed, {summary.statusCounts.running} running
        </p>
      </article>
      <article className="stat-card">
        <span className="meta-label">Review signals</span>
        <p className="stat-value">{summary.warningReportCount}</p>
        <p className="trace-meta">
          {summary.pendingMemoryProposalReportCount} with pending memory proposals
        </p>
      </article>
      <article className="stat-card stat-card-wide">
        <span className="meta-label">Latest report</span>
        <p className="stat-inline">
          {summary.latestReportAt ? formatTimestamp(summary.latestReportAt) : "No reports"}
        </p>
      </article>
    </div>
  );
}

export function ResearchHistoryFilterForm({
  action,
  search,
  workspaces,
  scopedWorkspaceId,
}: {
  action: string;
  search: ResearchHistorySearchState;
  workspaces?: Workspace[] | undefined;
  scopedWorkspaceId?: string | undefined;
}) {
  return (
    <form action={action} className="filter-bar research-history-filters" method="get">
      {workspaces ? (
        <WorkspaceSelector
          allOptionLabel="No workspace"
          selectedWorkspaceId={search.workspaceId}
          workspaces={workspaces}
        />
      ) : null}
      {scopedWorkspaceId ? (
        <span className="filter-context">
          Workspace <span className="code-value">{scopedWorkspaceId}</span>
        </span>
      ) : null}
      <input
        aria-label="Question search"
        className="compact-input"
        defaultValue={search.question ?? ""}
        maxLength={500}
        name="question"
        placeholder="Search questions"
      />
      <select
        aria-label="Status"
        className="select-input"
        defaultValue={search.status ?? ""}
        name="status"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Any status</option>
        {researchReportStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <input
        aria-label="From date"
        className="compact-input"
        defaultValue={search.dateFrom ?? ""}
        name="dateFrom"
        type="date"
      />
      <input
        aria-label="To date"
        className="compact-input"
        defaultValue={search.dateTo ?? ""}
        name="dateTo"
        type="date"
      />
      <select
        aria-label="Warnings"
        className="select-input"
        defaultValue={formatBooleanFilter(search.hasWarnings)}
        name="hasWarnings"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Any warnings</option>
        <option value="true">Has warnings</option>
        <option value="false">No warnings</option>
      </select>
      <select
        aria-label="Pending memory proposals"
        className="select-input"
        defaultValue={formatBooleanFilter(search.hasPendingMemoryProposal)}
        name="hasPendingMemoryProposal"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Any memory state</option>
        <option value="true">Pending memory</option>
        <option value="false">No pending memory</option>
      </select>
      <select
        aria-label="Sort"
        className="select-input"
        defaultValue={search.sort}
        name="sort"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="newest_completed_or_updated_first">Newest first</option>
        <option value="oldest_completed_or_updated_first">Oldest first</option>
      </select>
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
      <a className="text-link" href={action}>
        Clear filters
      </a>
    </form>
  );
}

export function ResearchReportHistoryList({ result }: { result: ResearchReportHistoryResult }) {
  if (!result.ok) {
    return <SafeError error={result.error} />;
  }

  if (result.page.reports.length === 0) {
    return <p className="empty-state">No research reports match these filters.</p>;
  }

  return (
    <ul className="entity-list">
      {result.page.reports.map((report) => (
        <li className="entity-item report-history-card" key={report.id}>
          <a
            aria-label={`Open research report ${report.id}`}
            href={researchHistoryReportHref(report)}
          >
            <span className="entity-item-header">
              <span>{report.question}</span>
              <ResearchStatusPill status={report.status} />
            </span>
            <span className="history-card-metrics">
              <span>{report.sourceCount} sources</span>
              <span>{report.warningCount} warnings</span>
              <span>{report.pendingMemoryProposalCount} pending memory</span>
            </span>
            <span className="trace-meta">
              Completed{" "}
              {report.completedAt ? formatTimestamp(report.completedAt) : "not yet completed"} -
              updated {formatTimestamp(report.effectiveAt)}
            </span>
            <span className="trace-meta">
              workspace <span className="code-value">{report.workspaceId ?? "unscoped"}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ResearchHistoryPagination({
  basePath,
  page,
  search,
}: {
  basePath: string;
  page: Pick<
    ResearchReportHistoryPage,
    "hasNextPage" | "hasPreviousPage" | "page" | "pageSize" | "total"
  >;
  search: ResearchHistorySearchState;
}) {
  if (!page.hasPreviousPage && !page.hasNextPage) {
    return null;
  }

  return (
    <nav aria-label="Research report history pagination" className="pagination-bar">
      {page.hasPreviousPage ? (
        <a
          className="secondary-button"
          href={buildResearchHistoryHref(basePath, { ...search, page: page.page - 1 })}
        >
          Previous
        </a>
      ) : (
        <span className="secondary-button pagination-disabled">Previous</span>
      )}
      <span className="trace-meta">
        Page {page.page} - {page.total} reports
      </span>
      {page.hasNextPage ? (
        <a
          className="secondary-button"
          href={buildResearchHistoryHref(basePath, { ...search, page: page.page + 1 })}
        >
          Next
        </a>
      ) : (
        <span className="secondary-button pagination-disabled">Next</span>
      )}
    </nav>
  );
}

export function ResearchReportDetail({
  memory,
  report,
  reportFeedback,
  sourceFeedbackList,
}: {
  memory: ResearchMemoryStatusSummary;
  report: ResearchReport;
  reportFeedback: ResearchReportFeedback | null;
  sourceFeedbackList: ResearchSourceFeedback[];
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

      <ReportFeedbackPanel report={report} reportFeedback={reportFeedback} />
      <MemoryProposalPanel memory={memory} />
      <FindingsPanel citations={report.citations} findings={report.findings} />
      <SourcesPanel
        citations={report.citations}
        sources={report.sources}
        sourceFeedbackList={sourceFeedbackList}
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
  sourceFeedbackList,
  warnings,
}: {
  citations: ResearchCitation[];
  sources: ResearchSelectedSource[];
  sourceFeedbackList: ResearchSourceFeedback[];
  warnings: ResearchWarning[];
}) {
  const feedbackBySource = new Map(sourceFeedbackList.map((f) => [f.sourceId, f]));

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
              <SourceFeedbackControl
                feedback={feedbackBySource.get(source.id) ?? null}
                source={source}
              />
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

function ReportFeedbackPanel({
  report,
  reportFeedback,
}: {
  report: ResearchReport;
  reportFeedback: ResearchReportFeedback | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localRating, setLocalRating] = useState<ResearchSourceFeedbackRating>(
    reportFeedback?.rating ?? "neutral",
  );
  const [localUseful, setLocalUseful] = useState(reportFeedback?.useful ?? false);
  const [localNotes, setLocalNotes] = useState(reportFeedback?.notes ?? "");

  const hasExisting = reportFeedback !== null;

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);

    try {
      await upsertReportFeedback({
        data: {
          reportId: report.id,
          workspaceId: report.workspaceId,
          rating: localRating,
          useful: localUseful,
          notes: localNotes.trim() || null,
          reason: null,
        },
      });
      await router.invalidate();
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }, [router, report.id, report.workspaceId, localRating, localUseful, localNotes]);

  const handleCancel = useCallback(() => {
    setLocalRating(reportFeedback?.rating ?? "neutral");
    setLocalUseful(reportFeedback?.useful ?? false);
    setLocalNotes(reportFeedback?.notes ?? "");
    setEditing(false);
  }, [reportFeedback]);

  return (
    <section className="detail-panel" aria-labelledby="research-report-feedback-title">
      <div className="section-heading">
        <h2 id="research-report-feedback-title">Report feedback</h2>
        {hasExisting && !editing ? (
          <span className="pill pill-neutral">{reportFeedback.rating}</span>
        ) : null}
      </div>

      {!editing && hasExisting ? (
        <div className="feedback-display">
          <p className="trace-meta">
            Rated <strong>{reportFeedback.rating}</strong>
            {reportFeedback.useful && " (useful)"} - updated{" "}
            {formatTimestamp(reportFeedback.updatedAt)}
          </p>
          {reportFeedback.notes ? <p className="trace-meta">{reportFeedback.notes}</p> : null}
          <button
            className="secondary-button"
            disabled={submitting}
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit feedback
          </button>
        </div>
      ) : null}

      {editing || !hasExisting ? (
        <div className="stack-form">
          <div className="field-grid">
            <label htmlFor="report-feedback-rating">Rating</label>
            <select
              className="select-input"
              disabled={submitting}
              id="report-feedback-rating"
              onChange={(e) => setLocalRating(e.target.value as ResearchSourceFeedbackRating)}
              value={localRating}
            >
              <option value="useful">Useful</option>
              <option value="neutral">Neutral</option>
              <option value="poor">Poor</option>
            </select>
          </div>
          <label className="check-control">
            <input
              checked={localUseful}
              disabled={submitting}
              onChange={(e) => setLocalUseful(e.target.checked)}
              type="checkbox"
            />
            This report was useful
          </label>
          <div className="field-grid">
            <label htmlFor="report-feedback-notes">Notes</label>
            <textarea
              disabled={submitting}
              id="report-feedback-notes"
              maxLength={2000}
              onChange={(e) => setLocalNotes(e.target.value)}
              placeholder="Optional notes about this report"
              value={localNotes}
            />
          </div>
          <div className="compact-fields">
            <button
              aria-busy={submitting}
              className="primary-button"
              disabled={submitting}
              onClick={handleSubmit}
              type="button"
            >
              {hasExisting ? "Update feedback" : "Save feedback"}
            </button>
            {hasExisting ? (
              <button
                className="secondary-button"
                disabled={submitting}
                onClick={handleCancel}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SourceFeedbackControl({
  feedback,
  source,
}: {
  feedback: ResearchSourceFeedback | null;
  source: ResearchSelectedSource;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localRating, setLocalRating] = useState<ResearchSourceFeedbackRating>(
    feedback?.rating ?? "neutral",
  );
  const [localHelpful, setLocalHelpful] = useState(feedback?.helpful ?? false);
  const [localNotes, setLocalNotes] = useState(feedback?.notes ?? "");

  const hasExisting = feedback !== null;

  const handleSave = useCallback(async () => {
    setSubmitting(true);

    try {
      await createSourceFeedback({
        data: {
          sourceId: source.id,
          reportId: source.reportId,
          workspaceId: source.workspaceId,
          rating: localRating,
          helpful: localHelpful,
          notes: localNotes.trim() || null,
          reason: null,
        },
      });
      await router.invalidate();
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }, [router, source.id, source.reportId, source.workspaceId, localRating, localHelpful, localNotes]);

  const handleUpdate = useCallback(async () => {
    setSubmitting(true);

    try {
      await updateSourceFeedback({
        data: {
          sourceId: source.id,
          workspaceId: source.workspaceId,
          rating: localRating,
          helpful: localHelpful,
          notes: localNotes.trim() || null,
        },
      });
      await router.invalidate();
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }, [router, source.id, source.workspaceId, localRating, localHelpful, localNotes]);

  const handleDelete = useCallback(async () => {
    setSubmitting(true);

    try {
      await deleteSourceFeedback({
        data: {
          sourceId: source.id,
          workspaceId: source.workspaceId,
        },
      });
      await router.invalidate();
      setLocalRating("neutral");
      setLocalHelpful(false);
      setLocalNotes("");
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }, [router, source.id, source.workspaceId]);

  const handleCancel = useCallback(() => {
    setLocalRating(feedback?.rating ?? "neutral");
    setLocalHelpful(feedback?.helpful ?? false);
    setLocalNotes(feedback?.notes ?? "");
    setEditing(false);
  }, [feedback]);

  return (
    <div className="feedback-control">
      {!editing && hasExisting ? (
        <div className="feedback-display">
          <span className="pill-row">
            <span className="pill pill-neutral">{feedback.rating}</span>
            {feedback.helpful ? <span className="pill pill-success">helpful</span> : null}
          </span>
          {feedback.notes ? <p className="trace-meta">{feedback.notes}</p> : null}
          <div className="compact-fields">
            <button
              className="text-link"
              disabled={submitting}
              onClick={() => setEditing(true)}
              type="button"
            >
              Edit
            </button>
            <button
              className="text-link danger-link"
              disabled={submitting}
              onClick={handleDelete}
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}

      {editing || !hasExisting ? (
        <div className="stack-form">
          <div className="compact-fields">
            <select
              aria-label="Source rating"
              className="select-input compact-input"
              disabled={submitting}
              onChange={(e) => setLocalRating(e.target.value as ResearchSourceFeedbackRating)}
              value={localRating}
            >
              <option value="useful">Useful</option>
              <option value="neutral">Neutral</option>
              <option value="poor">Poor</option>
            </select>
            <label className="check-control">
              <input
                checked={localHelpful}
                disabled={submitting}
                onChange={(e) => setLocalHelpful(e.target.checked)}
                type="checkbox"
              />
              Helpful
            </label>
          </div>
          <textarea
            aria-label="Source feedback notes"
            className="compact-input"
            disabled={submitting}
            maxLength={2000}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="Optional notes"
            value={localNotes}
          />
          <div className="compact-fields">
            {hasExisting ? (
              <button
                aria-busy={submitting}
                className="primary-button compact-btn"
                disabled={submitting}
                onClick={handleUpdate}
                type="button"
              >
                Update
              </button>
            ) : (
              <button
                aria-busy={submitting}
                className="primary-button compact-btn"
                disabled={submitting}
                onClick={handleSave}
                type="button"
              >
                Save
              </button>
            )}
            {hasExisting ? (
              <button
                className="secondary-button compact-btn"
                disabled={submitting}
                onClick={handleCancel}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
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

function researchHistoryReportHref(report: ResearchReportHistoryItem): string {
  const base = `/research/${encodeURIComponent(report.id)}`;
  return report.workspaceId
    ? `${base}?workspaceId=${encodeURIComponent(report.workspaceId)}`
    : base;
}

function buildResearchHistoryHref(basePath: string, search: ResearchHistorySearchState): string {
  const params = new URLSearchParams();

  setSearchParam(params, "workspaceId", search.workspaceId);
  setSearchParam(params, "status", search.status);
  setSearchParam(params, "dateFrom", search.dateFrom);
  setSearchParam(params, "dateTo", search.dateTo);
  setSearchParam(params, "question", search.question);
  setBooleanSearchParam(params, "hasWarnings", search.hasWarnings);
  setBooleanSearchParam(params, "hasPendingMemoryProposal", search.hasPendingMemoryProposal);
  setSearchParam(params, "sort", search.sort);
  params.set("page", String(search.page));
  params.set("pageSize", String(search.pageSize));

  return `${basePath}?${params.toString()}`;
}

function setSearchParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) {
    params.set(key, value);
  }
}

function setBooleanSearchParam(
  params: URLSearchParams,
  key: string,
  value: boolean | undefined,
): void {
  if (value !== undefined) {
    params.set(key, String(value));
  }
}

function formatBooleanFilter(value: boolean | undefined): string {
  return value === undefined ? "" : String(value);
}
