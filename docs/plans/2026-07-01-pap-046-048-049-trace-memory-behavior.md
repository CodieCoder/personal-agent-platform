# PAP-046, PAP-048, and PAP-049 Trace + Memory Behavior

Date: 2026-07-01
Status: Accepted for implementation
Tickets: PAP-046, PAP-048, PAP-049

## Scope

Make persisted traces and memory links useful as browser-verifiable historical evidence.

- Add `/executions` as a filtered execution history screen.
- Keep `/` as the echo run screen and `/executions/$executionId` as the trace detail route.
- Filter execution history by capability, status, workspace, and date range.
- Represent execution filters and pagination in URL query parameters.
- Keep execution results ordered newest-first with a deterministic tie-breaker.
- Let echo executions accept the selected workspace ID so browser-created traces can be
  workspace-scoped.
- Add Playwright coverage for execution filters, filtered trace detail navigation, memory browsing,
  execution-linked episodic memory, not-found states, and safe memory create errors.
- Add QA-Intel feature coverage for execution history filtering, workspace isolation, and
  execution-linked episodic memory inspection.

## Decisions

- Add a paged trace list contract result in `@pap/contracts`, including summary rows and page
  metadata.
- Extend the storage interface with a paged list method while preserving `listRecent()` for the
  home screen.
- Normalize invalid execution history URL filters safely in the route search parser before calling
  server functions.
- Use `YYYY-MM-DD` URL dates and convert them server-side to inclusive ISO `startedFrom` and
  `startedTo` filters.
- Use repository and `MemoryService` fixture helpers from Node-side Playwright and QA setup only.
- Use one isolated temporary SQLite database per Playwright run and per QA-Intel run.
- Keep tests parallel-safe through unique workspace and fixture IDs; do not rely on test order or
  browser database access.
- Add only the trace index migration needed for filtering performance.

## Files

- Update trace contracts in `packages/contracts/src/execution.ts`.
- Update trace storage interfaces in
  `packages/storage/src/interfaces/execution-trace-repository.ts`.
- Update SQLite trace schema and repository:
  - `packages/storage-sqlite/src/schema/execution-traces.ts`
  - `packages/storage-sqlite/src/repositories/execution-trace-repository.ts`
  - `packages/storage-sqlite/drizzle/*`
- Update execution server functions and components:
  - `apps/web/src/features/executions/server.ts`
  - `apps/web/src/features/executions/types.ts`
  - `apps/web/src/features/executions/components.tsx`
- Add `apps/web/src/routes/executions.tsx`.
- Update `apps/web/src/routes/index.tsx` and `apps/web/src/routes/__root.tsx`.
- Update generated `apps/web/src/routeTree.gen.ts` if route generation changes it.
- Add or update focused storage/web integration tests as needed.
- Expand Playwright tests under `e2e/`.
- Add QA-Intel feature files under `qa/features/` and update `qa/runner/src/index.ts`.

## Dependencies

- Existing PAP-001 through PAP-031 runtime, trace, web, Docker, and CI baseline.
- Existing PAP-034 through PAP-045 workspace and Memory Explorer UI/server functions.
- `MemoryService` for memory fixture creation and validation.
- SQLite repositories for server-side fixture seeding.
- Existing root scripts: `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`,
  `pnpm test:e2e`, `pnpm test:qa`, `pnpm lint`, and `pnpm format:check`.

## Verification Commands

- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm test:qa`
- `pnpm lint`
- `pnpm format:check`

## Manual Checks

- Open `/executions` with no filters and verify newest-first ordering.
- Filter by workspace, capability, status, and date range.
- Move between pages and verify active filters are retained in the URL.
- Open an execution detail page from a filtered result.
- Open invalid filter URLs and verify the screen normalizes or fails safely.
- Open Memory Explorer episodic records and follow an execution link where present.

## Out Of Scope

- Advanced observability dashboards, analytics aggregation, or external logging.
- New runtime capabilities beyond echo.
- Tool registry, skill loader, approval UX, research, email, document analysis, browser automation
  capabilities, vector search, embeddings, Ollama, SearXNG, scraping, or deployment publishing.
- Runtime or memory contract redesign beyond the trace list query and result types needed for this
  ticket batch.
- Direct browser database access.
