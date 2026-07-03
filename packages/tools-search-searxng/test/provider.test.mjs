import assert from "node:assert/strict";
import { test } from "vitest";
import { SearxngClient, SearxngProvider, defaultSearxngProviderId } from "../dist/index.js";

const providerId = defaultSearxngProviderId;

test("SearxngClient sends explicit JSON search query parameters", async () => {
  const calls = [];
  const client = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ results: [] });
    },
  });

  await client.search({
    providerId,
    query: "agent search",
    page: 2,
    language: "en",
    safesearch: 1,
    categories: ["general", "news"],
    timeRange: "day",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.accept, "application/json");
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "agent search");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("pageno"), "2");
  assert.equal(url.searchParams.get("language"), "en");
  assert.equal(url.searchParams.get("safesearch"), "1");
  assert.equal(url.searchParams.get("categories"), "general,news");
  assert.equal(url.searchParams.get("time_range"), "day");
});

test("SearxngProvider normalizes results, safe URLs, warnings, and page size", async () => {
  const provider = new SearxngProvider({
    providerId,
    config: enabledConfig(),
    clock: createClock(["2026-07-02T09:00:00.000Z", "2026-07-02T09:00:00.500Z"]),
    fetch: async () =>
      jsonResponse({
        results: [
          {
            title: "  First result  ",
            url: "https://Example.com/a path?q=1",
            content: "  Useful snippet.  ",
            publishedDate: "2026-07-01T08:00:00.000Z",
            engine: "duckduckgo",
            category: "general",
            score: 2,
          },
          {
            title: "Unsafe result",
            url: "ftp://example.com/file",
          },
          {
            title: "Second result",
            url: "http://example.org/",
            content: "",
            engines: ["brave"],
            pubdate: "not-a-date",
          },
        ],
      }),
  });

  const result = await provider.search({
    query: "  agent search  ",
    pageSize: 1,
    categories: ["general"],
    timeRange: "day",
  });

  assert.equal(result.providerId, providerId);
  assert.equal(result.query, "agent search");
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 1);
  assert.equal(result.durationMs, 500);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0], {
    title: "First result",
    url: "https://example.com/a%20path?q=1",
    displayUrl: "example.com/a%20path",
    snippet: "Useful snippet.",
    publishedAt: "2026-07-01T08:00:00.000Z",
    engine: "duckduckgo",
    category: "general",
    score: 2,
  });
  assert.equal(result.safety.language, "en");
  assert.equal(result.safety.safesearch, 1);
  assert.equal(result.safety.omittedResultCount, 2);
  assert.deepEqual(
    result.warnings.map((warning) => `${warning.code}:${warning.count}`),
    ["search_result_omitted:1", "search_result_truncated:1"],
  );
});

test("SearxngProvider returns disabled health and typed disabled search errors", async () => {
  const provider = new SearxngProvider({
    providerId,
    config: {
      ...enabledConfig(),
      enabled: false,
    },
  });

  assert.equal((await provider.health()).status, "disabled");
  await assert.rejects(
    () => provider.search({ query: "disabled" }),
    (error) => isSearchError(error, "search_provider_disabled", false),
  );
});

test("SearxngClient normalizes connection refusal, timeout, and HTTP errors", async () => {
  const unavailableClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      });
    },
  });

  await assert.rejects(
    () => searchWithClient(unavailableClient),
    (error) => isSearchError(error, "search_provider_unavailable", true),
  );

  const timeoutClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });

  await assert.rejects(
    () => searchWithClient(timeoutClient, { timeoutMs: 1 }),
    (error) => isSearchError(error, "search_provider_timeout", true),
  );

  const httpErrorClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async () => jsonResponse({ error: "busy" }, 503),
  });

  await assert.rejects(
    () => searchWithClient(httpErrorClient),
    (error) => isSearchError(error, "search_provider_http_error", true),
  );
});

test("SearxngClient reports JSON-format misconfiguration and invalid responses safely", async () => {
  const htmlClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async () => textResponse("<html>json disabled</html>", 200, "text/html"),
  });

  await assert.rejects(
    () => searchWithClient(htmlClient),
    (error) => isSearchError(error, "search_provider_misconfigured", false),
  );

  const forbiddenClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async () => jsonResponse({ error: "forbidden" }, 403),
  });

  await assert.rejects(
    () => searchWithClient(forbiddenClient),
    (error) => isSearchError(error, "search_provider_misconfigured", false),
  );

  const malformedJsonClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async () => textResponse("not-json", 200, "application/json"),
  });

  await assert.rejects(
    () => searchWithClient(malformedJsonClient),
    (error) => isSearchError(error, "search_provider_invalid_response", false),
  );

  const invalidEnvelopeClient = new SearxngClient({
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    fetch: async () => jsonResponse({ answers: [] }),
  });

  await assert.rejects(
    () => searchWithClient(invalidEnvelopeClient),
    (error) => isSearchError(error, "search_provider_invalid_response", false),
  );
});

test("SearxngProvider health maps transport and invalid-response states", async () => {
  const healthyProvider = new SearxngProvider({
    providerId,
    config: enabledConfig(),
    fetch: async () => jsonResponse({ results: [] }),
  });

  assert.equal((await healthyProvider.health()).status, "healthy");

  const unavailableProvider = new SearxngProvider({
    providerId,
    config: enabledConfig(),
    fetch: async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      });
    },
  });
  const unavailableHealth = await unavailableProvider.health();

  assert.equal(unavailableHealth.status, "unavailable");
  assert.equal(unavailableHealth.metadata.errorKind, "search_provider_unavailable");

  const invalidProvider = new SearxngProvider({
    providerId,
    config: enabledConfig(),
    fetch: async () => jsonResponse({ answers: [] }),
  });
  const invalidHealth = await invalidProvider.health();

  assert.equal(invalidHealth.status, "degraded");
  assert.equal(invalidHealth.metadata.errorKind, "search_provider_invalid_response");
});

async function searchWithClient(client, overrides = {}) {
  return client.search({
    providerId,
    query: "agent search",
    page: 1,
    language: "en",
    safesearch: 1,
    categories: null,
    timeRange: null,
    ...overrides,
  });
}

function enabledConfig() {
  return {
    enabled: true,
    baseUrl: "http://127.0.0.1:8080",
    timeoutMs: 15_000,
    defaultLanguage: "en",
    defaultSafesearch: 1,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function textResponse(body, status, contentType) {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
    },
  });
}

function createClock(timestamps) {
  const queue = [...timestamps];

  return () => new Date(queue.shift() ?? timestamps.at(-1));
}

function isSearchError(error, code, retryable) {
  return (
    typeof error === "object" &&
    error !== null &&
    error.name === "SearchProviderError" &&
    error.code === code &&
    error.retryable === retryable
  );
}
