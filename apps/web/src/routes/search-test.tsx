import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { workspaceIdSchema } from "@pap/contracts";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ExtractionPreview,
  SearchExecutionSummary,
  SearchFailure,
  SearchProviderHealthPanel,
  SearchResults,
  SelectedResultPanel,
} from "../features/search-test/components";
import type {
  SearchResultSelection,
  SearchTestExtractionResult,
  SearchTestSearchResult,
} from "../features/search-test/types";
import {
  extractSearchTestResult,
  getSearchProviderStatus,
  runSearchTest,
} from "../features/search-test/server";
import { SafeError } from "../features/executions/components";
import { WorkspaceSelector } from "../features/workspaces/components";
import { listWorkspaces } from "../features/workspaces/server";

type SearchTestSearch = {
  workspaceId?: string | undefined;
};

export const Route = createFileRoute("/search-test")({
  validateSearch: (search: Record<string, unknown>): SearchTestSearch => ({
    workspaceId: parseWorkspaceId(search.workspaceId),
  }),
  loaderDeps: ({ search }) => search,
  loader: async () => {
    const [provider, workspaces] = await Promise.all([
      getSearchProviderStatus(),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      provider,
      workspaces,
    };
  },
  component: SearchTestRoute,
});

function SearchTestRoute() {
  const router = useRouter();
  const search = Route.useSearch();
  const { provider, workspaces } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchTestSearchResult | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResultSelection | null>(null);
  const [extractionResult, setExtractionResult] = useState<SearchTestExtractionResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextQuery = String(form.get("query") ?? "").trim();

    setQuery(nextQuery);
    setIsSearching(true);
    setSearchResult(null);
    setSelectedResult(null);
    setExtractionResult(null);

    try {
      const nextResult = await runSearchTest({ data: form });
      setSearchResult(nextResult);

      if (nextResult.ok || nextResult.executionId) {
        await router.invalidate();
      }
    } catch {
      setSearchResult({
        ok: false,
        error: {
          code: "SEARCH_TEST_REQUEST_FAILED",
          message: "Search request could not be completed.",
        },
      });
    } finally {
      setIsSearching(false);
    }
  }

  async function submitExtraction() {
    if (!searchResult?.ok || selectedResult === null) {
      return;
    }

    setIsExtracting(true);
    setExtractionResult(null);

    try {
      const nextResult = await extractSearchTestResult({
        data: {
          query: searchResult.query,
          selectedUrl: selectedResult.result.url,
          ...(search.workspaceId ? { workspaceId: search.workspaceId } : {}),
        },
      });
      setExtractionResult(nextResult);

      if (nextResult.ok || nextResult.executionId) {
        await router.invalidate();
      }
    } catch {
      setExtractionResult({
        ok: false,
        error: {
          code: "SEARCH_TEST_EXTRACTION_REQUEST_FAILED",
          message: "Extraction request could not be completed.",
        },
      });
    } finally {
      setIsExtracting(false);
    }
  }

  const successfulSearch = searchResult?.ok ? searchResult : null;

  return (
    <>
      <section className="page-header" aria-labelledby="search-test-title">
        <span className="eyebrow">PAP-075 to PAP-077</span>
        <h1 className="page-title" id="search-test-title">
          Search extraction test
        </h1>
        <p className="page-copy">
          capability.search-extract-test / provider.searxng / guarded web evidence
        </p>
      </section>

      <div className="workspace-grid">
        <section className="section-panel" aria-labelledby="search-test-form-title">
          <div className="section-heading">
            <h2 id="search-test-form-title">Run search</h2>
            <span>server function</span>
          </div>
          {workspaces.ok ? (
            <form action="/search-test" className="filter-bar" method="get">
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
            data-search-test-ready={isHydrated ? "true" : "false"}
            onSubmit={submitSearch}
          >
            {search.workspaceId ? (
              <input name="workspaceId" type="hidden" value={search.workspaceId} />
            ) : null}
            <div className="field-grid">
              <label htmlFor="search-test-query">Query</label>
              <input
                aria-invalid={searchResult?.ok === false ? true : undefined}
                disabled={isSearching}
                id="search-test-query"
                maxLength={500}
                name="query"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="local AI engineering"
                value={query}
              />
            </div>
            <button
              aria-busy={isSearching}
              className="primary-button"
              disabled={isSearching}
              type="submit"
            >
              {isSearching ? "Searching" : "Run search"}
            </button>
          </form>

          <div aria-live="polite">
            {isSearching ? (
              <div className="result-box" role="status">
                <h3>Searching</h3>
                <p className="trace-meta">The runtime is calling the server-side search path.</p>
              </div>
            ) : null}
            {searchResult?.ok ? <SearchExecutionSummary result={searchResult} /> : null}
            {searchResult && !searchResult.ok ? (
              <SearchFailure label="Search action" result={searchResult} />
            ) : null}
          </div>
        </section>

        <aside className="section-panel" aria-labelledby="search-provider-status-title">
          <div className="section-heading">
            <h2 id="search-provider-status-title">Provider status</h2>
            <span>local</span>
          </div>
          <SearchProviderHealthPanel provider={provider} />
        </aside>
      </div>

      <section className="section-panel" aria-labelledby="search-results-title">
        <div className="section-heading">
          <h2 id="search-results-title">Normalized results</h2>
          <Link
            className="text-link"
            search={{
              page: 1,
              pageSize: 10,
              capabilityId: "capability.search-extract-test",
              ...(search.workspaceId ? { workspaceId: search.workspaceId } : {}),
            }}
            to="/executions"
          >
            View search traces
          </Link>
        </div>
        <SearchResults
          result={successfulSearch}
          selected={selectedResult}
          onSelect={(selection) => {
            setSelectedResult(selection);
            setExtractionResult(null);
          }}
        />
      </section>

      <div className="workspace-grid">
        <section className="section-panel" aria-labelledby="selected-result-title">
          <div className="section-heading">
            <h2 id="selected-result-title">Extraction</h2>
            <span>explicit selection</span>
          </div>
          <SelectedResultPanel
            disabled={isExtracting}
            selection={selectedResult}
            onExtract={submitExtraction}
          />
          <div aria-live="polite">
            {isExtracting ? (
              <div className="result-box" role="status">
                <h3>Extracting</h3>
                <p className="trace-meta">
                  The runtime is validating, fetching, extracting, and persisting evidence.
                </p>
              </div>
            ) : null}
            {extractionResult && !extractionResult.ok ? (
              <SearchFailure label="Extraction action" result={extractionResult} />
            ) : null}
          </div>
        </section>

        <section className="section-panel" aria-labelledby="extracted-preview-title">
          <div className="section-heading">
            <h2 id="extracted-preview-title">Extracted preview</h2>
            <span>bounded</span>
          </div>
          {extractionResult?.ok ? (
            <ExtractionPreview result={extractionResult} />
          ) : (
            <p className="empty-state">No extracted document yet.</p>
          )}
        </section>
      </div>
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
