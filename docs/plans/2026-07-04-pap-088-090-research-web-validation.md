# PAP-088 to PAP-090 Research Web Experience and Validation

Date: 2026-07-04
Status: Accepted for implementation
Tickets: PAP-088, PAP-089, PAP-090

## Summary

Build the manual research web slice only: `/research` for request and report list,
`/research/$reportId` for persisted report detail, server-only research execution/actions,
visible citations/sources/limitations/warnings, proposed-memory status, and deterministic
fake-provider test coverage.

Do not add generic chat UI, auto-run scheduling, report publishing/export/editing, browser-side
requests to SearXNG/Ollama/public sites, or hidden reasoning display.

## Key Changes

- Add `apps/web/src/features/research/` with `types.ts`, `operations.ts`, `server.ts`,
  `components.tsx`, and `fixtures.server.ts`.
- Add `/research`:
  - Validate `workspaceId?`, `status?`, `page`, and `pageSize`.
  - Loader fetches workspaces and workspace-scoped or unscoped reports.
  - Render the manual research form and recent reports.
- Add `/research/$reportId`:
  - Validate `workspaceId?`.
  - Load report detail, source diagnostics, trace link, and memory proposal statuses.
- Wire server-only state in `runtime.server.ts`:
  - Register completed `capability.research`.
  - Add `SqliteResearchReportRepository` and `SqliteResearchSourceRepository`.
  - Use fake search/fetch/AI providers only when `PAP_ENVIRONMENT=test` and
    `PAP_RESEARCH_TEST_FIXTURES=true`.
- Add a top-nav `Research` link, regenerate `routeTree.gen.ts`, and update web package
  scripts/dependencies for `@pap/capability-research` if not already present.
- Extend `WorkspaceSelector` with an optional all-option label; research uses `No workspace`
  because unselected means unscoped reports, not all workspaces.

## Server-Only Action Design

- `runResearch`: coerce `FormData`, validate with `researchRequestSchema`, execute
  `capability.research` through runtime, then load the persisted report by returned `reportId` and
  exact `workspaceId`.
- `listResearchReports`: validate route filters and call
  `researchReportRepository.list({ workspaceId: workspaceId ?? null, status?, page, pageSize })`.
- `getResearchReport`: require `{ reportId, workspaceId: workspaceId ?? null }`; generated links
  always preserve `workspaceId` for workspace-scoped reports. Missing scope shows safe not-found.
- `listResearchMemoryStatuses`: query semantic memory by `sourceExecutionId = report.executionId`
  for `proposed`, `active`, and `rejected`; return status/counts and direct memory links.
- All handlers import `runtime.server` inside server functions; browser code never imports SQLite,
  Ollama, SearXNG, fetch transports, or public URLs.

## UI State and Rendering

- Form controls: question, workspace, focus, time range, max sources, language, comma-separated
  categories, and explicit propose-memory checkbox. Submit disables controls, sets `aria-busy`, and
  renders a `role="status"` running panel.
- Success navigates to the report detail page. Execution failure shows safe code/message plus
  execution trace link, and a report link if a failed/partial report was persisted.
- Detail states:
  - `pending`/`running`: status pill, execution link, no polling in this ticket.
  - `completed`: summary, findings, sources, citations, limitations.
  - `completed_with_warnings`: same report plus warning summary.
  - `failed`: safe status, diagnostics, warnings/limitations/source failures, trace link.
- Citation rendering: findings render internal citation chips like `C1`, anchored to a citation list
  and source diagnostics. Source URLs are displayed as text, not external links, so the browser
  never requests public sites.
- Source diagnostics: show source status, title, URL/final URL text, evidence ID, selection rank,
  relevance score, citation count, analysis caveats, and source/report warnings. Failed
  fetch/extraction/analysis sources remain visible.
- Proposed-memory UI: show pending/active/rejected proposal counts and direct links to memory
  records. Approval/rejection remains in the existing Memory UI; no automatic activation.

## Trace and Safety

- Extend trace metadata allowlist with research-safe keys only: `reportId`, `queryPlanId`,
  `queryCount`, `candidateCount`, `deduplicatedCount`, `exclusionCount`, `requestedSourceCount`,
  `extractionBudget`, `selectedSourceCount`, `failedSourceCount`, `analyzedSourceCount`,
  `citationCount`, `findingCount`, `limitationCount`, `memoryProposalCount`, `sourceId`,
  `evidenceId`, and `relevanceScore`.
- Do not render snippets as evidence unless they are validated report citation excerpts.
- Never render prompts, raw model output, hidden reasoning, raw HTML, headers, cookies, or stack
  traces.

## Test Plan

- Unit tests:
  - Complete PAP-089 required coverage for deterministic planning, dedupe, selection,
    ranking/analysis schemas, citation/report validation, memory proposal eligibility/suppression,
    and partial source failures.
- Integration tests:
  - Add `packages/capabilities/research/test` and `apps/web/test/research-operations.test.mjs`.
  - Use fake search, fake guarded fetch, fake AI provider, real runtime, real repositories, and temp
    SQLite.
  - Cover success, search unavailable, partial fetch failure, no usable source, citation validation
    failure, persistence, workspace isolation, proposed memory provenance, and no active memory
    auto-write.
- Playwright:
  - Add `e2e/research.spec.ts`.
  - Scenarios: successful request/report/citations, source diagnostics plus trace opening, partial
    source failure warning, provider unavailable safe error, workspace isolation, pending proposed
    memory, and browser-request guard for fixture/public-provider URLs.
- QA-Intel:
  - Add `qa/features/source-backed-research.feature` using existing strict step syntax.
  - Update runner env with `PAP_RESEARCH_TEST_FIXTURES=true`, fake AI/search/fetch fixtures, and
    isolated temp SQLite.
  - Seed `workspace_qa_alpha` and `workspace_qa_beta`; scenarios create reports through the UI.
    Fixture questions select success, partial-source-failure, and memory-proposal modes
    deterministically.

## Assumptions

- Completed PAP-086/PAP-087 expose `capability.research`, a research capability output containing
  `reportId`, and proposed semantic memory linked by `sourceExecutionId`.
- Reads remain workspace-isolated: unscoped research uses `workspaceId: null`; workspace reports
  require the workspace search param.
- No generic chat, scheduling, report publishing/export/editing, direct browser provider calls, or
  hidden reasoning display is added.
