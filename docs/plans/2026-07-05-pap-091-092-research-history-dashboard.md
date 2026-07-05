# PAP-091 to PAP-092 Research History Dashboard

Date: 2026-07-05
Status: Accepted for implementation
Tickets: PAP-091, PAP-092

## Summary

Add the Phase 6 report-history and workspace dashboard slice only:

- Typed research-history and dashboard query contracts.
- Workspace-scoped report history queries.
- Filtered and paginated research report lists.
- Workspace research dashboard UI.
- URL query parameter state.
- Report summary cards and navigation to the existing report detail route.

Do not add source feedback, report feedback, memory proposal review, export/copy, report mutation,
schedules, watchlists, email, browser automation, model calls, or direct browser database access.

## Scope

- PAP-091 is contract and query shape work: Zod contracts for history filters, normalized
  pagination, history list items, list pages, and dashboard summaries.
- PAP-092 is web experience work: server-only report history reads, workspace dashboard route,
  global research history route, filter forms, URL-stateful pagination, summary cards, and detail
  navigation.
- Preserve exact workspace isolation. Workspace report history must never include reports from
  unrelated workspaces. Unscoped report history must use `workspaceId: null`.
- Preserve newest-first ordering using the effective report timestamp:
  `completedAt ?? updatedAt ?? createdAt`.

## Decisions

- Add the new contracts to `packages/contracts/src/research.ts` and export inferred TypeScript
  types from the same file.
- Required filters are:
  - `workspaceId`
  - `status`
  - `dateFrom`
  - `dateTo`
  - `question`
  - `hasWarnings`
  - `hasPendingMemoryProposal`
  - `page`
  - `pageSize`
- Normalize unsafe or invalid route search input before calling server functions:
  - `page` defaults to `1`.
  - `pageSize` defaults to `10` and caps at `50`.
  - `dateFrom` and `dateTo` are date-only values.
  - Inverted date ranges are rejected by contract/server validation.
  - `question` is trimmed and bounded.
- `/workspaces/$workspaceId/research` gets its workspace from the path, not a query parameter.
- `/research/history` accepts `workspaceId`; if omitted, it shows unscoped reports only, matching
  the existing `/research` behavior.
- `hasPendingMemoryProposal` means at least one semantic memory record with status `proposed`
  linked to the report execution and the same workspace.
- Dashboard and history are read-only. They may display pending-memory counts but must not approve,
  reject, or otherwise review memory proposals.
- Browser code receives typed DTOs from server functions only. It must not import SQLite,
  repositories, Ollama, SearXNG, fetch transports, or provider clients.
- Leave the existing `2026-07-05-pap-091-093-live-qa-research-hardening.md` plan untouched even
  though its ticket numbering conflicts with the Phase 6 backlog naming.

## Contract Shape

Add Zod schemas and inferred types for:

- `researchReportHistoryQuerySchema`
- `researchReportHistoryItemSchema`
- `researchReportHistoryPageSchema`
- `researchReportDashboardQuerySchema`
- `researchReportDashboardSummarySchema`

History items should include only card/list data:

- report ID
- execution ID
- workspace ID nullable
- question
- status
- source count
- warning count
- pending memory proposal count
- created/completed/effective timestamp fields

Dashboard summaries should include:

- workspace ID nullable
- total report count
- count by report status
- warning report count
- pending memory proposal report count
- latest report timestamp nullable

## Server And Repository Design

- Extend `ResearchReportRepository` with read-only history/dashboard methods rather than changing
  the existing full-report `list()` method used by the current `/research` route.
- SQLite implementation should query `research_reports` with exact workspace filtering and join or
  subquery `research_sources` and `semantic_memory` to compute counts.
- Use `coalesce(completed_at, updated_at, created_at)` for date filtering and ordering.
- Use `lower(question) like lower(?)` or an equivalent bounded SQLite query for question search.
  Do not introduce SQLite FTS in this ticket.
- Continue parsing persisted JSON through contracts before returning typed data where JSON fields
  are read.
- Server functions in `apps/web/src/features/research/server.ts` should call operation helpers in
  `operations.ts`, mirroring the existing server-only pattern.

## UI Design

Add routes:

- `/workspaces/$workspaceId/research`
- `/research/history`

Add/extend research components for:

- Workspace dashboard summary.
- Research history filter form.
- Paginated report history list.
- Report summary cards.
- Pagination nav that preserves filters.

Report cards should show:

- question
- status pill
- source count
- warning count
- pending memory proposal indicator/count
- completed or effective timestamp
- workspace ID when present
- link to `/research/$reportId?workspaceId=...`

Use the existing `section-panel`, `detail-panel`, `entity-list`, `filter-bar`, `pill`, and
`pagination-bar` conventions. Add CSS only if existing classes cannot cover a readable layout.

## Files

Expected files to change:

- `packages/contracts/src/research.ts`
- `packages/contracts/test/contracts.test.mjs`
- `packages/storage/src/interfaces/research-report-repository.ts`
- `packages/storage-sqlite/src/repositories/research-report-repository.ts`
- `packages/storage-sqlite/test/repository.test.mjs`
- `apps/web/src/features/research/types.ts`
- `apps/web/src/features/research/operations.ts`
- `apps/web/src/features/research/server.ts`
- `apps/web/src/features/research/components.tsx`
- `apps/web/src/routes/research.history.tsx`
- `apps/web/src/routes/workspaces.$workspaceId.research.tsx`
- `apps/web/src/routes/workspaces.$workspaceId.tsx`
- `apps/web/src/routeTree.gen.ts`
- `apps/web/test/research-operations.test.mjs`
- `e2e/research.spec.ts`
- `apps/web/src/styles/global.css` only if needed for compact history/dashboard layout.

## Dependencies

- Depends on PAP-078, PAP-079, and PAP-088 existing research contracts, persistence, and report
  detail UI.
- Uses existing SQLite/Drizzle repository patterns from research report persistence.
- Uses existing semantic memory linkage through `sourceExecutionId`.
- Uses existing TanStack Start server functions and route search validation conventions.

## Verification Commands

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/storage-sqlite test`
- `pnpm --filter @pap/web typecheck`
- `pnpm test:e2e -- e2e/research.spec.ts`
- `pnpm typecheck`

## Test Plan

- Contract tests:
  - Default query normalization.
  - Page/pageSize bounds.
  - Status validation.
  - Date-only validation.
  - Inverted date range rejection.
  - Boolean filter validation.
  - Dashboard summary shape.
- SQLite integration tests:
  - Exact workspace isolation.
  - Unscoped report isolation.
  - Newest-first effective timestamp ordering.
  - Status/date/question/warnings/pending-memory filters.
  - Pagination totals and next/previous flags.
  - Source, warning, and pending proposal counts.
- Web operation tests:
  - Safe invalid input results.
  - Workspace-scoped dashboard summary.
  - Filtered paginated history result.
  - Unrelated workspace reports excluded.
  - Unscoped history does not include workspace reports.
- Playwright seeded-data flow:
  - User opens workspace research dashboard.
  - User filters by status/date/question/warnings.
  - Pagination preserves active filters.
  - User opens report detail from a filtered report card.
  - Unrelated workspace reports are hidden.

Tests must use isolated temporary SQLite databases and seeded records. They must not require live
Ollama, SearXNG, public websites, browser automation providers, or model calls.

## Out Of Scope

- Source-quality feedback.
- Report usefulness feedback.
- Memory proposal approve/reject or report-context review.
- Export or copy actions.
- Report content mutation or deletion.
- Report reruns.
- Schedules, watchlists, recurring jobs, email, external publishing, browser automation, or model
  calls.
- Direct database access from browser code.
- SQLite FTS, vector retrieval, cross-workspace history, or global all-workspaces report browsing.

## Risks And Ambiguities

- There is an existing plan file using PAP-091/PAP-093 for live QA hardening. This plan follows the
  Phase 6 backlog definitions for PAP-091/PAP-092 and leaves the existing file untouched.
- `hasPendingMemoryProposal` requires joining report executions to semantic memory. Keep this
  read-only and count-based to avoid slipping into PAP-095 memory proposal review.
- Question search with `like` is sufficient for this slice but may not scale if report history grows
  large. Revisit with SQLite FTS only when a backlog ticket activates search indexing.
