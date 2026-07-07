# PAP-075 to PAP-077 Search Test UI and Coverage

Date: 2026-07-03
Status: Accepted for implementation
Tickets: PAP-075, PAP-076, PAP-077

## Scope

Add the Milestone 4.5 web experience and coverage slice only:

- `/search-test` route for controlled manual search and extraction testing.
- Server-only search provider health and search/extract execution actions.
- Search provider health display.
- Search result list with title, domain/display URL, snippet, and source metadata.
- Explicit user selection and explicit extraction action.
- Extracted document preview with method, metadata, bounded content, warnings, and execution links.
- Safe loading, warning, provider-unavailable, unsafe URL, and execution failure states.
- Unit/integration coverage for the web server-function boundary and test fixture composition.
- Playwright coverage for user-visible search, selection, extraction, trace opening, provider failure, unsafe URL failure, and workspace isolation.
- QA-Intel feature coverage using deterministic local fixtures.

Do not add chat UI, autonomous result selection, model ranking, summarization, research reports,
direct browser-to-SearXNG requests, direct browser-to-public-web fetches, browser automation,
Crawlee, Firecrawl, scheduling, source-profile management UI, memory writes, or additional runtime
capabilities.

## Decisions

- Use `capability.search-extract-test` as the only execution path. The UI and server functions must
  not import SearXNG, native fetch transports, Readability, source-profile repositories, or SQLite
  directly beyond existing composition-root access.
- Keep search and extraction as two explicit executions:
  - Search submits `{ query, workspaceId? }` without `selectedUrl`.
  - Extraction submits `{ query, selectedUrl, workspaceId? }` after the user selects a visible result.
- Do not preselect a result. Selection remains client state until the user clicks an explicit
  select action.
- Preserve PAP-074 selected-URL validation. The extraction execution reruns search server-side and
  accepts only URLs returned by search or an explicitly injected test allowlist.
- Browser code may call only TanStack Start server functions. All provider health, search, URL
  validation, fetch, extraction, and evidence persistence happen server-side through runtime.
- Keep the visual language aligned with existing trace-first pages: page header, workspace grid,
  section panels, status pills, result boxes, trace metadata rows, and text links.
- Extend execution detail trace metadata display only with safe Phase 4 keys already produced by
  runtime traces. Do not render raw payloads, raw HTML, cookies, headers, stack traces, or raw
  provider responses.

## Route, Components, and Server Functions

Add `apps/web/src/routes/search-test.tsx` with:

- `validateSearch` for optional `workspaceId`.
- Loader fetching search provider status and workspaces.
- A query form with workspace selector.
- A provider health aside.
- A result list.
- A selected-result panel and explicit extract button.
- An extracted document preview.
- Search and extraction execution detail links.

Add `apps/web/src/features/search-test/`:

- `types.ts`: app-local result types, safe errors, provider status shape, and parsed
  search/extract execution results.
- `operations.ts`: testable operations for provider health, search execution, and extraction
  execution.
- `server.ts`: TanStack Start server functions that delegate to operations with
  `getWebRuntimeState()`.
- `components.tsx`: route-local UI components for provider health, result list, selected result,
  warnings, and document preview.

Server functions:

- `getSearchProviderStatus` uses `runtime.getSearchProviderHealth("provider.searxng")` or the
  configured default search provider if a runtime accessor already exposes it safely.
- `runSearchTest` validates a bounded query plus optional workspace ID, runs
  `capability.search-extract-test` without `selectedUrl`, parses the capability output, and returns
  search results plus `executionId`/`traceId`.
- `extractSearchTestResult` validates query, selected URL, and optional workspace ID, runs
  `capability.search-extract-test` with `selectedUrl`, parses the capability output, and returns
  document preview data plus `executionId`/`traceId`.

Update shared app surfaces:

- Add a top-nav link to `/search-test`.
- Regenerate `apps/web/src/routeTree.gen.ts`.
- Add safe Phase 4 metadata keys to the execution detail allowlist:
  `query`, `resultCount`, `selectedUrl`, `selectedResultIndex`, `selectionSource`, `finalUrl`,
  `statusCode`, `contentType`, `extractionMethod`, `sourceProfileId`, `warningCount`,
  `failureCategory`, `matched`, `searchEvidenceId`, `fetchEvidenceId`, `extractionEvidenceId`,
  `evidenceCount`, and `status`.

## State Flow and UI States

Search state:

- Initial state shows empty results and current provider health.
- Search submit clears previous selected result, document preview, warnings, and action errors.
- While pending, disable the search button, set `aria-busy`, and render a `role="status"` loading
  result box.
- Success stores normalized results, search warnings, and the search execution link.
- Failure renders only safe error code/message and any available failed execution link.

Selection and extraction state:

- Each result has an explicit select button.
- The selected result panel shows the selected title, URL, result index, snippet, and source
  metadata.
- Extract is disabled until a result is selected and no extraction is pending.
- Extraction submit sends the original query, selected URL, and workspace ID to the server.
- Success renders method, title, byline, site, published date, canonical/final URL, word count,
  source profile ID when present, warnings, bounded content snapshot, and extraction execution link.
- Failure renders safe error code/message and a failed execution detail link when present.

Provider health states:

- `healthy`: status pill plus actionable ready text.
- `degraded` or `unknown`: warning pill and safe provider message.
- `disabled` or `unavailable`: error/warning pill, safe remediation text, search button remains
  usable only if the server action can safely return a capability failure with trace evidence.
- server status failure: route still renders the safe error panel without crashing.

Warnings:

- Render merged search, fetch, and extraction warnings as bounded rows containing code, message, and
  optional count.
- Keep warning text from typed contracts only.

## Fixture and Test Runtime Design

Add test-only fixture composition gated by both:

```text
PAP_ENVIRONMENT=test
PAP_SEARCH_TEST_FIXTURES=true
```

Fixture behavior:

- Register a provider-neutral mock search provider under `provider.searxng` with `kind: "searxng"`.
- Return deterministic health for normal tests and a deterministic unavailable health state when
  `PAP_SEARCH_TEST_FIXTURE_HEALTH=unavailable`.
- Return public-looking fixture results for normal queries, including
  `https://pap-fixture.example/articles/local-ai-engineering`.
- Return or include `http://127.0.0.1/private` for an unsafe URL scenario so the user can select a
  visible result and the server-side URL policy fails safely.
- Use an injected guarded fetch transport that serves deterministic HTML/plain-text fixture content
  for `pap-fixture.example` without network I/O.
- Use an injected DNS resolver or policy setup that treats `pap-fixture.example` as public-safe in
  test mode only.
- Keep source-profile service and SQLite repositories real against the isolated test database so
  Readability fallback, warnings, evidence persistence, and trace links remain representative.

The fixture code should live in app-local test/composition helpers, not in browser code and not in
production provider packages.

## Isolated SQLite Strategy

- Continue using `createTemporarySqliteDatabase` for Vitest operation/integration tests.
- Continue Playwright's temp database setup through `PAP_E2E_DATABASE_URL`.
- Continue QA-Intel's temp database setup in `qa/runner/src/index.ts`.
- Seed only deterministic workspaces and any source-profile records required for a specific test.
- Do not depend on `apps/web/data/pap.db`, prior fixture data, a live SearXNG instance, or a public
  website.

## Files

Expected app files:

- Add `apps/web/src/routes/search-test.tsx`.
- Add `apps/web/src/features/search-test/types.ts`.
- Add `apps/web/src/features/search-test/operations.ts`.
- Add `apps/web/src/features/search-test/server.ts`.
- Add `apps/web/src/features/search-test/components.tsx`.
- Update `apps/web/src/routes/__root.tsx`.
- Update `apps/web/src/features/executions/components.tsx`.
- Update `apps/web/src/features/executions/runtime.server.ts` for test fixture composition.
- Update `apps/web/src/routeTree.gen.ts`.
- Update `apps/web/src/styles/global.css` only for small reusable search-result/document-preview
  classes that preserve existing styling.

Expected test files:

- Add `apps/web/test/search-test-operations.test.mjs`.
- Update `e2e/playwright.config.ts` fixture environment.
- Update `e2e/execution-trace.spec.ts` or add `e2e/search-test.spec.ts`.
- Add `qa/features/search-web-extraction.feature`.
- Update `qa/runner/src/index.ts` fixture environment and seed helpers.
- Update `qa/results/*.json` only when test commands intentionally refresh checked result artifacts.

## Dependencies

- Completed PAP-063 to PAP-074 implementation.
- Existing TanStack Start route/server-function patterns.
- Existing workspace selector and workspace repository.
- Existing execution detail and trace metadata components.
- Existing `capability.search-extract-test` input/output schemas.
- Existing runtime server composition root.
- Existing temporary SQLite helper, Playwright harness, and QA-Intel runner.

No new external runtime dependency is planned.

## Scripts and Verification Commands

Targeted checks:

```text
pnpm --filter @pap/web typecheck
pnpm test:integration -- --project=integration apps/web/test/search-test-operations.test.mjs
pnpm test:e2e
pnpm test:qa
```

Full verification:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:qa
git diff --check
```

## Test Plan

Unit/integration coverage:

- Provider health operation maps healthy/unavailable fixture health to safe UI status.
- Search operation validates input, executes search-only capability, parses output, returns results,
  warnings, evidence ID, and execution link.
- Extraction operation validates selected URL, executes selected extraction, parses document output,
  returns method, metadata, warnings, evidence IDs, and execution link.
- Invalid query, invalid workspace ID, invalid selected URL, workspace mismatch, unavailable
  provider, unsafe selected URL, and malformed output return safe errors.
- Tests assert no memory write path is called.
- Tests assert no raw HTML, cookies, authorization headers, raw provider payloads, or stack traces
  appear in returned UI data.

Playwright scenarios:

- Search provider healthy state renders on `/search-test`.
- User searches for `local AI engineering` and sees normalized fixture results.
- User explicitly selects an eligible result and then requests extraction.
- Extracted document preview shows title/content snapshot, method, warnings, and execution detail
  link.
- User opens execution detail and sees search, fetch, extraction, and evidence trace metadata.
- Provider unavailable state shows a safe message and failure trace link after attempted search.
- User selects an unsafe fixture result and sees a safe URL policy error plus failed trace evidence.
- Workspace-scoped search/extraction links and history remain isolated from another seeded workspace.

QA-Intel feature:

- Add `Feature: Search and web extraction`.
- Scenario 1: user searches and extracts a readable fixture article, sees content, method,
  completed status, and trace text for search/fetch/extraction/evidence.
- Scenario 2: user selects an unsafe local-network fixture URL, sees a safe URL policy error, failed
  status, and trace text for URL policy evidence.
- Keep scenarios written in the existing strict QA-Intel Gherkin style and use only seeded local
  fixtures.

## Out Of Scope

- New runtime capability behavior beyond `capability.search-extract-test`.
- Generative UI packages or json-render integration.
- Chat, research report UI, model ranking, summarization, source credibility scoring, or LLM calls.
- Direct browser calls to SearXNG, fixture fetch endpoints, localhost article servers, or public web
  pages.
- Source-profile management UI, automatic source-profile learning, or source-profile persistence
  changes unless a test needs a seeded read-only profile.
- Memory writes, memory proposal workflows, or Memory Explorer changes.
- Browser automation extraction, Playwright extraction, Crawlee, Firecrawl, multi-page crawling,
  retries, rate limiting, robots policy, scheduler, or background jobs.
- Dockerized SearXNG/Ollama changes, reverse proxy changes, deployment publishing, or external cloud
  providers.

## Risks and Assumptions

- The plan path requested in the prompt maps to the repository's active
  `docs/backlogs/20-phase-4-search-and-web-extraction-backlog.md`.
- Two executions for search and extraction are acceptable for PAP-075 because PAP-074 owns
  selected-URL validation and evidence persistence. A future UI may collapse this into a single
  action flow after a dedicated action/session contract exists.
- Test fixture composition is server-only and available only when both test-mode flags are enabled.
- The route tree is generated and checked in, so adding the route must update `routeTree.gen.ts`.
