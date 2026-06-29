# PAP-004 to PAP-007 Shared Package Foundation

Date: 2026-06-29
Ticket range: PAP-004 to PAP-007
Status: Accepted for implementation

## Scope

Implement the first shared workspace packages:

- `@pap/contracts` for dependency-light Zod schemas and inferred types.
- `@pap/shared` for low-level utilities: IDs, time, Result, env validation skeleton, logger, and safe error serialization.
- `@pap/storage` for persistence interfaces only.
- `@pap/testing` for fixture factories and test helper placeholders.

## Decisions

- Keep `@pap/contracts` dependent on `zod` only.
- Keep `@pap/storage` free of Drizzle, SQLite, and concrete adapter imports.
- Use Node 24 built-in `node:test` against built package output for the required early package tests instead of introducing Vitest before the formal test-baseline ticket.
- Add only minimal contracts needed by this range: identifiers, platform errors, execution statuses, traces, and trace steps. Capability manifest and runtime execution result contracts remain deferred to PAP-012.
- Make `@pap/testing` helpers importable without depending on `@pap/storage-sqlite`, which does not exist until PAP-008.

## Files

Create:

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/src/common.ts`
- `packages/contracts/src/errors.ts`
- `packages/contracts/src/execution.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/test/*.test.mjs`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/env.ts`
- `packages/shared/src/ids.ts`
- `packages/shared/src/logger.ts`
- `packages/shared/src/result.ts`
- `packages/shared/src/safe-error.ts`
- `packages/shared/src/time.ts`
- `packages/shared/src/index.ts`
- `packages/shared/test/*.test.mjs`
- `packages/storage/package.json`
- `packages/storage/tsconfig.json`
- `packages/storage/src/interfaces/*.ts`
- `packages/storage/src/index.ts`
- `packages/storage/test/*.test.mjs`
- `packages/testing/package.json`
- `packages/testing/tsconfig.json`
- `packages/testing/src/factories/*.ts`
- `packages/testing/src/fixtures/*.ts`
- `packages/testing/src/test-runtime.ts`
- `packages/testing/src/index.ts`
- `packages/testing/test/*.test.mjs`

Update:

- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `README.md`
- `AGENTS.md`
- `agents/rules/repository-boundaries.md`
- `agents/skills/repository-bootstrap/SKILL.md`

## Dependencies

- Add `zod` to `@pap/contracts`, `@pap/shared`, and `@pap/testing`.
- Add `pino` to `@pap/shared`.
- Add workspace dependencies from `@pap/storage` and `@pap/testing` to the packages they consume.

## Scripts

Each new package gets:

- `build`
- `typecheck`
- `lint`
- `test`

Root `test` now runs package tests through Turbo directly so Node test discovery does not
accidentally execute workspace source or generated declaration files.

## Verification Commands

Run:

```sh
pnpm install
pnpm --filter @pap/contracts build
pnpm --filter @pap/contracts typecheck
pnpm --filter @pap/shared test
pnpm --filter @pap/shared typecheck
pnpm --filter @pap/storage typecheck
pnpm --filter @pap/testing typecheck
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## Out Of Scope

- No application code.
- No runtime package implementation.
- No concrete SQLite storage adapter.
- No Drizzle, migrations, or database files.
- No capability manifest, capability execution result, or echo capability contracts from PAP-012 onward.
- No Docker, CI, Playwright, QA-Intel, Ollama, SearXNG, email, document, approval, memory, or generative UI implementation.
