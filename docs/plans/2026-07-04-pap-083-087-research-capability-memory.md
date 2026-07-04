# PAP-083 to PAP-087 Research Capability and Proposed Memory

Date: 2026-07-04
Status: Accepted for implementation
Tickets: PAP-083, PAP-084, PAP-085, PAP-086, PAP-087

## Scope

Complete the server-side manual research workflow foundation required before the web slice:

- Structured relevance ranking contracts and validation helpers.
- Structured source analysis contracts and validation helpers.
- Citation validation and deterministic report synthesis from validated source analyses.
- `capability.research` package with manifest, schemas, skill, execution workflow, and tests.
- Proposed semantic-memory eligibility and creation through `MemoryService`, remaining `proposed`
  until user review.
- Fake provider fixtures for automated tests and local test-mode browser flows.

Do not add recurring research, watchlists, browser automation, generic chat UI, live-provider test
dependencies, automatic active semantic memory, vector retrieval, email/document capabilities,
publishing/exporting, or deployment changes.

## Decisions

- Keep provider transports behind runtime context APIs. `@pap/capability-research` may call
  `context.web`, `context.llm`, `context.memory`, and injected report/source repositories, but must
  not import Ollama, SearXNG, guarded-fetch transports, SQLite connection factories, or browser
  APIs.
- Keep `@pap/research` as provider-neutral workflow logic. It owns ranking/analysis schemas,
  citation validation, report synthesis helpers, partial-failure shaping, and memory proposal
  eligibility helpers.
- Use existing deterministic preparation helpers from PAP-080 to PAP-082 for query planning,
  candidate normalization, source selection, and trace metadata.
- Persist every selected source, including failed fetch/extraction/analysis diagnostics, so partial
  and failed reports remain inspectable.
- Treat search snippets only as candidate metadata. Report findings may cite only extracted source
  analysis claims with extraction evidence IDs.
- Use model calls only for bounded structured ranking and article analysis. Report synthesis is
  deterministic for this slice to keep citation integrity directly testable.
- If fake test-mode fixtures are enabled, the runtime uses fake AI/search/fetch behavior and isolated
  SQLite databases. Automated tests must not require live Ollama, SearXNG, or public websites.
- Research memory proposals are semantic records with `status: proposed`, `sourceType:
  research_report`, report/execution/source/evidence provenance, and workspace scope. No active
  semantic memory is created automatically.

## Files

Expected package files:

- Extend `packages/contracts/src/research.ts` if model-facing schemas or capability output schemas
  are missing.
- Add `packages/research/src/ranking.ts`.
- Add `packages/research/src/analysis.ts`.
- Add `packages/research/src/citations.ts`.
- Add `packages/research/src/report-synthesis.ts`.
- Add `packages/research/src/memory-proposals.ts`.
- Update `packages/research/src/index.ts`.
- Extend `packages/research/test/research.test.mjs`.
- Add `packages/capabilities/research/package.json`.
- Add `packages/capabilities/research/tsconfig.json`.
- Add `packages/capabilities/research/src/manifest.ts`.
- Add `packages/capabilities/research/src/schemas.ts`.
- Add `packages/capabilities/research/src/execute.ts`.
- Add `packages/capabilities/research/src/index.ts`.
- Add `packages/capabilities/research/skills/research/SKILL.md`.
- Add `packages/capabilities/research/skills/research/skill.manifest.json`.
- Add `packages/capabilities/research/test/research-capability.test.mjs`.

Expected app/test wiring files:

- Update `pnpm-workspace.yaml` automatically through existing `packages/capabilities/*` pattern.
- Update root `tsconfig.json` and `vitest.workspace.ts` for the new capability package if needed.
- Update `apps/web/src/features/executions/runtime.server.ts` later in PAP-088 to register the
  capability and repositories.
- Add or extend test fixtures only under existing app/package test paths.

## Capability Workflow

`capability.research` must add these trace-visible stages after runtime input validation:

1. Resolve workspace context.
2. Plan queries.
3. Search web.
4. Normalize candidates.
5. Select extraction budget.
6. Fetch and extract sources.
7. Rank relevance.
8. Analyze selected sources.
9. Validate citations.
10. Synthesize report.
11. Persist report.
12. Propose memory if eligible.

The runtime still owns final output validation and final execution trace completion.

## Failure Behavior

- Search provider unavailable creates failed report diagnostics when possible and returns safe
  capability failure.
- Individual fetch or extraction failures mark source status and warnings, then continue when at
  least one source remains usable.
- Ranking or analysis schema failures mark affected source/report warnings and fail safely when no
  validated source analysis remains.
- Citation validation failure prevents `completed` status and produces a failed report with trace and
  diagnostics.
- Memory proposal failures add warnings but do not convert a completed report into failure.

## Test Plan

Unit tests:

- Ranking output schema validation and invalid-source rejection.
- Article analysis schema validation and source/evidence matching.
- Citation validator rejects unknown source IDs, unknown citation IDs, evidence mismatch, duplicate
  citations, and uncited substantive findings.
- Report synthesis omits unsupported findings and records limitations.
- Partial source failures preserve usable source analyses and warnings.
- Memory proposal eligibility requires enabled mode, successful report, valid citations, low/moderate
  sensitivity, confidence threshold, and no active-memory write.

Integration tests:

- Successful research with fake search/fetch/AI providers and temp SQLite.
- Search/provider failure.
- Partial source failure.
- No usable source failure.
- Citation validation failure.
- Report/source/evidence persistence.
- Workspace isolation.
- Pending proposed memory with provenance.
- Zero automatic active semantic-memory writes.

## Dependencies

- Existing research contracts and persistence from PAP-078 to PAP-079.
- Existing deterministic preparation package from PAP-080 to PAP-082.
- Existing search/fetch/extraction runtime context and web evidence persistence.
- Existing `MemoryService` proposal workflow and semantic memory repositories.

## Scripts and Verification Commands

Targeted:

```text
pnpm --filter @pap/research test
pnpm --filter @pap/research typecheck
pnpm --filter @pap/capability-research test
pnpm --filter @pap/capability-research typecheck
pnpm test:integration
```

Full goal verification:

```text
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:qa
pnpm lint
pnpm format:check
git diff --check
```

## Out Of Scope

- Live Ollama, live SearXNG, or public website dependencies in automated tests.
- Browser-side provider calls.
- Active semantic-memory writes from research.
- Recurring/scheduled research, worker scheduling, watchlists, exports, publishing, approvals UI,
  Memory Explorer approval changes, vector search, embeddings, email, documents, Docker, reverse
  proxy, or deployment publishing.
