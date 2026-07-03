import {
  httpOrHttpsSearchUrlSchema,
  searchProviderHealthSchema,
  searchRequestSchema,
  searchResponseSchema,
  searchResultSchema,
  type SearchProviderHealth,
  type SearchProviderId,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchWarning,
} from "@pap/contracts";
import { isSearchProviderError, SearchProviderError, type SearchProvider } from "@pap/tools-search";
import type { SearxngConfig } from "./config.js";
import { createDisabledSearxngProviderHealth } from "./health.js";
import { SearxngClient, type SearxngFetch, type SearxngResult } from "./searxng-client.js";

export const defaultSearxngProviderId = "provider.searxng" as const;

export type SearxngProviderOptions = {
  config: SearxngConfig;
  providerId?: SearchProviderId;
  client?: SearxngClient;
  fetch?: SearxngFetch;
  clock?: () => Date;
};

export class SearxngProvider implements SearchProvider {
  readonly id: SearchProviderId;

  private readonly config: SearxngConfig;
  private readonly client: SearxngClient;
  private readonly clock: () => Date;

  constructor(options: SearxngProviderOptions) {
    this.id = options.providerId ?? defaultSearxngProviderId;
    this.config = options.config;
    this.clock = options.clock ?? (() => new Date());
    this.client =
      options.client ??
      new SearxngClient({
        baseUrl: options.config.baseUrl,
        timeoutMs: options.config.timeoutMs,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
  }

  async health(): Promise<SearchProviderHealth> {
    const checkedAt = this.clock().toISOString();

    if (!this.config.enabled) {
      return createDisabledSearxngProviderHealth({
        providerId: this.id,
        checkedAt,
      });
    }

    try {
      await this.client.search({
        providerId: this.id,
        query: "pap health",
        page: 1,
        language: this.config.defaultLanguage,
        safesearch: this.config.defaultSafesearch,
        categories: null,
        timeRange: null,
      });

      return searchProviderHealthSchema.parse({
        providerId: this.id,
        kind: "searxng",
        status: "healthy",
        checkedAt,
        message: "SearXNG is reachable and returned JSON search output.",
      });
    } catch (error) {
      return this.healthFromError(error, checkedAt);
    }
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const parsedRequest = searchRequestSchema.parse(request);

    if (parsedRequest.providerId !== null && parsedRequest.providerId !== this.id) {
      throw new SearchProviderError({
        code: "search_provider_not_found",
        providerId: parsedRequest.providerId,
        message: `SearXNG provider '${this.id}' cannot fulfill request for '${parsedRequest.providerId}'.`,
      });
    }

    if (!this.config.enabled) {
      throw new SearchProviderError({
        code: "search_provider_disabled",
        providerId: this.id,
        message: "SearXNG search provider is disabled by configuration.",
      });
    }

    const startedAt = this.clock().toISOString();
    const page = parsedRequest.page ?? 1;
    const language = parsedRequest.language ?? this.config.defaultLanguage;
    const safesearch = parsedRequest.safesearch ?? this.config.defaultSafesearch;
    const rawResponse = await this.client.search({
      providerId: this.id,
      query: parsedRequest.query,
      page,
      language,
      safesearch,
      categories: parsedRequest.categories,
      timeRange: parsedRequest.timeRange,
      timeoutMs: this.config.timeoutMs,
    });
    const normalized = normalizeSearxngResults(rawResponse.results, parsedRequest.pageSize);
    const completedAt = this.clock().toISOString();

    return searchResponseSchema.parse({
      providerId: this.id,
      query: parsedRequest.query,
      page,
      pageSize: parsedRequest.pageSize,
      results: normalized.results,
      startedAt,
      completedAt,
      durationMs: durationBetween(startedAt, completedAt),
      safety: {
        safesearch,
        language,
        categories: parsedRequest.categories,
        timeRange: parsedRequest.timeRange,
        resultCount: normalized.results.length,
        omittedResultCount: normalized.omittedResultCount,
        normalizedUrlCount: normalized.results.length,
      },
      warnings: normalized.warnings,
    });
  }

  private healthFromError(error: unknown, checkedAt: string): SearchProviderHealth {
    if (!isSearchProviderError(error)) {
      return searchProviderHealthSchema.parse({
        providerId: this.id,
        kind: "searxng",
        status: "unavailable",
        checkedAt,
        message: "SearXNG health check failed.",
      });
    }

    return searchProviderHealthSchema.parse({
      providerId: this.id,
      kind: "searxng",
      status: error.code === "search_provider_invalid_response" ? "degraded" : "unavailable",
      checkedAt,
      message:
        error.code === "search_provider_invalid_response"
          ? "SearXNG is reachable, but returned an unexpected JSON search shape."
          : "SearXNG search provider is unavailable.",
      metadata: {
        errorKind: error.code,
        retryable: error.retryable,
      },
    });
  }
}

function normalizeSearxngResults(
  rawResults: SearxngResult[],
  pageSize: number,
): {
  results: SearchResult[];
  warnings: SearchWarning[];
  omittedResultCount: number;
} {
  const validResults: SearchResult[] = [];
  let invalidResultCount = 0;

  for (const rawResult of rawResults) {
    const normalized = normalizeSearxngResult(rawResult);

    if (normalized === null) {
      invalidResultCount += 1;
      continue;
    }

    validResults.push(normalized);
  }

  const results = validResults.slice(0, pageSize);
  const truncatedResultCount = Math.max(0, validResults.length - results.length);
  const warnings: SearchWarning[] = [];

  if (invalidResultCount > 0) {
    warnings.push({
      code: "search_result_omitted",
      message: "One or more SearXNG results were omitted because required fields were invalid.",
      count: invalidResultCount,
    });
  }

  if (truncatedResultCount > 0) {
    warnings.push({
      code: "search_result_truncated",
      message: "SearXNG returned more valid results than the requested PAP page size.",
      count: truncatedResultCount,
    });
  }

  return {
    results,
    warnings,
    omittedResultCount: invalidResultCount + truncatedResultCount,
  };
}

function normalizeSearxngResult(rawResult: SearxngResult): SearchResult | null {
  const title = boundedString(rawResult.title, 500);
  const rawUrl = stringValue(rawResult.url);

  if (title === null || rawUrl === null) {
    return null;
  }

  const parsedUrl = httpOrHttpsSearchUrlSchema.safeParse(rawUrl);

  if (!parsedUrl.success) {
    return null;
  }

  const candidate = {
    title,
    url: parsedUrl.data,
    displayUrl: displayUrl(parsedUrl.data),
    snippet: boundedNullableString(rawResult.content, 5_000),
    publishedAt: parsePublishedAt(rawResult.publishedDate) ?? parsePublishedAt(rawResult.pubdate),
    engine: boundedNullableString(firstString(rawResult.engine, rawResult.engines), 120),
    category: boundedNullableString(rawResult.category, 80),
    score: scoreValue(rawResult.score),
  };
  const parsed = searchResultSchema.safeParse(candidate);

  return parsed.success ? parsed.data : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  const text = stringValue(value)?.trim();

  if (text === undefined || text.length === 0) {
    return null;
  }

  return text.slice(0, maxLength);
}

function boundedNullableString(value: unknown, maxLength: number): string | null {
  const text = boundedString(value, maxLength);
  return text ?? null;
}

function firstString(primary: unknown, fallback: unknown): string | null {
  if (typeof primary === "string") {
    return primary;
  }

  if (Array.isArray(fallback)) {
    return fallback.find((value): value is string => typeof value === "string") ?? null;
  }

  return null;
}

function parsePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function scoreValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function displayUrl(value: string): string {
  const url = new URL(value);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.hostname}${path}`.slice(0, 500);
}

function durationBetween(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}
