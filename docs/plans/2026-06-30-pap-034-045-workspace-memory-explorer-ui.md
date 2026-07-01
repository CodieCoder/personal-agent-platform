# PAP-034 and PAP-045 Workspace + Memory Explorer UI

Date: 2026-06-30
Status: Accepted for implementation
Tickets: PAP-034, PAP-045

## Scope

Build the next web UI slice around existing persisted workspace and memory storage.

- Add workspace management UI for listing, creating, selecting, viewing, and archiving workspaces.
- Add safe app-local workspace server functions backed by `SqliteWorkspaceRepository`.
- Add Memory Explorer routes for semantic and episodic memory list/detail flows.
- Use the existing `apps/web` memory server functions and `MemoryService` for all memory mutations.
- Keep browser code away from direct SQLite or repository access.

## Decisions

- Extend the web server runtime state to instantiate `SqliteWorkspaceRepository`.
- Mirror the existing memory/execution safe-result style for workspace server functions.
- Store the selected workspace in URL state for workspace-aware pages and mirror it to
  `localStorage` for refresh convenience.
- Exclude archived workspaces from active selectors by default, while keeping archived detail pages
  inspectable.
- Hide deleted and expired memory records by default.
- Mask sensitive memory payloads by default in lists and detail pages; reveal only after an
  explicit per-page action.
- Allow semantic edit only for `active` and `proposed` records.
- Keep delete as soft delete through `deleteMemoryRecord`.
- Parse manual semantic `value` and `evidenceRefs` fields as JSON where valid; reject invalid
  evidence arrays before calling server functions.

## Files

- Add `apps/web/src/features/workspaces/workspace.server.ts`.
- Add reusable workspace UI helpers/components under `apps/web/src/features/workspaces/`.
- Add or update workspace routes:
  - `apps/web/src/routes/workspaces.tsx`
  - `apps/web/src/routes/workspaces.$workspaceId.tsx`
- Add Memory Explorer UI helpers/components under `apps/web/src/features/memory/`.
- Add or update memory routes:
  - `apps/web/src/routes/memory.tsx`
  - `apps/web/src/routes/memory.semantic.tsx`
  - `apps/web/src/routes/memory.episodes.tsx`
  - `apps/web/src/routes/memory.$memoryId.tsx`
- Update `apps/web/src/routes/__root.tsx` shell navigation.
- Add focused `apps/web` integration tests for workspace server functions.
- Extend memory operation tests only where needed to protect UI-used behavior.
- Update generated TanStack route tree if the project generator changes it during verification.

## Dependencies

- Existing PAP-001 through PAP-031 web/runtime/storage baseline.
- PAP-032 and PAP-033 workspace contracts and SQLite repository.
- PAP-037, PAP-040, and PAP-044 `@pap/memory` service and web memory server functions.
- Existing TanStack Start server function pattern in `apps/web`.
- Existing Biome, TypeScript, Vitest, and build scripts.

## Verification Commands

- `pnpm --filter @pap/web typecheck`
- `pnpm --filter @pap/web lint`
- `pnpm --filter @pap/web build`
- `pnpm test:integration`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`

## Manual Checks

- Create a workspace, refresh, and verify the selected workspace is retained.
- Archive a workspace and verify selectors clear or exclude it.
- Open an invalid workspace ID and verify a safe not-found state.
- Create semantic memory with personal and workspace scope.
- Filter semantic and episodic memory by workspace, scope, status, sensitivity, and confidence.
- Open semantic and episodic memory detail pages.
- Reveal a sensitive payload explicitly.
- Edit semantic memory, soft-delete memory, and approve/reject an existing proposal.
- Follow source execution links when present.

## Out Of Scope

- Memory tools, context tools, or search tools.
- Vector search, embeddings, Ollama, SearXNG, scraping, email, documents, source-profile
  persistence, or deployment publishing.
- Team/org support, permissions engine, workspace settings engine, or auth model changes.
- Runtime contract redesign, storage schema redesign, or new external services.
- Full Playwright Memory Explorer suite; PAP-048 owns that browser regression coverage.
