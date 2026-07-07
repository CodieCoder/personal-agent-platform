# PAP-068 to PAP-071 Extraction and Source Profiles Plan

## Scope

- Add bounded article extraction contracts for normalized documents, methods, warnings, errors, and metadata.
- Implement generic Readability extraction from supplied HTML only in `@pap/tools-web-readability`.
- Support bounded `plain_text` fallback for valid text responses.
- Add source-profile contracts, SQLite schema, additive migration, repository interface, and SQLite repository.
- Add a framework-neutral source-profile service that matches active profiles by normalized hostname and tries selectors before generic fallback.

## Decisions

- Keep fetch/network behavior in `@pap/tools-web`; the readability package accepts already-fetched HTML or text only.
- Keep selector profiles as configuration records only; selectors are bounded strings and never execute JavaScript.
- Treat invalid profile data or selectors as warnings and continue to Readability/plain text fallback.
- Store source profiles in SQLite with a unique normalized domain and active/archived status.
- Exclude archived profiles from lookup and list operations by default.

## Files

- `packages/contracts/src/extraction.ts`
- `packages/contracts/src/source-profile.ts`
- `packages/contracts/src/index.ts`
- `packages/tools-web-readability/**`
- `packages/source-profiles/**`
- `packages/storage/src/interfaces/source-profile-repository.ts`
- `packages/storage/src/index.ts`
- `packages/storage-sqlite/src/schema/source-profiles.ts`
- `packages/storage-sqlite/src/schema/index.ts`
- `packages/storage-sqlite/src/repositories/source-profile-repository.ts`
- `packages/storage-sqlite/src/index.ts`
- `packages/storage-sqlite/drizzle/0005_source_profiles.sql`
- `packages/storage-sqlite/drizzle/meta/_journal.json`
- root TypeScript, Vitest, package, and lockfile configuration as needed.

## Dependencies

- Existing PAP-066 and PAP-067 fetch contracts/client.
- `@mozilla/readability` and `jsdom` for deterministic DOM-based article extraction.
- Existing Drizzle, better-sqlite3, Vitest, and workspace package conventions.

## Scripts

- `pnpm --filter @pap/tools-web-readability build`
- `pnpm --filter @pap/source-profiles build`
- `pnpm --filter @pap/storage-sqlite test:integration`

## Verification Commands

- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`

## Out Of Scope

- UI, capability packages, evidence persistence, trace integration, model ranking, memory writes, browser rendering, Crawlee, Firecrawl, scheduling, and automatic profile learning.
- Any network request from the Readability extractor.
- Source-profile management UI or runtime trace display.
