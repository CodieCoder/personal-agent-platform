import type {
  SearchCategory,
  SearchProviderId,
  SearchSafeSearch,
  SearchTimeRange,
} from "@pap/contracts";
import { isSearchProviderError, SearchProviderError } from "@pap/tools-search";
import { z } from "zod";

export type SearxngFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type SearxngClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetch?: SearxngFetch;
};

export type SearxngSearchInput = {
  providerId: SearchProviderId;
  query: string;
  page: number;
  language: string;
  safesearch: SearchSafeSearch;
  categories: SearchCategory[] | null;
  timeRange: SearchTimeRange | null;
  timeoutMs?: number;
};

const searxngResultSchema = z
  .object({
    title: z.unknown().optional(),
    url: z.unknown().optional(),
    content: z.unknown().optional(),
    publishedDate: z.unknown().optional(),
    pubdate: z.unknown().optional(),
    engine: z.unknown().optional(),
    engines: z.unknown().optional(),
    category: z.unknown().optional(),
    score: z.unknown().optional(),
  })
  .passthrough();

const searxngSearchResponseSchema = z
  .object({
    results: z.array(searxngResultSchema),
  })
  .passthrough();

export type SearxngResult = z.output<typeof searxngResultSchema>;
export type SearxngSearchResponse = z.output<typeof searxngSearchResponseSchema>;

export class SearxngClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchTransport: SearxngFetch;

  constructor(options: SearxngClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.fetchTransport = options.fetch ?? fetch;
  }

  async search(input: SearxngSearchInput): Promise<SearxngSearchResponse> {
    const response = await this.requestJson(input);
    const parsed = searxngSearchResponseSchema.safeParse(response);

    if (!parsed.success) {
      throw new SearchProviderError({
        code: "search_provider_invalid_response",
        providerId: input.providerId,
        message: "SearXNG JSON response did not match the expected search envelope.",
        details: {
          issues: summarizeZodIssues(parsed.error),
        },
      });
    }

    return parsed.data;
  }

  private async requestJson(input: SearxngSearchInput): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? this.timeoutMs);

    try {
      const response = await this.fetchTransport(buildSearchUrl(this.baseUrl, input), {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw httpProviderError(input.providerId, response.status);
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

      if (contentType !== "" && !contentType.includes("application/json")) {
        throw new SearchProviderError({
          code: "search_provider_misconfigured",
          providerId: input.providerId,
          message: "SearXNG did not return JSON. Ensure the local instance permits JSON output.",
          details: { responseKind: "non_json_content_type" },
        });
      }

      try {
        return await response.json();
      } catch (error) {
        throw new SearchProviderError({
          code: "search_provider_invalid_response",
          providerId: input.providerId,
          message: "SearXNG returned malformed JSON.",
          details: { responseKind: "http_json" },
          cause: error,
        });
      }
    } catch (error) {
      if (isSearchProviderError(error)) {
        throw error;
      }

      throw normalizeTransportError(error, input.providerId, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildSearchUrl(baseUrl: string, input: SearxngSearchInput): string {
  const url = new URL("/search", `${baseUrl}/`);

  url.searchParams.set("q", input.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageno", String(input.page));
  url.searchParams.set("language", input.language);
  url.searchParams.set("safesearch", String(input.safesearch));

  if (input.categories !== null && input.categories.length > 0) {
    url.searchParams.set("categories", input.categories.join(","));
  }

  if (input.timeRange !== null) {
    url.searchParams.set("time_range", input.timeRange);
  }

  return url.toString();
}

function httpProviderError(providerId: SearchProviderId, httpStatus: number): SearchProviderError {
  if (httpStatus === 403 || httpStatus === 406) {
    return new SearchProviderError({
      code: "search_provider_misconfigured",
      providerId,
      retryable: false,
      message: "SearXNG rejected the JSON search request. Verify JSON output is enabled.",
      details: { httpStatus },
    });
  }

  return new SearchProviderError({
    code: "search_provider_http_error",
    providerId,
    retryable: httpStatus >= 500,
    message: "SearXNG returned an HTTP error.",
    details: { httpStatus },
  });
}

function normalizeTransportError(
  error: unknown,
  providerId: SearchProviderId,
  aborted: boolean,
): SearchProviderError {
  if (aborted || getErrorName(error) === "AbortError" || getErrorCode(error) === "ETIMEDOUT") {
    return new SearchProviderError({
      code: "search_provider_timeout",
      providerId,
      retryable: true,
      message: "SearXNG search request timed out.",
    });
  }

  return new SearchProviderError({
    code: "search_provider_unavailable",
    providerId,
    retryable: true,
    message: "SearXNG search provider is unavailable.",
  });
}

function getErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return undefined;
  }

  return typeof error.name === "string" ? error.name : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return getErrorCode(error.cause);
  }

  return undefined;
}

function summarizeZodIssues(error: z.ZodError): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
