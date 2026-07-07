# PAP-072 to PAP-074 Web Evidence and Search-Extract Test

Date: 2026-07-03
Status: Accepted for implementation
Tickets: PAP-072, PAP-073, PAP-074

## Scope

Add the Milestone 4.4 persistence, trace, and controlled capability slice only:

- Execution-linked web evidence persistence for search, fetch, and extraction.
- Bounded, safe evidence schemas and repository interfaces.
- SQLite evidence schema and additive migration.
- Workspace-aware evidence reads and writes.
- Runtime trace integration for deterministic search, URL validation, fetch, source-profile lookup,
  extraction, and evidence persistence.
- `capability.search-extract-test` contracts, skill, manifest, and implementation.
- Web and worker composition-root registration.

Do not add web UI, model ranking, summarization, research reports, memory writes, browser
automation, Crawlee, Firecrawl, scheduling, new public network providers, or automatic retention
jobs.

## Decisions

- Add `packages/contracts/src/web-evidence.ts` for evidence contracts and export it from
  `@pap/contracts`.
- Add `web.evidence.write` to `capabilityPermissionSchema`; keep memory permissions unchanged.
- Treat evidence as provenance storage, not semantic or episodic memory. Evidence IDs may later be
  referenced from memory `evidenceRefs`, but PAP-072 to PAP-074 must not write memory records.
- Add a provider-neutral `WebEvidenceRepository` to `@pap/storage`, with a SQLite implementation in
  `@pap/storage-sqlite`.
- Persist bounded normalized evidence only. Never persist raw SearXNG payloads, raw full HTML,
  cookies, authorization headers, custom request headers, browser state, or unsafe response bodies.
- Use explicit workspace filtering on evidence reads. Repository reads require
  `{ executionId, workspaceId: WorkspaceId | null }`; unscoped execution evidence is read with
  `workspaceId: null`.
- Validate evidence write links against the existing execution trace. If a trace has a workspace,
  the evidence row must use that same workspace ID. If a trace is unscoped, the evidence row must
  store `null`.
- Extend runtime with provider-neutral web operations in the capability context instead of adding a
  generic tool registry in this slice.
- Keep the new capability abstract: it may call runtime context methods only and must not import
  SearXNG, native fetch transports, source-profile repositories, Readability, or SQLite.
- Keep capability outputs evidence-safe because runtime stores output JSON in execution traces.

## Evidence Data Model and Migration

Add three SQLite tables with foreign keys to `execution_traces(id)` and cascade delete behavior
matching trace-owned evidence:

### `web_search_evidence`

- `id` text primary key.
- `execution_id` text not null references `execution_traces(id)`.
- `workspace_id` text nullable.
- `provider_id` text not null.
- `query` text not null.
- `request_json` text not null.
- `status` text not null, enum-compatible values `completed` or `failed`.
- `result_count` integer not null.
- `results_json` text not null, storing provider-neutral normalized results only, capped by search
  contracts.
- `warnings_json` text not null.
- `failure_category` text nullable.
- `failure_message` text nullable, bounded and safe.
- `started_at`, `completed_at`, `duration_ms`, `created_at`, `expires_at`.

Indexes:

- `web_search_evidence_execution_id_idx`
- `web_search_evidence_workspace_execution_idx`
- `web_search_evidence_created_at_idx`
- `web_search_evidence_expires_at_idx`

### `web_fetch_evidence`

- `id` text primary key.
- `execution_id` text not null references `execution_traces(id)`.
- `workspace_id` text nullable.
- `search_evidence_id` text nullable references `web_search_evidence(id)`.
- `selected_url_source` text not null: `search_result` or `explicit_test_allowlist`.
- `selected_result_index` integer nullable.
- `requested_url` text not null.
- `final_url` text nullable.
- `status` text not null, enum-compatible values `completed` or `failed`.
- `status_code` integer nullable.
- `content_type` text nullable.
- `content_length` integer nullable.
- `content_bytes` integer nullable.
- `body_sha256` text nullable.
- `redirects_json` text not null.
- `warnings_json` text not null.
- `failure_category` text nullable.
- `failure_message` text nullable, bounded and safe.
- `started_at`, `completed_at`, `duration_ms`, `created_at`, `expires_at`.

Indexes:

- `web_fetch_evidence_execution_id_idx`
- `web_fetch_evidence_workspace_execution_idx`
- `web_fetch_evidence_search_evidence_id_idx`
- `web_fetch_evidence_created_at_idx`
- `web_fetch_evidence_expires_at_idx`

### `web_extraction_evidence`

- `id` text primary key.
- `execution_id` text not null references `execution_traces(id)`.
- `workspace_id` text nullable.
- `fetch_evidence_id` text nullable references `web_fetch_evidence(id)`.
- `final_url` text not null.
- `status` text not null, enum-compatible values `completed` or `failed`.
- `extraction_method` text nullable: `source_profile`, `readability`, or `plain_text`.
- `source_profile_id` text nullable.
- `title`, `byline`, `site_name`, `published_at`, `canonical_url`, `excerpt` nullable and bounded.
- `word_count` integer nullable.
- `content_text_snapshot` text nullable, max 20,000 chars.
- `content_text_sha256` text nullable.
- `content_chars` integer nullable.
- `original_content_chars` integer nullable.
- `warnings_json` text not null.
- `failure_category` text nullable.
- `failure_message` text nullable, bounded and safe.
- `started_at`, `completed_at`, `duration_ms`, `created_at`, `expires_at`.

Indexes:

- `web_extraction_evidence_execution_id_idx`
- `web_extraction_evidence_workspace_execution_idx`
- `web_extraction_evidence_fetch_evidence_id_idx`
- `web_extraction_evidence_source_profile_id_idx`
- `web_extraction_evidence_created_at_idx`
- `web_extraction_evidence_expires_at_idx`

Migration conventions:

- Add Drizzle schema files under `packages/storage-sqlite/src/schema/`.
- Export the schema from `packages/storage-sqlite/src/schema/index.ts`.
- Generate and commit the next migration and snapshot after current `0005_dazzling_whiplash`.
- Keep migrations additive and idempotently applicable through `runMigrations`.
- Add temporary-SQLite integration tests that apply migrations twice.

## Retention and Snapshot Strategy

- Default retention marker: `expiresAt = createdAt + 30 days`.
- PAP-072 stores retention metadata only. No purge command, scheduler, background job, or UI is
  added.
- Search snapshots store normalized search request/response data only.
- Fetch snapshots store URL, redirect, timing, status, content metadata, warnings, and SHA-256 of
  fetched body text. They do not store body text or HTML.
- Extraction snapshots store a bounded normalized text excerpt/snapshot and hashes/counts for the
  complete normalized text. They do not store `contentHtml`.
- Failure evidence stores only safe failure category, retryability where available, bounded message,
  timing, and warnings.

## Execution-to-Evidence Linking

- Evidence rows are owned by an execution through `execution_id`.
- Evidence rows copy the execution workspace into `workspace_id` for efficient isolation filters.
- The repository validates that the referenced execution exists and that workspace linkage matches
  exactly.
- Evidence is retrievable by execution ID only with an explicit workspace filter:

```ts
getByExecution(input: {
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
}): Promise<WebEvidenceBundle>;
```

- The bundle returns arrays for search, fetch, and extraction evidence ordered by `createdAt`.
- `WebEvidenceBundle` is safe for server-side inspection and future UI use, but PAP-075 owns UI.

## Trace Design

Use existing ordered trace steps and bounded metadata. Do not expand `traceStepKindSchema`.

Required steps:

| Step | Kind | Metadata |
| --- | --- | --- |
| `validate input` | `validation` | runtime-owned |
| `resolve search provider` | `workflow` | `providerId` |
| `search provider health check` | `tool` | `providerId`, `healthStatus`, `failureCategory?`, `retryable?` |
| `search web` | `tool` | `providerId`, `query`, `resultCount`, `durationMs`, `warningCount`, `failureCategory?` |
| `select URL` | `workflow` | `selectedUrl?`, `selectedResultIndex?`, `selectionSource`, `resultCount` |
| `validate URL policy` | `tool` | `selectedUrl`, `durationMs`, `failureCategory?` |
| `fetch URL` | `tool` | `selectedUrl`, `finalUrl?`, `statusCode?`, `contentType?`, `durationMs`, `warningCount`, `failureCategory?` |
| `resolve source profile` | `tool` | `finalUrl`, `sourceProfileId`, `matched` |
| `extract readable content` | `tool` | `finalUrl`, `extractionMethod?`, `sourceProfileId`, `durationMs`, `warningCount`, `failureCategory?` |
| `persist web evidence` | `tool` | `searchEvidenceId?`, `fetchEvidenceId?`, `extractionEvidenceId?`, `evidenceCount`, `durationMs`, `failureCategory?` |
| `validate output` | `validation` | runtime-owned |
| `finalize execution` | `workflow` | runtime-owned |

Behavior:

- Search-only executions complete after search evidence persistence. `select URL` is emitted as
  `skipped` with `selectionSource: "none"`.
- Search-plus-extraction executions emit every step above in order.
- Failed search, selection, URL policy, fetch, extraction, or evidence persistence emits a failed
  step with safe metadata.
- Failed fetch or extraction attempts persist failed evidence when enough execution context exists.
- Sensitive/raw response payloads are never trace metadata.

## Runtime Integration

Extend `CapabilityExecutionContext` with a `web` object:

```ts
web: {
  resolveSearchProvider(): Promise<SearchProviderId>;
  getSearchProviderHealth(providerId: SearchProviderId): Promise<SearchProviderHealth>;
  search(input: SearchRequestInput): Promise<SearchResponse>;
  validateUrlPolicy(url: string): Promise<FetchUrl>;
  fetch(input: FetchRequestInput): Promise<FetchResult>;
  resolveSourceProfile(url: FetchUrl): Promise<SourceProfile | null>;
  extract(input: ExtractionRequestInput): Promise<ExtractedDocument>;
  persistEvidence(input: PersistWebEvidenceInput): Promise<PersistWebEvidenceResult>;
}
```

Runtime constructor additions:

- `searchService`
- `defaultSearchProviderId`
- `urlSafetyPolicy`
- `guardedFetchClient`
- `sourceProfileService`
- `webEvidenceRepository`

Permission behavior:

- `web.search` is required for provider health and search.
- `web.fetch` is required for URL policy validation, fetch, source-profile resolution, and
  extraction.
- `web.evidence.write` is required for evidence persistence.
- Missing runtime services fail with `RUNTIME_FEATURE_UNAVAILABLE`.

Error normalization:

- Search errors map to safe platform errors with category `tool` or `network`.
- Fetch errors map to safe platform errors with category `network`.
- Extraction errors map to safe platform errors with category `tool`.
- Evidence repository failures map to safe platform errors with category `storage`.
- Do not include raw stack traces, HTML, body text, headers, cookies, auth tokens, or provider
  payloads in errors or trace metadata.

## Capability Contract and Behavior

Create `packages/capabilities/search-extract-test`.

Manifest:

- `id: "capability.search-extract-test"`
- `version: "0.1.0"`
- `skill.id: "skill.search-extract-test"`
- `inputSchemaId: "capability.search-extract-test.input.v1"`
- `outputSchemaId: "capability.search-extract-test.output.v1"`
- `allowedTools`:
  - `tool.web.search`
  - `tool.web.url-policy`
  - `tool.web.fetch`
  - `tool.web.source-profile.resolve`
  - `tool.web.extract`
  - `tool.web.evidence.write`
- `permissions`: `["web.search", "web.fetch", "web.evidence.write"]`
- `sideEffects`: `["none", "write"]`
- `approvalPolicyId: "approval.none"`
- `memoryPolicyId: "memory.none"`
- no supported UI blocks and no child capabilities.

Input schema:

```ts
{
  query: string; // trimmed, 1..500 chars
  selectedUrl?: string | null; // HTTP(S), no credentials
  workspaceId?: WorkspaceId | null;
}
```

Input rules:

- If input `workspaceId` is present, it must match `context.workspaceId`.
- `selectedUrl` must be either one of the normalized search result URLs or one of the explicitly
  injected test allowlist URLs.
- Composition roots use an empty test URL allowlist. Capability unit tests may inject explicit
  fixture URLs.

Output schema:

```ts
{
  query: string;
  results: SearchResult[];
  selectedResult: {
    index: number;
    result: SearchResult;
  } | null;
  document: {
    finalUrl: string;
    title: string | null;
    byline: string | null;
    siteName: string | null;
    publishedAt: string | null;
    canonicalUrl: string | null;
    excerpt: string | null;
    contentTextSnapshot: string;
    wordCount: number;
    method: ExtractionMethod;
    sourceProfileId: string | null;
    warnings: ExtractionWarning[];
  } | null;
  evidence: {
    searchEvidenceId: string;
    fetchEvidenceId?: string;
    extractionEvidenceId?: string;
  };
  warnings: Array<{ code: string; message: string; count?: number }>;
}
```

Workflow:

1. Runtime validates input.
2. Capability resolves default search provider.
3. Capability checks provider health.
4. Capability searches web using the runtime search abstraction.
5. Capability persists search evidence.
6. If no `selectedUrl` is supplied, return search-only output.
7. If `selectedUrl` is supplied, verify it against search result URLs or explicit test allowlist.
8. Validate selected URL through URL safety policy.
9. Fetch selected URL through guarded fetch client.
10. Resolve source profile for the final URL.
11. Extract readable content through source-profile service.
12. Persist fetch and extraction evidence.
13. Return safe bounded output.

## Files

- Add `packages/contracts/src/web-evidence.ts`.
- Update `packages/contracts/src/capability.ts`, `packages/contracts/src/index.ts`, and contract
  tests.
- Add `packages/storage/src/interfaces/web-evidence-repository.ts` and export it.
- Add `packages/storage-sqlite/src/schema/web-evidence.ts`.
- Update `packages/storage-sqlite/src/schema/index.ts`.
- Add `packages/storage-sqlite/src/repositories/web-evidence-repository.ts` and export it.
- Add `packages/storage-sqlite/drizzle/0006_*_web_evidence.sql` and matching snapshot/journal entry.
- Update `packages/runtime/src/execution-service.ts`, `runtime.ts`, and tests.
- Add `packages/capabilities/search-extract-test/**`.
- Update web and worker runtime composition roots to construct/register:
  - SQLite web evidence repository
  - guarded fetch client
  - source-profile service
  - `searchExtractTestCapability`
- Update root `tsconfig.json`, `vitest.workspace.ts`, workspace package metadata, and lockfile as
  required.

## Dependencies

- Completed PAP-063 to PAP-065 search contracts and SearXNG provider.
- Completed PAP-066 to PAP-067 guarded fetch foundation.
- Completed PAP-068 to PAP-071 extraction and source profiles.
- Existing execution trace repository, runtime context, memory boundaries, workspace model, SQLite
  migrations, and web/worker composition roots.
- Node.js LTS crypto APIs for SHA-256 hashing.

## Scripts and Verification Commands

Targeted package checks:

```text
pnpm --filter @pap/contracts test
pnpm --filter @pap/storage-sqlite test
pnpm --filter @pap/runtime test
pnpm --filter @pap/capability-search-extract-test test
```

Full verification:

```text
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm format:check
git diff --check
```

## Test Strategy

- Contract tests cover evidence IDs, status enum, bounded snapshots, warning/error bounds,
  execution/workspace linkage fields, retention fields, and capability input/output schemas.
- SQLite integration tests use temporary databases and cover migration idempotency, create/list by
  execution, workspace isolation, failed evidence rows, JSON parsing, and no raw payload fields.
- Runtime tests use fake search, fetch, source-profile, extraction, and evidence services only.
- Capability unit tests use mocked runtime context methods and assert no memory, LLM, UI, approval,
  SearXNG, Readability, fetch transport, or SQLite dependency is called directly.
- Integration tests cover:
  - search-only success
  - search plus extraction success
  - unsupported selected URL failure
  - URL policy blocked failure
  - fetch failure evidence
  - extraction failure evidence
  - provider unavailable failure
  - workspace isolation for evidence reads
  - trace order and safe metadata
  - no raw HTML, cookies, authorization headers, browser state, or unsafe payloads in traces,
    evidence, or capability output

## Out Of Scope

- Web UI or execution detail UI changes.
- Model ranking, summarization, research reports, source credibility scoring, or LLM calls.
- Semantic or episodic memory writes.
- Browser automation, Playwright extraction, Crawlee, Firecrawl, multi-page crawling, retries, rate
  limiting, robots policy, or scheduling.
- Automatic source-profile learning or source-profile management UI.
- Evidence purge jobs or retention UI.
- Dockerized SearXNG/Ollama changes, reverse proxy changes, deployment publishing, or external cloud
  search providers.

## Risks and Assumptions

- `docs/backlogs/20-phase-4-search-and-web-extraction-backlog.md` is the active Phase 4 backlog
  path.
- The current generic tool registry remains unavailable; runtime context web methods are the
  minimum abstraction needed for this slice.
- SQLite evidence can later support retention cleanup because `expires_at` is stored and indexed.
- Capability output must remain as bounded as evidence because execution traces persist output JSON.
- Source-profile lookup remains global by domain in this slice; workspace isolation applies to
  evidence access, not to source-profile records.
