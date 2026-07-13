import "@tanstack/react-start/server-only";

import { readFileSync } from "node:fs";
import {
  searchResponseSchema,
  type SearchProviderHealth,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
} from "@pap/contracts";
import { createSearchProviderRegistry, SearchProviderError } from "@pap/tools-search";
import type { SearchProviderRegistry } from "@pap/tools-search";
import {
  createGuardedFetchClient,
  createUrlSafetyPolicy,
  type GuardedFetchClient,
  type UrlSafetyPolicy,
  type WebFetchTransport,
} from "@pap/tools-web";

export const searchTestFixtureArticleUrl =
  "https://pap-fixture.example/articles/local-ai-engineering";
export const searchTestFixtureUnsafeUrl = "http://127.0.0.1/private";

const fixtureProviderId = "provider.searxng";
const fixedCheckedAt = "2026-07-03T09:00:00.000Z";

export function shouldUseSearchTestFixtures(input: {
  environment: string;
  rawEnv: Record<string, string | undefined>;
}): boolean {
  return (
    input.environment === "test" && input.rawEnv.PAP_SEARCH_TEST_FIXTURES?.toLowerCase() === "true"
  );
}

export function createSearchTestFixtureSearchProviderRegistry(input: {
  rawEnv: Record<string, string | undefined>;
}): SearchProviderRegistry {
  return createSearchProviderRegistry([
    {
      id: fixtureProviderId,
      health: async () => fixtureHealth(input.rawEnv),
      search: async (request) => fixtureSearch(request, input.rawEnv),
    },
  ]);
}

export function createSearchTestFixtureUrlSafetyPolicy(): UrlSafetyPolicy {
  return createUrlSafetyPolicy({
    resolveHostname: async (hostname) => {
      if (hostname === "pap-fixture.example") {
        return [{ address: "93.184.216.34", family: 4 }];
      }

      return [{ address: "93.184.216.34", family: 4 }];
    },
  });
}

export function createSearchTestFixtureGuardedFetchClient(input: {
  policy: UrlSafetyPolicy;
}): GuardedFetchClient {
  return createGuardedFetchClient({
    policy: input.policy,
    fetch: fixtureFetch,
  });
}

function fixtureHealth(rawEnv: Record<string, string | undefined>): SearchProviderHealth {
  if (fixtureHealthMode(rawEnv) === "unavailable") {
    return {
      providerId: fixtureProviderId,
      kind: "searxng",
      status: "unavailable",
      checkedAt: fixedCheckedAt,
      message: "Fixture search provider is unavailable.",
      metadata: {
        errorKind: "search_provider_unavailable",
        retryable: true,
      },
    };
  }

  return {
    providerId: fixtureProviderId,
    kind: "searxng",
    status: "healthy",
    checkedAt: fixedCheckedAt,
    message: "Fixture search provider is ready.",
  };
}

async function fixtureSearch(
  request: SearchRequest,
  rawEnv: Record<string, string | undefined>,
): Promise<SearchResponse> {
  if (fixtureHealthMode(rawEnv) === "unavailable") {
    throw new SearchProviderError({
      code: "search_provider_unavailable",
      providerId: fixtureProviderId,
      retryable: true,
      message: "Fixture search provider is unavailable.",
    });
  }

  const results = fixtureResults().slice(0, request.pageSize);

  return searchResponseSchema.parse({
    providerId: fixtureProviderId,
    query: request.query,
    page: request.page ?? 1,
    pageSize: request.pageSize,
    results,
    startedAt: "2026-07-03T09:00:00.000Z",
    completedAt: "2026-07-03T09:00:00.080Z",
    durationMs: 80,
    safety: {
      safesearch: request.safesearch,
      language: request.language,
      categories: request.categories,
      timeRange: request.timeRange,
      resultCount: results.length,
      omittedResultCount: 0,
      normalizedUrlCount: results.length,
    },
    warnings: [],
  });
}

function fixtureHealthMode(rawEnv: Record<string, string | undefined>): "healthy" | "unavailable" {
  const controlFile = rawEnv.PAP_SEARCH_TEST_FIXTURE_CONTROL_FILE;

  if (controlFile) {
    try {
      const parsed = JSON.parse(readFileSync(controlFile, "utf8")) as unknown;

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "health" in parsed &&
        parsed.health === "unavailable"
      ) {
        return "unavailable";
      }
    } catch {
      return rawEnv.PAP_SEARCH_TEST_FIXTURE_HEALTH === "unavailable" ? "unavailable" : "healthy";
    }
  }

  return rawEnv.PAP_SEARCH_TEST_FIXTURE_HEALTH === "unavailable" ? "unavailable" : "healthy";
}

const fixtureFetch: WebFetchTransport = async (input) => {
  const url = new URL(String(input));

  if (url.hostname !== "pap-fixture.example") {
    return new Response("Fixture not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain",
      },
    });
  }

  if (url.pathname === "/articles/local-ai-engineering") {
    const body = fixtureArticleHtml();

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(body)),
      },
    });
  }

  if (url.pathname === "/articles/plain-status") {
    const body = plainStatusArticleHtml();

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(body)),
      },
    });
  }

  return new Response("Fixture not found.", {
    status: 404,
    headers: {
      "content-type": "text/plain",
    },
  });
};

function fixtureResults(): SearchResult[] {
  return [
    {
      title: "Local AI engineering notes for deterministic agents",
      url: searchTestFixtureArticleUrl,
      displayUrl: "pap-fixture.example/articles/local-ai-engineering",
      snippet:
        "A fixture article about local-first agent engineering, deterministic search, and guarded extraction.",
      publishedAt: "2026-07-03T08:30:00.000Z",
      engine: "fixture",
      category: "general",
      score: 1,
    },
    {
      title: "Plain text fixture status",
      url: "https://pap-fixture.example/articles/plain-status",
      displayUrl: "pap-fixture.example/articles/plain-status",
      snippet: "A secondary text fixture used by the deterministic search provider.",
      publishedAt: null,
      engine: "fixture",
      category: "general",
      score: 0.7,
    },
    {
      title: "Blocked local-network control panel",
      url: searchTestFixtureUnsafeUrl,
      displayUrl: "127.0.0.1/private",
      snippet:
        "This visible fixture result is intentionally blocked by the server-side URL policy.",
      publishedAt: null,
      engine: "fixture",
      category: "unsafe-test",
      score: 0.2,
    },
  ];
}

function plainStatusArticleHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>Plain text fixture status</title>
    <link rel="canonical" href="https://pap-fixture.example/articles/plain-status" />
    <meta property="og:site_name" content="PAP Fixture Review" />
    <meta name="description" content="A secondary deterministic fixture for research tests." />
  </head>
  <body>
    <article>
      <h1>Plain text fixture status</h1>
      <p>
        Plain text extraction remains deterministic for Personal Agent Platform fixtures when
        external websites are not available. The secondary source describes local-first research
        runs, guarded network access, and workspace-scoped evidence review for repeatable tests.
      </p>
      <p>
        It gives automated research flows enough readable article text to exercise multi-source
        ranking without contacting public websites. The content intentionally repeats the ideas of
        bounded source handling, provenance, and deterministic report evidence.
      </p>
    </article>
  </body>
</html>`;
}

function fixtureArticleHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>Local AI engineering notes for deterministic agents</title>
    <link rel="canonical" href="${searchTestFixtureArticleUrl}" />
    <meta property="og:site_name" content="PAP Fixture Review" />
    <meta name="author" content="Fixture Desk" />
    <meta property="article:published_time" content="2026-07-03T08:30:00.000Z" />
    <meta name="description" content="A deterministic fixture for search and web extraction tests." />
  </head>
  <body>
    <nav>Fixture navigation</nav>
    <script>window.__fixtureSecret = true;</script>
    <article>
      <h1>Local AI engineering notes for deterministic agents</h1>
      <p>
        Personal Agent Platform uses deterministic search and guarded extraction before any model
        ranking or synthesis happens. The fixture article gives the runtime enough readable prose
        for Readability to identify a main article without reaching a public website.
      </p>
      <p>
        The implementation records search evidence, validates selected URLs, fetches only bounded
        public HTTP content, and extracts a compact content snapshot. This allows users to inspect
        trace steps and warnings while keeping raw HTML and unsafe network details out of browser
        responses.
      </p>
      <p>
        Workspace-scoped executions keep evidence linked to the selected workspace so separate
        projects can test search behavior without sharing trace history or persisted web evidence.
      </p>
    </article>
  </body>
</html>`;
}
