# PAP-032 to PAP-041 and PAP-047 Phase 2 Persistence Baseline

Date: 2026-06-30
Status: Accepted for implementation
Tickets: PAP-032, PAP-033, PAP-035, PAP-036, PAP-038, PAP-039, PAP-041, PAP-047

## Scope

Implement the narrowed Phase 2 persistence slice for workspace, semantic memory, and episodic
memory storage.

- Add workspace contracts for active and archived workspace records.
- Add semantic and episodic memory contracts with scope, status, sensitivity, confidence,
  provenance, expiry, and JSON-compatible payload fields.
- Add bounded semantic and episodic memory query contracts.
- Add repository interfaces in `@pap/storage`.
- Add Drizzle SQLite tables, indexes, and concrete repositories in `@pap/storage-sqlite`.
- Add one additive generated migration after the current `0000_*` baseline.
- Add contract and SQLite integration tests for create, get, list, update, archive, expiry,
  soft delete, supersede, execution links, scope isolation, and migration idempotency.

## Decisions

- Keep contracts dependency-free except for Zod inside `@pap/contracts`.
- Keep `@pap/storage` type-only and free of Drizzle and `better-sqlite3`.
- Return contract-shaped domain records from repositories, never raw Drizzle rows.
- Store semantic memory values, semantic evidence refs, episodic related entities, and episodic
  evidence refs as JSON strings in SQLite and parse them at the repository boundary.
- Validate memory confidence as a bounded number from `0` through `1`.
- Validate scope rules in contracts and repositories: workspace scope requires `workspaceId`,
  capability scope requires `capabilityId`, and thread scope requires `threadId`.
- Default memory queries return active, non-expired records only.
- Keep supersede transactional: the old semantic record becomes `superseded`, and the replacement
  record becomes `active`.
- Use nullable foreign keys from memory tables to `workspaces.id` and `execution_traces.id`.
- Do not rewrite existing `0000_*` migrations.

## Files

- Add `packages/contracts/src/workspace.ts`.
- Add `packages/contracts/src/memory.ts`.
- Update `packages/contracts/src/index.ts`.
- Update `packages/contracts/test/contracts.test.mjs`.
- Add `packages/storage/src/interfaces/workspace-repository.ts`.
- Add `packages/storage/src/interfaces/semantic-memory-repository.ts`.
- Add `packages/storage/src/interfaces/episodic-memory-repository.ts`.
- Update `packages/storage/src/index.ts`.
- Add `packages/storage-sqlite/src/schema/workspaces.ts`.
- Add `packages/storage-sqlite/src/schema/semantic-memory.ts`.
- Add `packages/storage-sqlite/src/schema/episodic-memory.ts`.
- Update `packages/storage-sqlite/src/schema/constants.ts`.
- Update `packages/storage-sqlite/src/schema/index.ts`.
- Add `packages/storage-sqlite/src/repositories/workspace-repository.ts`.
- Add `packages/storage-sqlite/src/repositories/semantic-memory-repository.ts`.
- Add `packages/storage-sqlite/src/repositories/episodic-memory-repository.ts`.
- Update `packages/storage-sqlite/src/index.ts`.
- Add generated Drizzle migration SQL and metadata under `packages/storage-sqlite/drizzle/`.
- Update `packages/storage-sqlite/test/repository.test.mjs`.

## Dependencies

- Existing PAP-001 through PAP-031 baseline.
- `@pap/contracts` common opaque ID and ISO datetime schemas.
- Existing `@pap/storage` repository interface package.
- Existing Drizzle/SQLite setup and migration runner in `@pap/storage-sqlite`.
- Existing isolated temporary SQLite helpers in `@pap/testing`.

## Scripts

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/contracts typecheck`
- `pnpm --filter @pap/storage-sqlite db:generate`
- `pnpm --filter @pap/storage-sqlite db:migrate`
- `pnpm --filter @pap/storage-sqlite test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm typecheck`

## Verification Commands

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/contracts typecheck`
- `pnpm --filter @pap/storage typecheck`
- `pnpm --filter @pap/storage-sqlite db:generate`
- `pnpm --filter @pap/storage-sqlite db:migrate`
- `pnpm --filter @pap/storage-sqlite test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm typecheck`

## Out Of Scope

- Workspace management UI.
- Memory Explorer UI.
- Server API routes or server functions for memory.
- Runtime memory services or policy-aware write services.
- Runtime capability wiring to memory repositories.
- Context or memory search tools.
- Playwright or QA-Intel memory scenarios.
- Full-text search, vector search, embeddings, Ollama, SearXNG, scraping, research capability,
  email, document handling, approval flows, source-profile persistence, or deployment publishing.
