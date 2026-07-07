# PAP-080 to PAP-082 Deterministic Research Preparation

Date: 2026-07-04
Status: Accepted for implementation
Tickets: PAP-080, PAP-081, PAP-082

## Scope

Add the deterministic preparation layer for Phase 5 research:

- Deterministic query planning from `ResearchRequest`.
- Search request construction from a query plan.
- Candidate source normalization from persisted/returned search evidence.
- Canonical URL deduplication and provenance preservation.
- Deterministic source selection and extraction-budget policy.
- Bounded, trace-ready metadata for query planning, candidate normalization, and source selection.

Do not add LLM calls, report synthesis, `capability.research`, UI, memory writes, crawling,
browser rendering, new external providers, source-profile learning, or storage migrations.

## Decisions

- Add a pure `@pap/research` workspace package. It owns deterministic research preparation logic
  and may depend only on `@pap/contracts`, `@pap/shared`, and Zod if needed.
- Keep PAP-080 to PAP-082 capability-free. The future research capability will call these helpers
  through the runtime workflow, but this slice does not register or execute a capability.
- Keep candidate and selection outputs provider-neutral. SearXNG remains behind existing search
  contracts and evidence records.
- Use stable hash-derived IDs for deterministic outputs. Do not use random IDs in query plans,
  normalized candidates, or selected-candidate outputs.
- Inject `createdAt` or a clock into query planning so exact output is testable.
- Store no new persistent records in this slice. Existing research report/source repositories are
  not used unless a later integration test needs to prove shape compatibility.
- Keep trace metadata compact. Trace helpers return counts, IDs, URLs/domains, warning counts, and
  safe fingerprints only; no snippets, extracted text, HTML, headers, prompts, model output, or raw
  provider payloads.

## Public Interfaces

Extend `packages/contracts/src/research.ts` with schemas and inferred types for:

- `researchCandidateProvenanceSchema`
- `normalizedResearchCandidateSourceSchema`
- `researchCandidatePoolSchema`
- `researchSelectedCandidateSourceSchema`
- `researchSourceSelectionSchema`

The new schemas must include:

- canonical URL and normalized hostname.
- first-seen query/result indexes.
- duplicate provenance entries.
- candidate rank and provider/search evidence linkage.
- selection rank and exclusion reason.
- bounded warnings using existing `researchWarningSchema`.

Add `packages/research` exports:

- `planResearchQueries(request, options)`
- `buildSearchRequests(plan, request, options)`
- `canonicalizeResearchUrl(url)`
- `normalizeResearchCandidates(input)`
- `selectResearchSources(input)`
- `buildQueryPlanTraceMetadata(plan)`
- `buildCandidatePoolTraceMetadata(pool)`
- `buildSourceSelectionTraceMetadata(selection)`

Do not modify runtime context, capability manifests, storage interfaces, or SQLite schema in this
slice.

## Deterministic Query Generation

Input:

- Parse with `researchRequestSchema`.
- Default `maxSources` to `5` when null.
- Default `maxSearchResults` to `20` when null.
- Maximum generated query count is `4`, within the existing `researchQueryPlanSchema` maximum of
  `8`.

Normalization:

- Apply Unicode NFKC normalization.
- Remove ASCII control characters.
- Collapse all whitespace to a single space.
- Trim leading/trailing whitespace.
- Normalize repeated punctuation spacing without changing word order.
- Enforce the existing `searchQuerySchema` 500-character limit by truncating at a word boundary.
- Emit a lower-snake-case research warning when truncation occurs.

Generation order:

1. Primary normalized question.
2. Question plus normalized focus, when `focus` is present.
3. Question plus deterministic time phrase, when `timeRange` is not null or `all`.
4. Question plus focus plus time phrase, when both focus and an applicable time phrase exist.

Time phrases:

- `day`: `today`
- `week`: `this week`
- `month`: `this month`
- `year`: `this year`
- `all`: no added phrase

Deduplication:

- Deduplicate query strings case-insensitively after normalization.
- Preserve the first generated query position.
- Query IDs are deterministic hashes of normalized request fields and query position.

Search request allocation:

- Treat `maxSearchResults` as the total raw search-result budget across all planned queries.
- Allocate page sizes by floor division across query count, then assign the remainder to earlier
  queries.
- Each search request uses page `null`, allocated `pageSize`, request language, categories, and a
  mapped search time range.
- Map research time range to search time range where supported: `day -> day`, `month -> month`,
  `year -> year`; `week` and `all` become `null` because current search contracts do not support
  them.

## URL Canonicalization

Canonicalization accepts only HTTP/HTTPS URLs that pass existing URL schemas.

Rules:

- Lowercase scheme and hostname.
- Strip a trailing hostname dot.
- Remove default ports `:80` for HTTP and `:443` for HTTPS.
- Preserve non-default ports.
- Remove username/password by rejecting URLs that contain credentials.
- Remove fragments.
- Normalize an empty path to `/`.
- Remove a trailing slash from non-root paths.
- Preserve percent-encoded path semantics through the standard `URL` parser.
- Sort remaining query parameters by key, then value.
- Drop tracking parameters: `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`, `mc_eid`,
  and `igshid`.
- Do not fetch, redirect-resolve, crawl, or inspect page content.

Duplicate key:

- Use the canonical URL string as the duplicate key.
- Use normalized hostname for domain diversity, with one leading `www.` stripped only for the
  diversity key.

## Candidate Normalization And Deduplication

Input:

- Query plan items.
- Completed or failed search evidence/response objects.

Ordering:

- Traverse by query-plan order, then search result index.
- Candidate rank is assigned when a canonical URL first appears.
- The first occurrence wins display title, URL, snippet, published date, engine/category, provider,
  and provider score.
- Later duplicate occurrences are appended to candidate provenance in encounter order.

Provenance:

- Preserve query ID, query text, search evidence ID when available, result index, provider ID,
  engine, category, score, and whether the occurrence was primary or duplicate.
- Preserve search warnings as candidate or pool warnings when safe and bounded.

Warnings:

- Invalid URL: omit the result and record `candidate_url_invalid`.
- Duplicate URL: collapse into the first candidate and record duplicate counts.
- Missing/empty title after cleanup: omit the result and record `candidate_title_missing`.
- Candidate pool truncation: record `candidate_pool_truncated`.

Candidate limits:

- Never return more than `maxSearchResults` normalized candidates.
- Never include more provenance entries than the raw result budget.

## Source Selection And Extraction Budget

Budget:

- `requestedSources = request.maxSources ?? 5`.
- `extractionBudget = min(requestedSources, candidateCount, 15)`.
- Return an empty selection with a warning when no candidates exist.

Domain diversity:

- Build domain buckets in candidate order using normalized diversity hostname.
- Diversity target is `min(extractionBudget, uniqueDomainCount, ceil(extractionBudget * 0.6))`.
- Pass 1 selects one representative from each domain in domain first-seen order until the diversity
  target is met.
- Pass 2 fills remaining slots from the full candidate order, skipping already selected canonical
  URLs.

Recency:

- Only applies when `request.timeRange` is present and candidates have `publishedAt`.
- Within each domain bucket, choose the newest valid `publishedAt`; ties use original candidate
  rank.
- Missing dates never beat valid dates for the domain representative, but can still be selected in
  the fill pass by original order.

Exclusions:

- Every non-selected candidate receives one deterministic reason:
  - `duplicate_canonical_url`
  - `budget_exhausted`
  - `domain_diversity_deferred`
  - `candidate_invalid`
- Selection and exclusion reasons are returned for trace and future report diagnostics.

Failure continuation:

- PAP-082 only selects the extraction budget. Later fetch/extraction orchestration must continue
  after individual source failures and mark source-level warnings/status.
- This ticket does not backfill replacement sources after a selected source fails.

## Ordering Guarantees

- Same parsed request plus same search responses produces byte-for-byte equivalent plan, candidate
  pool, and selection output except for explicitly injected timestamps.
- Query order is stable.
- Search request order is query-plan order.
- Raw result traversal is query order, then result index.
- Candidate ordering is first canonical URL occurrence.
- Duplicate provenance ordering is encounter order.
- Selection ordering is final selection rank.
- Exclusion ordering follows candidate rank.
- Trace metadata key names and counts are stable for identical inputs.

## Files

Expected package and config files:

- Add `packages/research/package.json`.
- Add `packages/research/tsconfig.json`.
- Add `packages/research/src/index.ts`.
- Add deterministic modules under `packages/research/src/` for query planning, URL
  canonicalization, candidate normalization, source selection, trace metadata, and errors.
- Add `packages/research/test/research.test.mjs`.
- Update `packages/contracts/src/research.ts` and contract tests for new schemas.
- Update `packages/contracts/src/index.ts` only if new exports are not already covered.
- Update root `tsconfig.json` and `vitest.workspace.ts` to include `@pap/research`.
- Update package references in apps/packages only if TypeScript project references require it.

No expected files:

- No `packages/capabilities/research`.
- No web routes/components.
- No worker scheduling changes.
- No storage interfaces, SQLite schema, migrations, or generated Drizzle artifacts.
- No source-profile, memory, AI, or runtime service changes unless type references require a narrow
  import update.

## Test Plan

Contract tests:

- New candidate provenance, normalized candidate, candidate pool, selected candidate, and selection
  schemas accept valid bounded data.
- Schemas reject unsafe/raw fields through strict parsing.
- Selection schemas reject invalid URLs, unbounded arrays, and invalid exclusion reasons.

Research package unit tests:

- Query normalization trims, collapses whitespace, removes control characters, truncates safely, and
  emits warnings.
- Focus/time variants are generated in exact order.
- Duplicate queries are removed case-insensitively.
- Stable query IDs do not change across runs.
- Search page-size allocation respects total `maxSearchResults`.
- Search time-range mapping handles unsupported `week` and `all`.
- URL canonicalization covers fragments, default ports, non-default ports, sorted query params,
  tracking params, trailing slash, credentials, unsafe schemes, encoded paths, and host casing.
- Candidate normalization collapses duplicates across queries, preserves first display metadata,
  preserves provenance, omits invalid results, and keeps stable ordering.
- Source selection covers all-same-domain, many-domain diversity, recency within domain, missing
  dates, ties, zero candidates, budget exhaustion, and stable exclusions.
- Trace metadata validates with `traceStepMetadataSchema` and stays within 25 keys.

Integration tests are not required in this slice unless contract wiring needs them. No test may
require live SearXNG, Ollama, public websites, network access, or a browser.

## Verification Commands

Targeted:

```text
pnpm --filter @pap/contracts test
pnpm --filter @pap/research test
pnpm --filter @pap/research typecheck
```

Full:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
git diff --check
```

## Dependencies

- Completed PAP-078 to PAP-079 research contracts and persistence baseline.
- Completed PAP-063 to PAP-065 search contracts and SearXNG provider.
- Completed PAP-072 to PAP-074 web evidence, runtime trace, and search/extract test capability.
- Existing Zod contracts, strict TypeScript settings, pnpm workspace, Vitest workspace, and trace
  metadata constraints.

## Out Of Scope

- LLM relevance ranking, source analysis, article analysis, or report synthesis.
- Citation validation or report completion.
- `capability.research` and capability registration.
- UI, routes, server functions, Playwright, or QA-Intel.
- Persistence changes, SQLite migrations, report/source writes, or evidence writes.
- Semantic or episodic memory writes or proposals.
- Crawling, browser rendering, JavaScript execution, retries, rate limiting, or robots policy.
- Docker, Compose, deployment, reverse proxy, SearXNG/Ollama service changes, or external cloud
  providers.

## Assumptions

- The uncommitted PAP-078 to PAP-079 implementation is the active baseline.
- `maxSearchResults` means total raw search results across planned queries.
- Search snippets are not factual evidence and are never used as support for report claims.
- PAP-082 source selection creates a deterministic extraction plan only; future tickets perform
  fetch/extraction and persistence through runtime web evidence APIs.
