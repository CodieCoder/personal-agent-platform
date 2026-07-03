# PAP-063 to PAP-065 Search Contracts and SearXNG Provider

Date: 2026-07-02
Status: Accepted for implementation
Tickets: PAP-063, PAP-064, PAP-065

## Scope

Add the Milestone 4.1 search foundation only:

- Provider-neutral search contracts in `@pap/contracts`.
- Provider-neutral `@pap/tools-search` package with provider interface, registry, search service,
  normalized search errors, and provider health access.
- Server-only validated SearXNG configuration.
- Typed SearXNG JSON adapter using only SearXNG JSON output.
- Search provider health check.
- Runtime composition-root registration for web and worker processes.

Do not add fetch, extraction, UI, capabilities, persistence, model calls, memory writes, scraping,
Crawlee, Firecrawl, browser automation, or scheduling.

## Decisions

- Create `packages/contracts/src/search.ts` for provider-neutral search schemas and export it from
  `@pap/contracts`.
- Create `@pap/tools-search` as the runtime-facing abstraction. It must not import
  `@pap/tools-search-searxng`, SearXNG config, fetch transport, web routes, runtime, storage, or
  capability packages.
- Create `@pap/tools-search-searxng` as the only concrete provider in this slice. It owns SearXNG
  config, transport, response parsing, mapping, and health behavior.
- Preserve useful Phase 3 conventions: package-local registries, provider-neutral service layer,
  typed package-local errors, injected transport for tests, and composition-root ownership.
- Do not force AI abstractions onto search. Search types, errors, health, and registry names remain
  search-specific.
- Runtime may expose provider-neutral search registry/service and health helpers, but no capability
  context search execution is added in this ticket range because the search capability and UI are
  later backlog items.
- Browser code, React route code, capabilities, and web routes must not instantiate SearXNG directly
  or access SearXNG config.
- All provider use is constructed from server-side composition roots and passed through
  provider-neutral `@pap/tools-search` interfaces.

## Contract Shapes

Add Zod contracts with inferred TypeScript types:

```ts
export const searchProviderIdSchema = stableIdentifierSchema;

export const searchProviderKindSchema = z.enum(["searxng"]);

export const searchProviderHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "unavailable",
  "disabled",
  "unknown",
]);

export const searchProviderErrorKindSchema = z.enum([
  "search_provider_disabled",
  "search_provider_unavailable",
  "search_provider_timeout",
  "search_provider_http_error",
  "search_provider_invalid_response",
  "search_provider_misconfigured",
]);

export const searchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    page: z.number().int().min(1).max(100).nullable().default(null),
    pageSize: z.number().int().min(1).max(50).default(10),
    language: z.string().trim().min(2).max(32).nullable().default(null),
    safesearch: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable().default(null),
    categories: z.array(z.string().trim().min(1).max(80)).max(8).nullable().default(null),
    timeRange: z.enum(["day", "month", "year"]).nullable().default(null),
    providerId: searchProviderIdSchema.nullable().default(null),
  })
  .strict();

export const searchResultSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    url: httpOrHttpsUrlSchema,
    displayUrl: z.string().trim().max(500).nullable(),
    snippet: z.string().trim().max(5_000).nullable(),
    publishedAt: isoDateTimeSchema.nullable(),
    engine: z.string().trim().max(120).nullable(),
    category: z.string().trim().max(80).nullable(),
    score: z.number().nonnegative().nullable(),
  })
  .strict();

export const searchResponseSchema = z
  .object({
    providerId: searchProviderIdSchema,
    query: z.string().trim().min(1).max(500),
    page: z.number().int().min(1).max(100),
    pageSize: z.number().int().min(1).max(50),
    results: z.array(searchResultSchema).max(50),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative().max(86_400_000),
    safety: searchSafetyMetadataSchema,
    warnings: z.array(searchWarningSchema).default([]),
  })
  .strict();
```

Use an HTTP/HTTPS-only URL schema that rejects unsupported schemes and URL credentials, then
normalizes accepted result URLs through `new URL(value).toString()`. Add search warning, safety
metadata, provider health, and provider error schemas with bounded message/details fields matching
the existing provider metadata style.

## Provider Interface And Registry

`@pap/tools-search` exposes:

```ts
export interface SearchProvider {
  readonly id: SearchProviderId;
  health(): Promise<SearchProviderHealth>;
  search(request: SearchRequest): Promise<SearchResponse>;
}

export interface SearchProviderRegistry {
  register(provider: SearchProvider): SearchProvider;
  get(providerId: SearchProviderId): SearchProvider;
  has(providerId: SearchProviderId): boolean;
  list(): SearchProvider[];
}

export interface SearchService {
  search(request: SearchRequest): Promise<SearchResponse>;
  getProviderHealth(providerId: SearchProviderId): Promise<SearchProviderHealth>;
  listProviderHealth(): Promise<SearchProviderHealth[]>;
}
```

- `createSearchProviderRegistry` mirrors the Phase 3 AI registry shape with search-specific typed
  errors: `search_provider_duplicate` and `search_provider_not_found`.
- `createSearchService` validates `searchRequestSchema`, resolves `providerId ?? defaultProviderId`,
  calls the selected provider, and validates `searchResponseSchema`.
- Provider execution errors use the search error kinds from `@pap/contracts`.
- Search service does not add retries, ranking, persistence, trace writing, memory writes, or
  fetch/extraction logic.

## SearXNG Mapping

Use SearXNG official Search API JSON output only.

Request:

- Method: `GET`.
- Path: `/search`.
- Query params: `q`, `format=json`, `pageno`, `language`, `safesearch`, `categories`, and
  `time_range`.
- `format=json` is always set by the adapter and is not configurable.
- Do not send `pageSize` to SearXNG. SearXNG does not expose a stable Search API page-size
  parameter, so PAP truncates normalized results to `pageSize` and records omitted counts in safety
  metadata.

Response:

- Validate the provider envelope as an object with a `results` array and passthrough provider fields.
- Validate and map individual usable results; omit individual unusable results with missing title or
  non-HTTP(S) URL and add a bounded warning.
- Fail with `search_provider_invalid_response` only when the envelope is not JSON or does not have
  the expected shape.
- Map `title -> title`.
- Map `url -> url` after HTTP/HTTPS validation and normalization.
- Derive `displayUrl` from normalized URL hostname plus pathname.
- Map `content -> snippet`.
- Map parseable `publishedDate` or `pubdate` values to ISO `publishedAt`; otherwise `null`.
- Map `engine` or the first `engines[]` entry to `engine`.
- Map `category -> category`.
- Map numeric `score -> score`; otherwise `null`.
- Never return or trace raw SearXNG payloads by default.

## SearXNG Config

`@pap/tools-search-searxng` owns server-only environment parsing:

```text
SEARXNG_BASE_URL=http://127.0.0.1:8080
SEARXNG_TIMEOUT_MS=15000
SEARXNG_ENABLED=true
SEARXNG_DEFAULT_LANGUAGE=en
SEARXNG_DEFAULT_SAFESEARCH=1
```

Validation rules:

- `SEARXNG_BASE_URL` must be HTTP or HTTPS.
- Allow only loopback hosts: `localhost`, `127.0.0.0/8`, and `::1`.
- Reject public hosts, RFC1918/private LAN hosts, `.local`, single-label Docker service names,
  credentials, query strings, hashes, and non-root paths.
- Normalize `baseUrl` to `URL.origin`.
- `SEARXNG_TIMEOUT_MS` is an integer bounded from `1_000` to `60_000`.
- `SEARXNG_DEFAULT_LANGUAGE` is a bounded non-empty string.
- `SEARXNG_DEFAULT_SAFESEARCH` is `0 | 1 | 2`.
- `SEARXNG_ENABLED=false` is allowed and returns disabled health/search errors without requiring a
  reachable SearXNG instance.
- Config is never included in `getBrowserSafeEnvironment`.

## Health Design

- Health is on-demand only; no startup probe, polling, scheduler, or background retry is added.
- Disabled provider returns `status: "disabled"` and search throws `search_provider_disabled`.
- Enabled health performs a bounded SearXNG JSON search probe with a harmless fixed query and
  `format=json`.
- Successful JSON envelope with a `results` array returns `healthy`.
- HTTP 403, HTML/non-JSON for `format=json`, or evidence that JSON output is disabled returns
  `status: "unavailable"` with `errorKind: "search_provider_misconfigured"`.
- Timeout returns `unavailable` metadata with `errorKind: "search_provider_timeout"`.
- Connection failure returns `unavailable` metadata with `errorKind: "search_provider_unavailable"`.
- Invalid JSON shape returns `degraded` or `unavailable` with
  `errorKind: "search_provider_invalid_response"` depending on whether the endpoint was otherwise
  reachable.
- Health metadata may include `checkedAt`, `errorKind`, `retryable`, and safe status counts only;
  it must not include provider URLs, raw responses, stack traces, or local infrastructure details.

## Files

- Add `packages/contracts/src/search.ts`.
- Update `packages/contracts/src/index.ts`.
- Update `packages/contracts/test/contracts.test.mjs`.
- Add `packages/tools-search/package.json`, `tsconfig.json`, `src/index.ts`,
  `src/search-provider.ts`, `src/registry.ts`, `src/service.ts`, `src/errors.ts`, and unit tests.
- Add `packages/tools-search-searxng/package.json`, `tsconfig.json`, `src/index.ts`,
  `src/config.ts`, `src/searxng-client.ts`, `src/searxng-provider.ts`, `src/health.ts`,
  `src/registration.ts`, and unit tests.
- Update `packages/runtime/src/runtime.ts` to accept and expose provider-neutral search
  registry/service access.
- Update runtime tests with fake search providers only.
- Update web and worker composition roots to construct and register the SearXNG search provider
  server-side.
- Update root `tsconfig.json` project references.
- Update `vitest.workspace.ts` include lists for the new unit tests.
- Update package manifests for new workspace dependencies.
- Update `.env.example` with server-only `SEARXNG_*` values.
- Update `pnpm-lock.yaml` only if package metadata changes require pnpm to refresh it.

## Dependencies

- Completed PAP-050 through PAP-062 Phase 3 provider packages, config patterns, registry patterns,
  runtime composition roots, contracts, and tests.
- Existing `@pap/contracts`, `@pap/runtime`, `@pap/shared`, web runtime server bootstrap, and worker
  runtime bootstrap.
- Node.js LTS fetch and AbortController APIs.
- Zod for contracts, config validation, and provider response validation.
- Official SearXNG docs for Search API JSON parameters and result shape:
  - https://docs.searxng.org/dev/search_api.html
  - https://docs.searxng.org/dev/result_types/main/mainresult.html
  - https://docs.searxng.org/admin/api.html

## Verification Commands

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/tools-search test`
- `pnpm --filter @pap/tools-search-searxng test`
- `pnpm --filter @pap/runtime test`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm lint`
- `pnpm format:check`

## Test Strategy

- Contract tests cover request bounds, nullable defaults, category bounds, time-range values,
  HTTP/HTTPS URL normalization, credential rejection, non-HTTP rejection, result shape, response
  shape, provider health, and provider errors.
- `@pap/tools-search` tests cover registry register/list/get/duplicate/missing behavior, default
  provider selection, request validation, response validation, and typed error guards.
- `@pap/tools-search-searxng` tests use injected mock fetch only; no live SearXNG or public network
  calls.
- SearXNG adapter tests cover exact query params, result mapping, truncation, invalid-result
  omission, disabled provider, connection refusal, timeout, HTTP errors, JSON-disabled or
  misconfigured response, non-JSON body, invalid JSON shape, and health states.
- Runtime tests use fake `SearchProvider` instances and the existing in-memory trace repository
  pattern. They must not import `@pap/tools-search-searxng`.

## Out Of Scope

- Fetch, guarded URL policy, redirects, content-type checks, response-size checks, extraction, source
  profiles, Readability, Crawlee, Firecrawl, browser automation, or scraping.
- Search/extraction capability, route, server function, UI, Playwright flow, or QA-Intel scenario.
- Persistence, web evidence storage, source-profile storage, trace-step integration for search tool
  execution, memory reads, memory writes, model calls, LLM ranking, research reports, scheduling, or
  Dockerized SearXNG.
- External cloud search providers.
- Browser access to SearXNG config, provider URL, provider transport, or direct web search calls.

## Risks And Assumptions

- The prompt path `docs/20-phase-4-search-and-web-extraction-backlog.md` is represented in this
  repository as `docs/backlogs/20-phase-4-search-and-web-extraction-backlog.md`.
- `timeRange` is limited to `day | month | year` because those are the documented SearXNG API
  values; `week` is not approximated in this slice.
- Strict loopback-only SearXNG config may need a documented revisit for self-hosted Docker Compose
  service names, but it matches the current ticket's safety constraint.
- SearXNG health checks can perform an actual local search, so health is explicitly on-demand and
  not scheduled.
- PAP result pagination is provider-neutral, but SearXNG page-size control is not stable; this slice
  truncates results after provider response normalization.
