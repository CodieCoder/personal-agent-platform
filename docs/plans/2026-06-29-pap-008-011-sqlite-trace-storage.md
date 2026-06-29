# PAP-008 to PAP-011 SQLite Trace Storage

Date: 2026-06-29
Ticket range: PAP-008 to PAP-011
Status: Accepted for implementation

## Summary

Implement the first concrete persistence slice:

- `@pap/storage-sqlite`
- Drizzle ORM and `better-sqlite3` setup
- Committed migrations for execution traces and trace steps
- A SQLite implementation of `ExecutionTraceRepository`

Do not add app code, runtime code, capabilities, Docker, memory, approvals, or UI.

## Decisions

- Keep `@pap/storage` free of Drizzle, SQLite, and `better-sqlite3`.
- Accept only local `file:` SQLite URLs for `PAP_DATABASE_URL` in this slice.
- Default `PAP_DATABASE_URL` to `file:./data/pap.db` and `PAP_DATA_DIR` to `./data`.
- Store timestamps as ISO `TEXT` values matching existing contracts.
- Keep migrations generated/committed under `packages/storage-sqlite/drizzle/`.
- Use package-local `node --test` tests against built ESM output, matching earlier bootstrap packages.
- Cap `listRecent` at 100 records and default it to 20 records.
- Approve PNPM build scripts only for required native/tooling packages: `better-sqlite3` and `esbuild`.

## Files

Create:

- `packages/storage-sqlite/package.json`
- `packages/storage-sqlite/tsconfig.json`
- `packages/storage-sqlite/drizzle.config.ts`
- `packages/storage-sqlite/src/db.ts`
- `packages/storage-sqlite/src/migrations.ts`
- `packages/storage-sqlite/src/schema/*.ts`
- `packages/storage-sqlite/src/repositories/execution-trace-repository.ts`
- `packages/storage-sqlite/src/index.ts`
- `packages/storage-sqlite/drizzle/*.sql`
- `packages/storage-sqlite/test/*.test.mjs`

Update:

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `.env.example`
- `README.md`
- `AGENTS.md`
- `agents/rules/repository-boundaries.md`
- `agents/skills/repository-bootstrap/SKILL.md`
- `packages/storage/src/interfaces/execution-trace-repository.ts`

## Dependencies And Scripts

- Add `drizzle-orm` and `better-sqlite3` to `@pap/storage-sqlite`.
- Add `drizzle-kit`, `@types/better-sqlite3`, and `@pap/testing` as development/test dependencies where needed.
- Add root scripts:
  - `db:generate`: `pnpm --filter @pap/storage-sqlite db:generate`
  - `db:migrate`: `pnpm --filter @pap/storage-sqlite db:migrate`
- Add package scripts:
  - `build`
  - `typecheck`
  - `lint`
  - `test`
  - `test:integration`
  - `db:generate`
  - `db:migrate`

## Repository Behavior

- `create` inserts a `running` execution trace.
- `appendStep` preserves explicit sequence order and rejects invalid execution IDs through a foreign key.
- `markCompleted`, `markFailed`, and `markCancelled` persist terminal status, timestamps, and error/reason details.
- `getById` returns a trace with steps ordered by `sequence`.
- `listRecent` filters by status and capability when provided and returns newest `started_at` first.
- The package must not expose a global raw database instance.

## Verification Commands

Run:

```sh
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:migrate
pnpm --filter @pap/storage-sqlite typecheck
pnpm --filter @pap/storage-sqlite test
pnpm --filter @pap/storage-sqlite test:integration
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## Out Of Scope

- No application code.
- No runtime package implementation.
- No capability implementation.
- No Docker or Compose files.
- No memory, research, approval, document, email, vector, source-profile, or capability registry tables.
- No external service credentials or side-effecting runtime behavior.
