import {
  type CapabilityExecutionContext,
  type ExtractedDocument,
  type ExtractionMethod,
  type FetchResult,
  type FetchUrl,
  fetchUrlSchema,
  type SearchProviderHealth,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type WebSelectedUrlSource,
} from "@pap/contracts";
import { SearchExtractTestSafeError } from "./errors.js";
import {
  type SearchExtractTestOutput,
  type SearchExtractTestWarning,
  searchExtractTestInputSchema,
  searchExtractTestOutputSchema,
} from "./schemas.js";

export type SearchExtractTestOptions = {
  allowedSelectedUrls?: string[];
};

type UrlSelection =
  | {
      kind: "none";
      source: "none";
    }
  | {
      kind: "selected";
      source: WebSelectedUrlSource;
      url: FetchUrl;
      selectedResultIndex: number | null;
      selectedResult: SearchResult | null;
    }
  | {
      kind: "unsupported";
      url: FetchUrl;
    };

type TimedFailure = {
  category: string;
  message: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  retryable?: boolean;
};

export function createSearchExtractTestExecute(options: SearchExtractTestOptions = {}) {
  const allowlist = normalizeAllowlist(options.allowedSelectedUrls ?? []);

  return async (
    input: unknown,
    context: CapabilityExecutionContext,
  ): Promise<SearchExtractTestOutput> => {
    const parsedInput = searchExtractTestInputSchema.parse(input);
    assertWorkspaceMatches(parsedInput.workspaceId ?? null, context.workspaceId ?? null);

    const providerId = await context.web.resolveSearchProvider();
    const health = await context.web.getSearchProviderHealth(providerId);
    assertProviderHealthy(health);

    const searchRequest: SearchRequest = {
      query: parsedInput.query,
      page: null,
      pageSize: 10,
      language: null,
      safesearch: null,
      categories: null,
      timeRange: null,
      providerId,
    };
    const searchResponse = await searchWithEvidenceOnFailure(context, searchRequest, providerId);
    const selection = selectUrl(parsedInput.selectedUrl ?? null, searchResponse.results, allowlist);

    if (selection.kind === "none") {
      await context.trace.addStep({
        kind: "workflow",
        name: "select URL",
        status: "skipped",
        summary: "No selected URL was supplied; execution returns search results only.",
        metadata: {
          selectionSource: "none",
          resultCount: searchResponse.results.length,
        },
      });

      const evidence = await context.web.persistEvidence({
        search: {
          request: searchRequest,
          response: searchResponse,
        },
      });

      return searchExtractTestOutputSchema.parse({
        query: searchResponse.query,
        results: searchResponse.results,
        selectedResult: null,
        document: null,
        evidence: {
          searchEvidenceId: evidence.searchEvidenceId,
        },
        warnings: outputWarnings({ search: searchResponse }),
      });
    }

    if (selection.kind === "unsupported") {
      await context.trace.addStep({
        kind: "workflow",
        name: "select URL",
        status: "failed",
        summary: "Selected URL was not returned by search and is not allowlisted for tests.",
        metadata: {
          selectedUrl: selection.url,
          selectionSource: "unsupported",
          resultCount: searchResponse.results.length,
          failureCategory: "selected_url_not_supported",
          status: "failed",
        },
      });
      await persistSearchEvidence(context, searchRequest, searchResponse);
      throw new SearchExtractTestSafeError({
        code: "CAPABILITY_INPUT_INVALID",
        message: "Selected URL was not returned by search and is not allowlisted for tests.",
        category: "validation",
        details: {
          failureCategory: "selected_url_not_supported",
          selectedUrl: selection.url,
        },
      });
    }

    await context.trace.addStep({
      kind: "workflow",
      name: "select URL",
      status: "completed",
      summary: "Selected URL for guarded fetch and extraction.",
      metadata: {
        selectedUrl: selection.url,
        selectedResultIndex: selection.selectedResultIndex,
        selectionSource: selection.source,
        resultCount: searchResponse.results.length,
      },
    });

    const validatedUrl = await validateUrlWithSearchEvidenceOnFailure(
      context,
      searchRequest,
      searchResponse,
      selection.url,
    );
    const fetchResult = await fetchWithEvidenceOnFailure({
      context,
      searchRequest,
      searchResponse,
      selection,
      validatedUrl,
    });
    const sourceProfile = await context.web.resolveSourceProfile(fetchResult.finalUrl);
    const document = await extractWithEvidenceOnFailure({
      context,
      searchRequest,
      searchResponse,
      selection,
      fetchResult,
      sourceProfileId: sourceProfile?.id ?? null,
    });
    const evidence = await context.web.persistEvidence({
      search: {
        request: searchRequest,
        response: searchResponse,
      },
      fetch: {
        result: fetchResult,
        selectedUrlSource: selection.source,
        selectedResultIndex: selection.selectedResultIndex,
        requestedUrl: validatedUrl,
      },
      extraction: {
        document,
        finalUrl: document.metadata.finalUrl,
      },
    });

    return searchExtractTestOutputSchema.parse({
      query: searchResponse.query,
      results: searchResponse.results,
      selectedResult:
        selection.selectedResult === null || selection.selectedResultIndex === null
          ? null
          : {
              index: selection.selectedResultIndex,
              result: selection.selectedResult,
            },
      document: toOutputDocument(document),
      evidence: {
        searchEvidenceId: evidence.searchEvidenceId,
        fetchEvidenceId: evidence.fetchEvidenceId,
        extractionEvidenceId: evidence.extractionEvidenceId,
      },
      warnings: outputWarnings({ search: searchResponse, fetch: fetchResult, document }),
    });
  };
}

export const executeSearchExtractTest = createSearchExtractTestExecute();

async function searchWithEvidenceOnFailure(
  context: CapabilityExecutionContext,
  request: SearchRequest,
  providerId: string,
): Promise<SearchResponse> {
  const started = startTimer();

  try {
    return await context.web.search(request);
  } catch (error) {
    await context.web.persistEvidence({
      search: {
        request,
        providerId,
        query: request.query,
        failure: failureFromError(error, started, "search_failed"),
      },
    });
    throw error;
  }
}

async function validateUrlWithSearchEvidenceOnFailure(
  context: CapabilityExecutionContext,
  request: SearchRequest,
  response: SearchResponse,
  selectedUrl: FetchUrl,
): Promise<FetchUrl> {
  try {
    return await context.web.validateUrlPolicy(selectedUrl);
  } catch (error) {
    await persistSearchEvidence(context, request, response);
    throw error;
  }
}

async function fetchWithEvidenceOnFailure(input: {
  context: CapabilityExecutionContext;
  searchRequest: SearchRequest;
  searchResponse: SearchResponse;
  selection: Extract<UrlSelection, { kind: "selected" }>;
  validatedUrl: FetchUrl;
}): Promise<FetchResult> {
  const started = startTimer();

  try {
    return await input.context.web.fetch({ url: input.validatedUrl });
  } catch (error) {
    await input.context.web.persistEvidence({
      search: {
        request: input.searchRequest,
        response: input.searchResponse,
      },
      fetch: {
        selectedUrlSource: input.selection.source,
        selectedResultIndex: input.selection.selectedResultIndex,
        requestedUrl: input.validatedUrl,
        finalUrl: fetchUrlFromError(error) ?? null,
        statusCode: statusCodeFromError(error) ?? null,
        failure: failureFromError(error, started, "fetch_failed"),
      },
    });
    throw error;
  }
}

async function extractWithEvidenceOnFailure(input: {
  context: CapabilityExecutionContext;
  searchRequest: SearchRequest;
  searchResponse: SearchResponse;
  selection: Extract<UrlSelection, { kind: "selected" }>;
  fetchResult: FetchResult;
  sourceProfileId: string | null;
}): Promise<ExtractedDocument> {
  const started = startTimer();

  try {
    return await input.context.web.extract({
      requestedUrl: input.fetchResult.requestedUrl,
      finalUrl: input.fetchResult.finalUrl,
      html: input.fetchResult.html,
      text: input.fetchResult.text,
      contentType: input.fetchResult.contentType,
      sourceProfileId: input.sourceProfileId,
    });
  } catch (error) {
    await input.context.web.persistEvidence({
      search: {
        request: input.searchRequest,
        response: input.searchResponse,
      },
      fetch: {
        result: input.fetchResult,
        selectedUrlSource: input.selection.source,
        selectedResultIndex: input.selection.selectedResultIndex,
        requestedUrl: input.fetchResult.requestedUrl,
      },
      extraction: {
        finalUrl: input.fetchResult.finalUrl,
        extractionMethod: extractionMethodFromError(error) ?? null,
        sourceProfileId: sourceProfileIdFromError(error) ?? input.sourceProfileId,
        warnings: warningsFromError(error),
        failure: failureFromError(error, started, "extraction_failed"),
      },
    });
    throw error;
  }
}

async function persistSearchEvidence(
  context: CapabilityExecutionContext,
  request: SearchRequest,
  response: SearchResponse,
): Promise<void> {
  await context.web.persistEvidence({
    search: {
      request,
      response,
    },
  });
}

function selectUrl(
  selectedUrl: FetchUrl | null,
  results: SearchResult[],
  allowlist: Set<FetchUrl>,
): UrlSelection {
  if (selectedUrl === null) {
    return { kind: "none", source: "none" };
  }

  const resultIndex = results.findIndex((result) => result.url === selectedUrl);

  if (resultIndex >= 0) {
    return {
      kind: "selected",
      source: "search_result",
      url: selectedUrl,
      selectedResultIndex: resultIndex,
      selectedResult: results[resultIndex] ?? null,
    };
  }

  if (allowlist.has(selectedUrl)) {
    return {
      kind: "selected",
      source: "explicit_test_allowlist",
      url: selectedUrl,
      selectedResultIndex: null,
      selectedResult: null,
    };
  }

  return { kind: "unsupported", url: selectedUrl };
}

function assertWorkspaceMatches(
  inputWorkspaceId: string | null,
  contextWorkspaceId: string | null,
) {
  if (inputWorkspaceId === null || inputWorkspaceId === contextWorkspaceId) {
    return;
  }

  throw new SearchExtractTestSafeError({
    code: "CAPABILITY_INPUT_INVALID",
    message: "Input workspaceId must match the execution workspace.",
    category: "validation",
    details: {
      failureCategory: "workspace_mismatch",
      inputWorkspaceId,
      contextWorkspaceId,
    },
  });
}

function assertProviderHealthy(health: SearchProviderHealth): void {
  if (health.status === "healthy") {
    return;
  }

  throw new SearchExtractTestSafeError({
    code: "WEB_SEARCH_FAILED",
    message: "Search provider is not healthy.",
    category: "tool",
    retryable: health.status === "degraded" || health.status === "unavailable",
    details: {
      providerId: health.providerId,
      healthStatus: health.status,
      failureCategory: "search_provider_unavailable",
    },
  });
}

function toOutputDocument(document: ExtractedDocument) {
  return {
    finalUrl: document.metadata.finalUrl,
    title: document.title,
    byline: document.byline,
    siteName: document.siteName,
    publishedAt: document.publishedAt,
    canonicalUrl: document.canonicalUrl,
    excerpt: document.excerpt,
    contentTextSnapshot: document.contentText.slice(0, 20_000),
    wordCount: document.wordCount,
    method: document.method,
    sourceProfileId: document.metadata.sourceProfileId,
    warnings: document.warnings,
  };
}

function outputWarnings(input: {
  search: SearchResponse;
  fetch?: FetchResult;
  document?: ExtractedDocument;
}): SearchExtractTestWarning[] {
  return [
    ...input.search.warnings,
    ...(input.fetch?.warnings ?? []),
    ...(input.document?.warnings ?? []),
  ].map((warning) => ({
    code: warning.code,
    message: warning.message,
    ...("count" in warning && warning.count !== undefined ? { count: warning.count } : {}),
  }));
}

function normalizeAllowlist(urls: string[]): Set<FetchUrl> {
  return new Set(urls.map((url) => fetchUrlSchema.parse(url)));
}

function startTimer() {
  const startedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    startedMs: startedAt.getTime(),
  };
}

function failureFromError(
  error: unknown,
  started: ReturnType<typeof startTimer>,
  fallbackCategory: string,
): TimedFailure {
  const completedAt = new Date();
  const platformError = platformErrorFromUnknown(error);

  return {
    category: normalizeFailureCategory(
      stringDetail(platformError?.details, "failureCategory") ??
        platformError?.code.toLowerCase() ??
        fallbackCategory,
    ),
    message: boundedString(platformError?.message ?? "Web operation failed safely.", 1_000),
    startedAt: started.startedAt,
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - started.startedMs),
    ...(platformError?.retryable === undefined ? {} : { retryable: platformError.retryable }),
  };
}

function platformErrorFromUnknown(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "platformError" in error &&
    typeof error.platformError === "object" &&
    error.platformError !== null
  ) {
    return error.platformError as {
      code: string;
      message: string;
      retryable: boolean;
      details?: Record<string, unknown>;
    };
  }

  return null;
}

function fetchUrlFromError(error: unknown): FetchUrl | null {
  const value = stringDetail(platformErrorFromUnknown(error)?.details, "url");
  const parsed = value ? fetchUrlSchema.safeParse(value) : null;
  return parsed?.success ? parsed.data : null;
}

function statusCodeFromError(error: unknown): number | null {
  const value = platformErrorFromUnknown(error)?.details?.statusCode;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function extractionMethodFromError(error: unknown): ExtractionMethod | null {
  const value = stringDetail(platformErrorFromUnknown(error)?.details, "extractionMethod");

  return value === "source_profile" || value === "readability" || value === "plain_text"
    ? value
    : null;
}

function sourceProfileIdFromError(error: unknown) {
  return stringDetail(platformErrorFromUnknown(error)?.details, "sourceProfileId");
}

function warningsFromError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "warnings" in error &&
    Array.isArray(error.warnings)
  ) {
    return error.warnings;
  }

  return [];
}

function stringDetail(details: Record<string, unknown> | undefined, key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

function normalizeFailureCategory(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return normalized.length > 0 ? normalized.slice(0, 120) : "unknown";
}

function boundedString(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}
