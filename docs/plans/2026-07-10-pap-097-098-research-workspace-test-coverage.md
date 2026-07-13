# PAP-097 & PAP-098 — Research Workspace Test Coverage Plan

Date: 2026-07-10
Status: Accepted for implementation
Tickets: PAP-097, PAP-098

## Summary

Add PAP-097 and PAP-098 validation only. Do not add product behavior. Treat the missing
PAP-095/PAP-096 report-detail approve/reject and export/copy UI/server affordances as
prerequisites: if they are still absent when implementation begins, stop and route that gap back to
PAP-095/PAP-096 instead of implementing it under these tickets.

---

## Scope

- Unit and integration coverage for research history filters.
- Unit and integration coverage for research source/report feedback behavior.
- Integration coverage for report-linked memory proposals and review operations.
- Unit and integration coverage for export shaping from persisted report data.
- Server-only web operation integration coverage for research workspace review flows.
- SQLite repository integration coverage for research reports, sources, feedback, memory proposal
  linkage, and workspace isolation.
- Playwright workspace review flows for dashboard/history, detail, feedback, proposal review, and
  export/copy controls.
- QA-Intel fixture-mode coverage for visible research workspace review behavior.

## Out Of Scope

- Product behavior changes.
- Filling missing PAP-095/PAP-096 approve/reject or export/copy implementation gaps.
- Live Ollama, SearXNG, or public website calls.
- Changes to Playwright trace or screenshot failure policy.
- Content-level QA-Intel download assertions; those remain in Playwright.

---

## Unit/Integration Coverage Matrix

| Area | Level | Coverage |
|---|---|---|
| History filters | Unit + integration | Query normalization, date bounds, status/sort, warnings, pending-memory filter, newest/oldest effective timestamp ordering, pagination, workspace/unscoped isolation. |
| Feedback | Unit + integration | Source create/update/delete, report upsert/get, duplicate source feedback rejection, note/reason bounds, workspace mismatch safe errors, cascade behavior. |
| Memory proposals | Integration | Report-linked proposed/active/rejected records, conflict display data, approve/reject through `MemoryService`, resolved proposal retry failure, workspace isolation. |
| Export shaping | Unit + integration | Markdown/plain-text/JSON output from persisted report data, citations/source references/warnings/limitations preserved, invalid/not-found safe errors, no report/source mutation. |
| Web operations | Integration | Update `apps/web/test/research-operations.test.mjs` fixture state to include feedback repositories and test server-only operation results. |
| SQLite repositories | Integration | Extend `packages/storage-sqlite/test/repository.test.mjs` migrated repo fixture with feedback repositories and isolated temp DBs. |

## Fake/Fixture Data Model

Seed a shared research workspace fixture with:

- `workspace_alpha` visible, `workspace_beta` hidden, plus one unscoped report where needed.
- Alpha reports: completed cited report, completed-with-warnings report with pending memory, running
  report for ordering, and an export-focused report with citations, warnings, and limitations.
- Beta report/feedback/proposal mirrors alpha text enough to catch leakage.
- Sources: analyzed cited source with evidence ID, second source for count/pagination, failed source
  for warning UI.
- Feedback: report feedback and source feedback with bounded notes, plus wrong-workspace records for
  isolation checks.
- Memory: one pending semantic proposal linked by `sourceExecutionId`, one active same-workspace
  conflict, one beta proposal that must remain hidden.
- Immutability baseline: snapshot `research_reports` and `research_sources` rows before
  feedback/export/proposal actions and compare after non-report mutations.

## Database Isolation Design

Use `createTemporarySqliteDatabase(prefix)` plus `runMigrations()` per test or per serial browser
server. Open repositories from that database only, close connections in `finally`, and never rely on
previous test state.

Seed through repository/service APIs where possible; use direct SQL only for immutable before/after
snapshots. Browser tests continue using Playwright's temp DB/server setup in `e2e/research.spec.ts`,
with `trace: retain-on-failure` and `screenshot: only-on-failure` unchanged.

No test calls live Ollama, SearXNG, or public websites. Use existing fixture providers and
deterministic `pap-fixture.example` server-side data only.

## Playwright Scenario List

Add PAP-098 flows to `e2e/research.spec.ts`:

1. Workspace dashboard/history: filter by status, date, warnings, pending memory, question; verify
   pagination preserves URL filters; open report detail.
2. Workspace isolation: beta dashboard/detail cannot see alpha reports, feedback, or proposals.
3. Source feedback: mark a source useful with notes, reload/reopen, edit, remove, and verify
   original source/report text remains unchanged.
4. Report feedback: mark report useful with notes, reload/reopen, update feedback, and verify
   findings/citations remain unchanged.
5. Proposal review: inspect pending proposal content/provenance/conflict, approve one proposal,
   reject another, verify visible status updates and memory detail link.
6. Export/copy: copy plain text and download Markdown/JSON; assert clipboard/download content
   includes citations, sources, warnings, limitations, report ID, execution ID, and excludes
   hidden/raw data.

## QA-Intel Feature And Seeding Plan

Add `qa/features/research-workspace-review.fixture.feature` only, so these scenarios run with
`PAP_QA_PROVIDER_MODE=fixture`.

Extend `qa/runner/src/index.ts` seeding with research repositories, feedback repositories, source
repositories, and `MemoryService`. Seed the same alpha/beta report set as Playwright, using stable
IDs such as `research_report_qa_warning`, `research_source_qa_primary`, and
`memory_qa_research_proposal`.

QA-Intel scenarios assert visible behavior only:

- Review saved research: filtered workspace history shows alpha warning report, hides beta report,
  opens sources/limitations/citations.
- Give feedback: source/report feedback remains visible after reopening, and original finding text
  remains visible unchanged.
- Review proposal: approve a pending proposal, see approved/active state, open resulting memory
  detail.
- Export controls: verify export/copy controls are visible on a cited report and the report visibly
  includes citations/limitations; content-level download assertions stay in Playwright.

---

## Files

- `apps/web/test/research-operations.test.mjs`
- `packages/storage-sqlite/test/repository.test.mjs`
- `e2e/research.spec.ts`
- `qa/features/research-workspace-review.fixture.feature`
- `qa/runner/src/index.ts`
- Existing research, memory, feedback, export, and test fixture helpers as needed.

## Dependencies

- PAP-095/PAP-096 approve/reject and export/copy UI/server affordances must already exist before
  this implementation starts.
- Existing fixture provider behavior and deterministic `pap-fixture.example` data remain the only
  external-data inputs.
- SQLite tests depend on migrated temporary databases created by `createTemporarySqliteDatabase()`
  and `runMigrations()`.

## Verification Commands

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/research test`
- `pnpm --filter @pap/storage-sqlite test`
- `pnpm run test:integration`
- `pnpm test:e2e -- e2e/research.spec.ts`
- `PAP_QA_PROVIDER_MODE=fixture pnpm test:qa`
- Final gate after prerequisite gaps are resolved:
  `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && PAP_QA_PROVIDER_MODE=fixture pnpm test:qa`
