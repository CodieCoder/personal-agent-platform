# PAP-078 to PAP-079 Research Contracts and Persistence

Date: 2026-07-04
Status: Accepted for implementation
Tickets: PAP-078, PAP-079

## Scope

Add the Phase 5 research contract and persistence foundation only:

- Research request, query plan, candidate source, selected source, source analysis, citation,
  finding, report, warning, status, and research-error contracts in `@pap/contracts`.
- Provider-neutral report and source repository interfaces in `@pap/storage`.
- SQLite report and source schema, additive migration, repository implementations, and isolated
  tests in `@pap/storage-sqlite`.
- Execution, workspace, source, citation, and web-extraction evidence linkage validation.

Do not add query planning implementation, model calls, report synthesis, a research capability, web
UI, automatic memory writes, raw HTML persistence, hidden model reasoning storage, new external
services, or side-effecting runtime behavior.

## Decisions

- Add `packages/contracts/src/research.ts` and export it from `@pap/contracts`.
- Keep PAP-078 as contracts only. PAP-080 and later milestones own producing query plans, selecting
  sources, model ranking, source analysis, citation validation workflows, report synthesis, and
  capability execution.
- Use Zod as the only external boundary validator. All stored research JSON must be parsed through
  the research contracts before returning from repositories.
- Reuse existing ID contracts:
  - Research report, source, citation, and finding IDs use `opaqueIdentifierSchema`.
  - Workspace and execution links use existing `workspaceIdSchema` and `executionIdSchema`.
  - Source URLs use existing safe HTTP/HTTPS URL schemas from search/fetch contracts where
    applicable.
- Treat research persistence as report/evidence provenance storage, not memory. Research records may
  later be referenced by memory `evidenceRefs`, but PAP-078 and PAP-079 must not write semantic or
  episodic memory.
- Store only bounded, normalized, user-visible research artifacts: report summary, findings,
  limitations, warnings, citations, source metadata, citation IDs, status, and source analysis
  outputs. Never store raw HTML, browser state, cookies, auth headers, prompts, raw model output, or
  hidden model reasoning.
- Use repository-level integrity checks for cross-JSON citation/source relationships because SQLite
  cannot enforce references embedded inside JSON blobs.
- Preserve workspace isolation by copying the execution workspace onto reports and sources and
  requiring exact workspace matches on writes and reads.

## Contract Shape

Add inferred TypeScript types for every Zod schema.

Research request:

- `question`: trimmed string, 1 to 2,000 chars.
- `workspaceId`: nullable workspace ID.
- `focus`: nullable string, max 1,000 chars.
- `timeRange`: nullable enum compatible with existing search time ranges plus open-ended research
  values where needed by the backlog.
- `maxSources`: nullable integer, 1 to 15.
- `maxSearchResults`: nullable integer, 1 to 50.
- `language`: nullable existing search language shape.
- `categories`: nullable bounded array, max 8.
- `memoryProposalMode`: nullable enum `none | propose`.

Research planning and source contracts:

- `researchQueryPlanSchema`: `id`, `question`, bounded query items, warnings, and `createdAt`. This
  is a shape only; no planner is implemented in this slice.
- `researchCandidateSourceSchema`: `sourceId`, `searchEvidenceId`, `searchResultIndex`, title, URL,
  display/snippet metadata, publishedAt, engine/category, provider score, and warnings.
- `researchSelectedSourceSchema`: `id`, `reportId`, `executionId`, `workspaceId nullable`,
  `evidenceId nullable`, URL/finalUrl/title/publishedAt, selection rank, relevance score,
  analysis, citation IDs, status, and timestamps.
- `researchSourceAnalysisSchema`: `sourceId`, `evidenceId`, bounded summary, claims with excerpts,
  caveats, relevance/confidence scores, and warnings. It must not contain prompt text, raw model
  response text, or hidden reasoning.

Citation and report contracts:

- `researchCitationSchema`: `citationId`, `sourceId`, `sourceTitle`, `sourceUrl`, `evidenceId`,
  `claimText`, and `sourceExcerpt nullable`.
- `researchFindingSchema`: `id`, title, `claimText`, `citationIds`, confidence, and kind
  `sourced_fact | synthesis | uncertainty`. Substantive findings require at least one citation ID.
- `researchWarningSchema`: lower-snake warning code, bounded message, optional `sourceId`,
  optional `evidenceId`, optional safe details.
- `researchErrorSchema`: lower-snake kind, bounded message, retryable flag, optional source/evidence
  IDs, optional safe details.
- `researchReportSchema`: `id`, `executionId`, `workspaceId nullable`, `question`, `summary`,
  `findings`, `sources`, `citations`, `limitations`, `warnings`, `status`, `createdAt`, and
  `completedAt nullable`.
- `researchReportStatusSchema`: `pending | running | completed | completed_with_warnings | failed |
cancelled`.
- `researchSourceStatusSchema`: `selected | fetch_failed | extraction_failed | extracted |
analysis_failed | analyzed | excluded`.

Contract refinements:

- Report citations must cite known source IDs.
- Finding citation IDs must exist in report citations.
- Citation `evidenceId` must match the cited source `evidenceId`.
- Source `citationIds` must be a subset of report citation IDs for that source.
- Completed reports must include `completedAt`; non-terminal reports must not require it.

## SQLite Data Model

Add `research_reports`:

- `id` text primary key.
- `execution_id` text not null references `execution_traces(id)` on delete cascade.
- `workspace_id` text nullable.
- `question` text not null.
- `summary_json` text not null.
- `findings_json` text not null.
- `citations_json` text not null.
- `limitations_json` text not null.
- `warnings_json` text not null.
- `status` text not null.
- `created_at` text not null.
- `updated_at` text not null.
- `completed_at` text nullable.

Indexes:

- `research_reports_execution_id_idx`
- `research_reports_workspace_status_created_idx`
- `research_reports_status_created_idx`
- `research_reports_created_at_idx`

Add `research_sources`:

- `id` text primary key.
- `report_id` text not null references `research_reports(id)` on delete cascade.
- `execution_id` text not null references `execution_traces(id)` on delete cascade.
- `workspace_id` text nullable.
- `evidence_id` text nullable references `web_extraction_evidence(id)` on delete no action.
- `url` text not null.
- `final_url` text nullable.
- `title` text nullable.
- `published_at` text nullable.
- `selection_rank` integer nullable.
- `relevance_score` real nullable.
- `analysis_json` text nullable.
- `citation_ids_json` text not null.
- `status` text not null.
- `created_at` text not null.
- `updated_at` text not null.

Indexes:

- `research_sources_report_id_idx`
- `research_sources_execution_id_idx`
- `research_sources_workspace_execution_idx`
- `research_sources_evidence_id_idx`
- `research_sources_status_idx`
- `research_sources_selection_rank_idx`

## Repository Interfaces

Add interfaces under `packages/storage/src/interfaces/` and export them from
`packages/storage/src/index.ts`.

`ResearchReportRepository`:

- `create(input): Promise<ResearchReport>`
- `getById(input: { id: ResearchReportId; workspaceId: WorkspaceId | null }): Promise<ResearchReport | null>`
- `list(input?: { workspaceId?: WorkspaceId | null; executionId?: ExecutionId; status?: ResearchReportStatus; page?: number; pageSize?: number }): Promise<ResearchReportListPage>`
- `updateStatus(input): Promise<ResearchReport>`
- `replaceContent(input): Promise<ResearchReport>`

`ResearchSourceRepository`:

- `create(input): Promise<ResearchSelectedSource>`
- `getById(input: { id: ResearchSourceId; workspaceId: WorkspaceId | null }): Promise<ResearchSelectedSource | null>`
- `listByReport(input): Promise<ResearchSelectedSource[]>`
- `listByExecution(input): Promise<ResearchSelectedSource[]>`
- `updateStatus(input): Promise<ResearchSelectedSource>`
- `updateAnalysis(input): Promise<ResearchSelectedSource>`

SQLite implementations:

- `SqliteResearchReportRepository`
- `SqliteResearchSourceRepository`
- Export both from `packages/storage-sqlite/src/index.ts`.

## Evidence and Execution Linkage

- Report creation validates that the execution trace exists.
- If an execution trace has a workspace, report `workspaceId` must equal it.
- If an execution trace is unscoped, report `workspaceId` must be `null`.
- Source creation validates that the report exists and has the same `executionId` and workspace.
- Source `evidenceId`, when present, validates against `web_extraction_evidence` with the same
  `executionId` and workspace.
- Sources without extraction evidence may be persisted as diagnostics, but they cannot support
  citations or findings.
- Reads require an explicit workspace filter. Unscoped research is read with `workspaceId: null`.
- Report rows are owned by execution traces through cascade delete; evidence links use no-action
  deletes so retention cleanup cannot orphan completed research citations or source analysis.

## Citation Integrity

Repository writes that persist or replace report content must validate the complete report/source
set transactionally:

- Every report citation references an existing source in the same report.
- Every citation references a source with a non-null `evidenceId`.
- Every citation `evidenceId` equals the cited source `evidenceId`.
- Every citation `sourceTitle` and `sourceUrl` matches the persisted source display fields at the
  time of save.
- Every finding citation ID exists.
- Every source `citationIds` list contains only citation IDs that cite that source.
- Duplicate citation IDs inside one report are rejected.
- Missing or invalid source/evidence linkage fails before any partial update is committed.

## Files

Expected contract files:

- Add `packages/contracts/src/research.ts`.
- Update `packages/contracts/src/index.ts`.
- Update `packages/contracts/test/contracts.test.mjs`.

Expected storage files:

- Add `packages/storage/src/interfaces/research-report-repository.ts`.
- Add `packages/storage/src/interfaces/research-source-repository.ts`.
- Update `packages/storage/src/index.ts`.

Expected SQLite files:

- Add `packages/storage-sqlite/src/schema/research-reports.ts`.
- Add `packages/storage-sqlite/src/schema/research-sources.ts`.
- Update `packages/storage-sqlite/src/schema/constants.ts`.
- Update `packages/storage-sqlite/src/schema/index.ts`.
- Add `packages/storage-sqlite/src/repositories/research-report-repository.ts`.
- Add `packages/storage-sqlite/src/repositories/research-source-repository.ts`.
- Update `packages/storage-sqlite/src/index.ts`.
- Add the next generated migration after `0006_web_evidence` and its Drizzle snapshot metadata.
- Update `packages/storage-sqlite/test/repository.test.mjs`.

## Migration Plan

- Generate one additive Drizzle migration, expected as `0007_*`, from the new schema files.
- Commit the SQL migration, snapshot JSON, and journal update.
- Do not modify existing tables.
- Do not run `drizzle push`.
- Keep `runMigrations` as the only migration application path.
- Verify the migration can be applied twice against the same temporary SQLite database.

## Test Plan

Contract tests:

- Research request trims and bounds fields.
- `maxSources`, `maxSearchResults`, language, categories, status, warning, and error shapes reject
  invalid values.
- Reports reject unknown source IDs, unknown citation IDs, mismatched citation evidence IDs, and
  findings without citations.
- Schemas reject raw HTML, auth/header fields, prompt fields, raw model output fields, and hidden
  reasoning fields through strict object parsing.

SQLite integration tests:

- Migrations apply twice.
- Reports can be created, fetched, listed by workspace, listed by execution, and status-updated.
- Sources can be created, listed by report, listed by execution, status-updated, and analysis-updated.
- Report/source/evidence linkage preserves execution and workspace isolation.
- `workspaceId: null` reads return only unscoped reports and sources.
- Missing execution, mismatched workspace, missing report, mismatched source report, missing
  extraction evidence, and mismatched evidence workspace fail safely.
- Citation integrity failures roll back transactionally.
- Serialized report/source rows do not include raw HTML, cookies, authorization headers, stack
  traces, prompts, raw model text, or hidden reasoning.

## Dependencies

- PAP-050 provider/AI contract baseline for later model-facing schemas.
- PAP-063 search contracts and provider-neutral search result shapes.
- PAP-068 extraction contracts and source profiles.
- PAP-072 web evidence persistence.
- Existing `@pap/contracts`, `@pap/storage`, `@pap/storage-sqlite`, Drizzle, better-sqlite3, and
  temporary SQLite testing helpers.

No new external runtime dependency is planned.

## Scripts and Verification Commands

Targeted checks:

```text
pnpm --filter @pap/contracts test
pnpm --filter @pap/storage-sqlite test:integration
pnpm --filter @pap/storage typecheck
pnpm --filter @pap/storage-sqlite typecheck
```

Full verification:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
git diff --check
```

## Out Of Scope

- Query planner behavior.
- Candidate normalization and deduplication behavior.
- Source selection behavior.
- Search/fetch/extraction orchestration.
- Model ranking, source analysis calls, report synthesis, or LLM repair.
- `capability.research`.
- Web routes, UI blocks, Playwright, or QA-Intel coverage.
- Semantic or episodic memory writes.
- Vector storage, embeddings, source-profile learning, recurring research, watchlists, scheduling,
  email, document ingestion, browser automation, Crawlee, Firecrawl, reverse proxy, or deployment
  publishing.

## Assumptions

- `docs/backlogs/21-phase-5-research-capability-backlog.md` is the active Phase 5 source for
  PAP-078 and PAP-079.
- `docs/11-research-capability-prd.md` informs terminology only where it does not conflict with the
  active backlog or this plan.
- Research report persistence is durable user-facing artifact storage. It is not a replacement for
  execution traces, web evidence, or memory records.
