import type { SearchResult } from "@pap/contracts";
import { Link } from "@tanstack/react-router";
import { DataRow, formatTimestamp, SafeError, StatusPill } from "../executions/components";
import type {
  SearchProviderStatusResult,
  SearchResultSelection,
  SearchTestExtractionResult,
  SearchTestSearchResult,
} from "./types";

export function SearchProviderHealthPanel({ provider }: { provider: SearchProviderStatusResult }) {
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
        <SearchProviderActionText provider={provider} />
      </DataRow>
    </div>
  );
}

export function SearchResults({
  result,
  selected,
  onSelect,
}: {
  result: Extract<SearchTestSearchResult, { ok: true }> | null;
  selected: SearchResultSelection | null;
  onSelect: (selection: SearchResultSelection) => void;
}) {
  if (result === null) {
    return <p className="empty-state">No search results yet.</p>;
  }

  if (result.results.length === 0) {
    return <p className="empty-state">No normalized results were returned.</p>;
  }

  return (
    <ol className="search-result-list">
      {result.results.map((searchResult, index) => {
        const isSelected = selected?.result.url === searchResult.url;

        return (
          <li className="search-result-card" key={searchResult.url}>
            <div className="search-result-main">
              <div>
                <h3>{searchResult.title}</h3>
                <p className="trace-meta">{domainFromResult(searchResult)}</p>
              </div>
              <button
                aria-label={
                  isSelected
                    ? `Selected result ${searchResult.title}`
                    : `Select result ${searchResult.title}`
                }
                aria-pressed={isSelected}
                className={isSelected ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => onSelect({ index, result: searchResult })}
              >
                {isSelected ? "Selected" : "Select"}
              </button>
            </div>
            {searchResult.snippet ? <p className="search-snippet">{searchResult.snippet}</p> : null}
            <SourceMetadata result={searchResult} />
          </li>
        );
      })}
    </ol>
  );
}

export function SelectedResultPanel({
  selection,
  disabled,
  onExtract,
}: {
  selection: SearchResultSelection | null;
  disabled: boolean;
  onExtract: () => void;
}) {
  if (selection === null) {
    return (
      <div className="result-box">
        <h3>Selection required</h3>
        <p className="trace-meta">Choose a returned result before extraction.</p>
      </div>
    );
  }

  return (
    <div className="result-box result-selected">
      <h3>Selected result</h3>
      <div className="detail-grid compact-detail-grid">
        <DataRow label="Title">
          <span>{selection.result.title}</span>
        </DataRow>
        <DataRow label="URL">
          <span className="code-value">{selection.result.url}</span>
        </DataRow>
        <DataRow label="Index">
          <span>{selection.index + 1}</span>
        </DataRow>
        <DataRow label="Source">
          <span>{sourceSummary(selection.result)}</span>
        </DataRow>
      </div>
      {selection.result.snippet ? (
        <p className="search-snippet">{selection.result.snippet}</p>
      ) : null}
      <div className="result-actions">
        <button className="primary-button" disabled={disabled} type="button" onClick={onExtract}>
          {disabled ? "Extracting" : "Extract selected result"}
        </button>
      </div>
    </div>
  );
}

export function SearchExecutionSummary({
  result,
}: {
  result: Extract<SearchTestSearchResult, { ok: true }>;
}) {
  return (
    <div className="result-box result-success" role="status">
      <h3>Search completed</h3>
      <p className="trace-meta">
        {result.results.length} normalized results for{" "}
        <span className="code-value">{result.query}</span>
      </p>
      <WarningList warnings={result.warnings} />
      <div className="result-actions">
        <Link
          className="text-link"
          params={{ executionId: result.executionId }}
          search={{ page: 1, pageSize: 10 }}
          to="/executions/$executionId"
        >
          Open search execution detail
        </Link>
      </div>
    </div>
  );
}

export function ExtractionPreview({
  result,
}: {
  result: Extract<SearchTestExtractionResult, { ok: true }>;
}) {
  return (
    <div className="result-box result-success" role="status">
      <h3>Extraction completed</h3>
      <div className="document-preview">
        <div className="document-preview-head">
          <div>
            <span className="meta-label">Title</span>
            <h4>{result.document.title ?? "Untitled document"}</h4>
          </div>
          <StatusPill status="completed" />
        </div>
        <div className="detail-grid compact-detail-grid">
          <DataRow label="Method">
            <span className="code-value">{result.document.method}</span>
          </DataRow>
          <DataRow label="Final URL">
            <span className="code-value">{result.document.finalUrl}</span>
          </DataRow>
          <DataRow label="Canonical">
            <span className="code-value">{result.document.canonicalUrl ?? "Not provided"}</span>
          </DataRow>
          <DataRow label="Site">
            <span>{result.document.siteName ?? "Not provided"}</span>
          </DataRow>
          <DataRow label="Byline">
            <span>{result.document.byline ?? "Not provided"}</span>
          </DataRow>
          <DataRow label="Published">
            <span>
              {result.document.publishedAt
                ? formatTimestamp(result.document.publishedAt)
                : "Not provided"}
            </span>
          </DataRow>
          <DataRow label="Words">
            <span>{result.document.wordCount}</span>
          </DataRow>
          <DataRow label="Source profile">
            <span className="code-value">{result.document.sourceProfileId ?? "none"}</span>
          </DataRow>
        </div>
        {result.document.excerpt ? (
          <p className="search-snippet">{result.document.excerpt}</p>
        ) : null}
        <WarningList warnings={[...result.warnings, ...result.document.warnings]} />
        <pre className="content-preview">{result.document.contentTextSnapshot}</pre>
      </div>
      <div className="result-actions">
        <Link
          className="text-link"
          params={{ executionId: result.executionId }}
          search={{ page: 1, pageSize: 10 }}
          to="/executions/$executionId"
        >
          Open extraction execution detail
        </Link>
      </div>
    </div>
  );
}

export function SearchFailure({
  result,
  label,
}: {
  result: Extract<SearchTestSearchResult | SearchTestExtractionResult, { ok: false }>;
  label: string;
}) {
  return (
    <div>
      <SafeError error={result.error} />
      <div className="result-box result-error">
        <h3>{label}</h3>
        <p className="trace-meta">{failureActionText(result.error.code)}</p>
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

function WarningList({
  warnings,
}: {
  warnings: { code: string; message: string; count?: number | undefined }[];
}) {
  const boundedWarnings = uniqueWarnings(warnings).slice(0, 8);

  if (boundedWarnings.length === 0) {
    return null;
  }

  return (
    <ul className="warning-list" aria-label="Warnings">
      {boundedWarnings.map((warning) => (
        <li key={`${warning.code}:${warning.message}`}>
          <span className="code-value">{warning.code}</span>
          <span>{warning.message}</span>
          {warning.count === undefined ? null : <span>count {warning.count}</span>}
        </li>
      ))}
    </ul>
  );
}

function SourceMetadata({ result }: { result: SearchResult }) {
  return (
    <dl className="source-metadata" aria-label="Source metadata">
      <div>
        <dt>Engine</dt>
        <dd>{result.engine ?? "unknown"}</dd>
      </div>
      <div>
        <dt>Category</dt>
        <dd>{result.category ?? "unknown"}</dd>
      </div>
      <div>
        <dt>Published</dt>
        <dd>{result.publishedAt ? formatTimestamp(result.publishedAt) : "unknown"}</dd>
      </div>
      <div>
        <dt>Score</dt>
        <dd>{result.score ?? "none"}</dd>
      </div>
    </dl>
  );
}

function SearchProviderActionText({ provider }: { provider: SearchProviderStatusResult }) {
  if (!provider.ok) {
    return <span>{provider.error.message}</span>;
  }

  switch (provider.status) {
    case "healthy":
      return <span>Ready for deterministic search tests.</span>;
    case "degraded":
      return <span>Search may run, but provider health reported a degraded state.</span>;
    case "disabled":
      return <span>Enable the local SearXNG provider on the server.</span>;
    case "unavailable":
      return <span>Start local SearXNG and confirm JSON search is enabled.</span>;
    case "unknown":
      return <span>Provider readiness has not been confirmed yet.</span>;
    default:
      return <span>Search provider readiness is not available.</span>;
  }
}

function failureActionText(errorCode: string): string {
  if (errorCode === "WEB_SEARCH_FAILED") {
    return "Check the local SearXNG service and JSON search configuration, then run search again.";
  }

  if (errorCode === "WEB_FETCH_FAILED") {
    return "PAP blocked or rejected the selected URL through the server-side fetch policy. Choose another public HTTP or HTTPS result.";
  }

  if (errorCode === "CAPABILITY_INPUT_INVALID") {
    return "Select one of the visible normalized results returned for the same query.";
  }

  return "Open the execution detail to inspect the safe trace and retry after fixing the input or provider state.";
}

function domainFromResult(result: SearchResult): string {
  if (result.displayUrl) {
    return result.displayUrl;
  }

  try {
    return new URL(result.url).hostname;
  } catch {
    return result.url;
  }
}

function sourceSummary(result: SearchResult): string {
  return [result.engine, result.category].filter(Boolean).join(" / ") || "unknown source";
}

function uniqueWarnings<T extends { code: string; message: string }>(warnings: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const warning of warnings) {
    const key = `${warning.code}:${warning.message}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(warning);
  }

  return unique;
}
