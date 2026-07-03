# Personal Agent Platform — Phase 4 Search and Web Extraction Backlog

**Status:** Draft execution backlog

**Depends on:**
- `01-product-foundation.md`
- `02-product-principles.md`
- `04-runtime-and-contracts.md`
- `05-capability-system.md`
- `06-tool-system.md`
- `08-policy-and-approval-model.md`
- `15-architecture-decision-records.md`
- `19-phase-3-ollama-provider-backlog.md`

**Purpose:** Add deterministic local search and web extraction foundations for future research workflows. This phase introduces SearXNG search, guarded HTTP fetching, Readability-based extraction, source profiles, persisted extraction evidence, and a controlled manual test surface.

---

## 1. Phase Objective

Phase 4 proves PAP can safely retrieve external public information before any model ranking, summarization, research reporting, or automatic memory creation.

Completed vertical slice:

```text
User enters search query
→ PAP calls local SearXNG
→ normalized results are returned
→ user chooses a result URL
→ PAP fetches the URL with network safeguards
→ PAP extracts readable article content
→ trace records search, fetch, extraction method, timing, and warnings
→ extracted result can be inspected
```

This phase must not add:

- LLM ranking or synthesis
- Research reports
- Automatic memory writes
- Schedulers
- Crawlee
- Firecrawl
- Playwright browser extraction
- Browser automation
- Email
- Document ingestion
- Vector retrieval
- Embeddings
- External cloud search providers
- Approval-rule UX
- Generative UI

---

## 2. Product Rules

- Search, fetch, and extraction are deterministic tools, not model behavior.
- Untrusted web content must never determine tool permissions, runtime policy, or prompts.
- Search and extraction must emit bounded, typed outputs.
- All network activity must be visible in execution traces.
- Failed fetches and extraction failures must be inspectable without exposing unsafe raw data by default.
- Plain HTTP extraction is the default path.
- Source profiles may improve extraction for known domains, but generic extraction remains the fallback.
- Browser rendering is deferred until observed failure patterns justify it.
- No automatic memory writes occur in this phase.

---

## 3. Proposed Package Boundaries

```text
packages/
  contracts/
    search.ts
    web.ts
    source-profile.ts

  tools-search/
    search-provider.ts
    errors.ts
    registry.ts
    index.ts

  tools-search-searxng/
    config.ts
    searxng-client.ts
    searxng-provider.ts
    health.ts
    index.ts

  tools-web/
    fetch-policy.ts
    fetch-client.ts
    extraction.ts
    errors.ts
    index.ts

  tools-web-readability/
    readability-extractor.ts
    html-normalization.ts
    index.ts

  source-profiles/
    service.ts
    index.ts

  capabilities/
    search-extract-test/
      SKILL.md
      schemas.ts
      capability.ts
      index.ts
```

### Boundary Rules

`@pap/tools-search`

- Provider-neutral search interfaces.
- Normalized search contracts and errors.
- Search provider registry.
- No SearXNG HTTP-specific code.

`@pap/tools-search-searxng`

- Local SearXNG config and transport.
- SearXNG JSON response mapping.
- Search provider health.
- No capability-specific behavior.

`@pap/tools-web`

- URL validation and fetch policy.
- Redirect, timeout, response-size, content-type, and private-network guards.
- Normalized fetch and extraction contracts.
- No source-specific CSS selectors.

`@pap/tools-web-readability`

- Generic HTML parsing and readability extraction.
- HTML cleanup and metadata normalization.
- No network requests.
- No source-profile persistence.

`@pap/source-profiles`

- Source profile contracts and persistence orchestration.
- Domain-specific selector configuration.
- Profile lookup and bounded selector extraction.
- No LLM behavior.

`@pap/capability-search-extract-test`

- Declares input/output contracts.
- Uses search and extraction abstractions only.
- Never imports SearXNG or Readability transports directly.
- Creates no automatic memory records.

---

# Milestone 4.1 — Search Contracts and SearXNG Adapter

## PAP-063 — Add Search Contracts

**Goal:** Define provider-neutral search contracts in `@pap/contracts`.

### Scope

- Search provider identifier.
- Search request schema.
- Search result schema.
- Search response schema.
- Search provider health schema.
- Search error schema.
- Search pagination fields.
- Search safety metadata.

### Required Search Request Fields

```text
query
page nullable
pageSize
language nullable
safesearch nullable
categories nullable
timeRange nullable
providerId nullable
```

### Required Search Result Fields

```text
title
url
displayUrl nullable
snippet nullable
publishedAt nullable
engine nullable
category nullable
score nullable
```

### Acceptance Criteria

- All contracts use Zod.
- Query, page size, categories, and time range are bounded.
- URLs are validated and normalized as HTTPS/HTTP only.
- Search results are provider-neutral.
- No SearXNG HTTP code is added.

### Depends On

```text
PAP-004
PAP-050
```

---

## PAP-064 — Add SearXNG Configuration Contract

**Goal:** Define validated server-only local SearXNG configuration.

### Scope

```text
SEARXNG_BASE_URL
SEARXNG_TIMEOUT_MS
SEARXNG_ENABLED
SEARXNG_DEFAULT_LANGUAGE
SEARXNG_DEFAULT_SAFESEARCH
```

### Default Values

```text
SEARXNG_BASE_URL=http://127.0.0.1:8080
SEARXNG_TIMEOUT_MS=15000
SEARXNG_ENABLED=true
SEARXNG_DEFAULT_LANGUAGE=en
SEARXNG_DEFAULT_SAFESEARCH=1
```

### Constraints

- Base URL defaults to loopback only.
- Do not silently allow public SearXNG endpoints.
- Configuration is server-only.
- Timeouts and page sizes are bounded.
- Search output format must be explicitly configured as JSON.

### Acceptance Criteria

- Invalid config fails safely at construction/startup.
- Disabled provider returns typed unavailable state.
- Default configuration cannot be imported by browser code.
- Config clearly explains that the SearXNG instance must permit JSON output.

### Depends On

```text
PAP-063
```

---

## PAP-065 — Implement SearXNG Search Provider

**Goal:** Add a local SearXNG JSON adapter implementing the provider-neutral search interface.

### Scope

- Typed non-streaming `GET /search` or `GET /` request.
- `format=json` request handling.
- Query parameter mapping.
- Search-result normalization.
- Provider health check.
- Timeout and error normalization.
- Search provider registry/composition-root wiring.

### Failure Categories

```text
search_provider_disabled
search_provider_unavailable
search_provider_timeout
search_provider_http_error
search_provider_invalid_response
search_provider_misconfigured
```

### Acceptance Criteria

- Search results are normalized to PAP contracts.
- Connection refusal maps to `search_provider_unavailable`.
- Timeout maps to `search_provider_timeout`.
- Invalid JSON/response shape maps to `search_provider_invalid_response`.
- A JSON-disabled SearXNG response is reported as a safe configuration issue.
- Search providers are registered from one composition root.
- Capabilities and web routes cannot instantiate SearXNG directly.

### Depends On

```text
PAP-064
PAP-051
```

---

# Milestone 4.2 — Safe Fetch Foundation

## PAP-066 — Add URL Fetch Contracts and Fetch Policy

**Goal:** Define safe, bounded web-fetch contracts.

### Scope

- Fetch request schema.
- Fetch result schema.
- Fetch metadata schema.
- Redirect chain schema.
- Fetch warning schema.
- Fetch error schema.
- URL safety policy interface.

### Required Fetch Request Fields

```text
url
timeoutMs nullable
maxBytes nullable
allowRedirects nullable
maxRedirects nullable
acceptedContentTypes nullable
workspaceId nullable
sourceProfileId nullable
```

### Required Fetch Result Fields

```text
requestedUrl
finalUrl
statusCode
contentType nullable
contentLength nullable
html nullable
text nullable
redirects
startedAt
completedAt
durationMs
warnings
```

### Safety Rules

- HTTP and HTTPS only.
- Reject localhost and private-network destinations by default.
- Reject credentials in URLs.
- Reject unsupported schemes.
- Limit redirects.
- Limit response size.
- Limit accepted content types.
- Never execute fetched scripts.
- Do not forward browser cookies or local auth state.

### Acceptance Criteria

- Fetch policy is testable independently of network transport.
- Unsafe URLs fail with typed safe errors.
- Private-network checks cover loopback, link-local, and RFC1918 ranges.
- Fetch contracts do not expose raw headers by default.
- No actual HTTP fetch client is added.

### Depends On

```text
PAP-004
PAP-063
```

---

## PAP-067 — Implement Guarded HTTP Fetch Client

**Goal:** Fetch public web content with deterministic safeguards.

### Scope

- Native fetch or Undici-compatible transport.
- AbortController timeout handling.
- Manual redirect validation.
- Content-type validation.
- Content-length guard.
- Streaming/body-size guard when length header is absent.
- Safe error normalization.
- Basic response metadata extraction.

### Failure Categories

```text
fetch_url_invalid
fetch_url_blocked
fetch_timeout
fetch_redirect_limit
fetch_redirect_blocked
fetch_http_error
fetch_content_type_unsupported
fetch_response_too_large
fetch_network_error
fetch_invalid_response
```

### Acceptance Criteria

- All redirects are validated against the fetch policy.
- Oversized content is rejected before full buffering where possible.
- HTML and plain-text content are supported in Phase 4.
- PDFs, images, video, archives, and binary formats are rejected with typed errors.
- Network failure does not leak raw transport stack traces.
- Fetch result includes timing, final URL, redirects, warnings, and normalized body.
- No browser automation or JavaScript rendering is added.

### Depends On

```text
PAP-066
```

---

# Milestone 4.3 — Extraction and Source Profiles

## PAP-068 — Add Article Extraction Contracts

**Goal:** Define normalized extraction output and failure contracts.

### Scope

- Extraction request schema.
- Extracted document schema.
- Extraction metadata schema.
- Extraction warning schema.
- Extraction error schema.
- Extraction method enum.

### Required Extraction Methods

```text
source_profile
readability
plain_text
```

### Required Extracted Document Fields

```text
title nullable
byline nullable
siteName nullable
publishedAt nullable
language nullable
canonicalUrl nullable
excerpt nullable
contentText
contentHtml nullable
wordCount
method
warnings
```

### Acceptance Criteria

- Extracted text is bounded.
- Extraction output can represent partial success with warnings.
- Contract supports source-profile and generic extraction methods.
- No extraction implementation is added.

### Depends On

```text
PAP-066
```

---

## PAP-069 — Implement Generic Readability Extractor

**Goal:** Add deterministic generic article extraction with Mozilla Readability.

### Scope

- JSDOM-compatible DOM construction.
- Mozilla Readability parsing.
- HTML normalization.
- Plain-text fallback for valid text responses.
- Metadata normalization.
- Word-count and size bounds.
- Extraction warning generation.

### Extraction Rules

```text
1. Accept normalized HTML from guarded fetch client.
2. Build DOM without executing scripts.
3. Remove unsafe/non-content elements where needed.
4. Run Readability.
5. Normalize title, byline, site name, excerpt, and content.
6. Emit readability result when content is sufficient.
7. Fall back to bounded plain text only when appropriate.
8. Return typed failure when usable content cannot be extracted.
```

### Acceptance Criteria

- Readability extraction does not perform network requests.
- Generic extraction works against fixture HTML.
- Empty/low-quality extraction returns warning or typed failure.
- Scripts, iframes, forms, and event handlers are not retained in normalized output.
- Content length and word count are bounded.
- No source-specific selector logic is added.

### Depends On

```text
PAP-067
PAP-068
```

---

## PAP-070 — Add Source Profile Contracts, Schema, and Repository

**Goal:** Persist trusted domain-specific extraction profiles.

### Scope

- SourceProfile contracts.
- SQLite schema/migration.
- Repository interface.
- SQLite implementation.
- Create/get/list/update/archive profile operations.
- Domain uniqueness and matching rules.

### Required Profile Fields

```text
id
domain
name
status
articleContainerSelector nullable
titleSelector nullable
bylineSelector nullable
publishedAtSelector nullable
contentSelector nullable
canonicalUrlSelector nullable
notes nullable
createdAt
updatedAt
archivedAt nullable
```

### Constraints

- Profiles are configuration only.
- Profiles cannot execute arbitrary JavaScript.
- Selectors are bounded strings.
- Profiles are manually created/edited in Phase 4.
- No automatic profile learning.

### Acceptance Criteria

- Active profile lookup is deterministic by normalized hostname.
- Archived profiles are excluded by default.
- Repository returns typed domain records.
- Migration is additive and tested with temporary SQLite.
- No UI is required in this ticket.

### Depends On

```text
PAP-033
PAP-068
```

---

## PAP-071 — Implement Source-Profile Selector Extraction

**Goal:** Apply known-domain selectors before generic Readability fallback.

### Scope

- Profile lookup by final URL hostname.
- Selector-based title/content/metadata extraction.
- Bounded text normalization.
- Fallback to generic extractor.
- Extraction method and warning reporting.

### Fallback Policy

```text
1. Look up active source profile for final hostname.
2. If profile exists and required selector extraction succeeds:
   return source_profile method.
3. If profile missing or extraction insufficient:
   run generic Readability extraction.
4. If Readability cannot produce usable content:
   return bounded plain-text fallback when applicable.
5. Otherwise return typed extraction failure.
```

### Acceptance Criteria

- Profile extraction never blocks generic fallback.
- Invalid selector/profile produces a safe warning and fallback.
- Source-profile usage is visible in result metadata.
- No arbitrary code or browser automation is executed.
- Extraction result includes the final method used.

### Depends On

```text
PAP-069
PAP-070
```

---

# Milestone 4.4 — Persistence, Runtime Trace, and Capability

## PAP-072 — Persist Web Fetch and Extraction Evidence

**Goal:** Store bounded request/result metadata for inspection and future research provenance.

### Scope

- Search request/result persistence or execution-linked evidence model.
- Fetch/extraction evidence schema and repository.
- Source URL, final URL, extraction method, timestamps, warnings, status, and bounded content snapshot/reference.
- Link evidence to execution ID and workspace ID.

### Constraints

- Do not persist raw full HTML by default.
- Persist only bounded normalized extracted text or a content hash/reference according to storage limits.
- Never persist cookies, authorization headers, or local browser state.
- Storage policy must support future retention controls.

### Acceptance Criteria

- Completed or failed extraction is linked to an execution.
- Evidence can be retrieved by execution ID.
- Warnings and failure reason are inspectable.
- Workspace filters preserve isolation.
- SQLite tests use temporary databases.

### Depends On

```text
PAP-011
PAP-039
PAP-071
```

---

## PAP-073 — Add Search and Extraction Trace Integration

**Goal:** Make all tool activity inspectable in runtime traces.

### Required Trace Steps

```text
validate input
resolve search provider
search provider health check
search web
select URL
validate URL policy
fetch URL
resolve source profile
extract readable content
persist web evidence
finalize execution
```

### Trace Metadata

```text
providerId
query
resultCount
selectedUrl
finalUrl
statusCode
contentType
extractionMethod
sourceProfileId nullable
durationMs
warningCount
failureCategory nullable
```

### Acceptance Criteria

- Search and extraction trace steps are ordered and typed.
- Sensitive/raw response payloads are not shown by default.
- Success, partial success, and failure traces are distinguishable.
- Tool timing and warnings are visible in execution detail.
- No LLM/provider invocation occurs.

### Depends On

```text
PAP-072
PAP-015
```

---

## PAP-074 — Add `capability.search-extract-test`

**Goal:** Provide one controlled execution path for testing search and extraction.

### Capability ID

```text
capability.search-extract-test
```

### Input

```text
query
selectedUrl nullable
workspaceId nullable
```

### Behavior

```text
1. Validate input.
2. Search local SearXNG.
3. Return normalized results.
4. If selectedUrl is supplied:
   validate that it is a result URL or explicitly permitted test URL.
5. Fetch and extract selected URL.
6. Persist evidence.
7. Return normalized search and optional extracted document result.
```

### Output

```text
query
results
selectedResult nullable
document nullable
warnings
```

### Constraints

- No LLM ranking or summarization.
- No automatic memory writes.
- No arbitrary multi-page crawling.
- No browser rendering.
- No hidden side effects beyond bounded evidence persistence.

### Acceptance Criteria

- Capability runs through RuntimeExecutionService.
- Search-only execution can succeed.
- Search-plus-extraction execution can succeed.
- Unsupported or unsafe URL produces safe failure trace.
- No direct SearXNG, fetch, or Readability import exists in the capability package.

### Depends On

```text
PAP-065
PAP-073
```

---

# Milestone 4.5 — Web Experience and Tests

## PAP-075 — Add Search and Extraction Test UI

**Goal:** Provide a controlled manual-test screen.

### Route

```text
/search-test
```

### Required UI

- Search query input.
- Optional workspace selector.
- Search provider health badge.
- Run search button.
- Result list with title, domain, snippet, and source metadata.
- Select result action.
- Extract selected result action.
- Extracted document preview.
- Warnings/failure state.
- Execution trace link.

### Constraints

- No chat/research report interface.
- No autonomous result selection.
- No automatic model analysis.
- No direct browser-to-SearXNG or browser-to-site requests.
- No source profile management UI yet unless required for basic inspection.

### Acceptance Criteria

- User can run a search and inspect normalized results.
- User can select an eligible result and request extraction.
- User can see extraction method, metadata, bounded content preview, warnings, and trace link.
- Provider unavailable state is safe and actionable.
- Browser code never makes direct external web requests.

### Depends On

```text
PAP-074
```

---

## PAP-076 — Add Unit and Integration Tests

**Goal:** Verify search, fetch, extraction, profile, persistence, and trace behavior.

### Required Unit Tests

- SearXNG result mapping.
- JSON-disabled/misconfigured response handling.
- Search provider unavailable and timeout handling.
- URL policy: unsupported scheme, URL credentials, loopback, RFC1918, link-local, redirect to blocked host.
- Redirect limit.
- Content-type rejection.
- Content-size rejection.
- Readability extraction from fixture HTML.
- Plain-text fallback.
- Empty/insufficient extraction.
- Source-profile selector success and fallback.
- Invalid selector warning.
- Normalized provider/fetch/extraction errors.

### Required Integration Tests

- Search-only capability execution.
- Search-plus-extraction capability execution.
- Evidence persistence linked to execution and workspace.
- Ordered trace steps.
- Failure trace for unsafe URL.
- No memory writes.
- Workspace isolation.

### Acceptance Criteria

- Tests mock all external HTTP.
- Tests use isolated SQLite databases.
- No test relies on live SearXNG or public sites.
- No test depends on prior fixture data.

### Depends On

```text
PAP-074
```

---

## PAP-077 — Add Playwright and QA-Intel Coverage

**Goal:** Validate user-visible search/extraction behavior.

### Required Playwright Flows

- Search provider healthy state renders.
- User runs a search using mocked provider response.
- User sees normalized results.
- User selects a result and sees extracted document preview.
- User opens execution detail.
- Provider unavailable state shows safe error.
- Unsafe URL selection shows safe error.
- Workspace-scoped result/evidence remains isolated.

### Required QA-Intel Feature

```gherkin
Feature: Search and web extraction

  Scenario: User searches and extracts a readable article
    Given the Personal Agent Platform web app is running
    And the local search provider is available
    When the user searches for "local AI engineering"
    And the user selects an eligible result
    And the user requests extraction
    Then the user should see extracted article content
    And the extraction method should be visible
    And the execution status should be "completed"
    And the trace should include search, fetch, and extraction evidence

  Scenario: User selects an unsafe URL
    Given the Personal Agent Platform web app is running
    When the user submits a blocked local-network URL for extraction
    Then the user should see a safe URL policy error
    And the execution status should be "failed"
    And the trace should include URL policy evidence
```

### Acceptance Criteria

- Browser tests do not require live SearXNG or public websites.
- QA-Intel validates user-visible behavior and trace evidence.
- Failure artifacts include screenshots and traces.
- Fixtures are isolated and independent.

### Depends On

```text
PAP-075
PAP-076
```

---

## 4. Recommended Execution Order

```text
PAP-063
PAP-064
PAP-065

PAP-066
PAP-067

PAP-068
PAP-069
PAP-070
PAP-071

PAP-072
PAP-073
PAP-074

PAP-075
PAP-076
PAP-077
```

---

## 5. Suggested Codex Goal Batches

```text
Goal A:
PAP-063 to PAP-065
Search contracts, validated SearXNG config, provider adapter, registry wiring.

Goal B:
PAP-066 to PAP-067
URL fetch contracts, safety policy, guarded HTTP fetch client.

Goal C:
PAP-068 to PAP-071
Extraction contracts, generic Readability extraction, source profiles, selector fallback.

Goal D:
PAP-072 to PAP-074
Web evidence persistence, trace integration, search-extract test capability.

Goal E:
PAP-075 to PAP-077
Search/extraction UI, unit/integration tests, Playwright, QA-Intel validation.
```

---

## 6. Phase 4 Definition of Done

Phase 4 is complete when:

- PAP can query a local SearXNG instance through a provider-neutral adapter.
- Search output is normalized and schema-validated.
- PAP can safely fetch a public HTTP/HTTPS page with timeout, redirect, content-type, response-size, and network-destination guards.
- PAP can extract readable article content using source profiles or Mozilla Readability.
- Extraction method, timing, warnings, and failures are persisted and visible in execution traces.
- A user can manually search, select a result, and inspect extracted content in the web UI.
- Search/extraction evidence is workspace-scoped and execution-linked.
- No LLM ranking, research synthesis, automatic memory writes, Crawlee, Firecrawl, browser rendering, or scheduling exists.
- Unit, integration, browser, and QA-Intel tests pass.
