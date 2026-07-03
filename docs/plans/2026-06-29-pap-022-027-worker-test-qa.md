# PAP-022 to PAP-027 Worker Test QA

Date: 2026-06-29
Ticket range: PAP-022 to PAP-027
Status: Accepted for implementation

## Summary

Implement the next bootstrap slice:

- A standalone Node worker in `apps/worker`.
- A worker health command for environment, SQLite, migrations, and runtime bootstrap checks.
- A Vitest test baseline for contract and runtime integration coverage.
- A Playwright echo smoke test for the web UI and persisted trace detail route.
- A QA-Intel echo Gherkin scenario executed through `@qutecoder/qa-intel` with a small repo-local
  app launcher.

Build directly on PAP-018 to PAP-021. Do not add real scheduling, Docker, CI, new runtime
capabilities, external services, memory, approvals, tool execution, research, email, document, vector,
or source-profile behavior in this slice.

## Decisions

- Keep the worker as a standalone Node process that initializes runtime, logs registered capabilities,
  waits for shutdown, and does not start timers, cron, queues, or schedulers.
- Implement worker health as a command, not an HTTP endpoint.
- Use the same runtime/capability graph as the web app: SQLite trace repository plus
  `capability.echo`.
- Run committed SQLite migrations before opening the long-lived worker/web repository connection.
- Keep worker output safe: capability IDs, status, warning counts, and database path are allowed;
  environment dumps, secrets, raw payloads, and stack traces are not.
- Migrate package tests from `node:test` to Vitest now instead of maintaining two test runners.
- Add runtime-owned trace steps named exactly `validate input`, `validate output`, and
  `finalize execution` so browser and QA scenarios can assert product-visible workflow behavior.
- Use isolated temporary SQLite databases for integration, Playwright, and QA runs.
- Use `@qutecoder/qa-intel` for strict Gherkin compilation, Playwright-backed browser execution,
  JSON diagnostics, screenshots, and SQLite run history.
- Keep a repo-local QA launcher only for starting the web app with an isolated SQLite database and
  writing the latest JSON result summary under `qa/results/`.

## Files

Create:

- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/src/index.ts`
- `apps/worker/src/health.ts`
- `apps/worker/src/runtime-bootstrap.ts`
- `vitest.workspace.ts`
- `e2e/playwright.config.ts`
- `e2e/execution-trace.spec.ts`
- `qa/features/runtime-echo.feature`
- `qa/runner/package.json`
- `qa/runner/tsconfig.json`
- `qa/runner/src/index.ts`

Update:

- `package.json`
- `turbo.json`
- `tsconfig.json`
- `pnpm-lock.yaml`
- package-local test scripts and tests under `packages/*`
- `packages/runtime/src/execution-service.ts`
- `README.md`
- `AGENTS.md`
- `agents/rules/repository-boundaries.md`
- `agents/rules/tooling.md`
- `agents/skills/repository-bootstrap/SKILL.md`

## Worker Behavior

- `pnpm dev:worker` starts `apps/worker`.
- Startup validates environment, runs migrations, opens SQLite, creates a trace repository, creates the
  runtime, and logs registered capability IDs.
- `SIGTERM` and `SIGINT` close the SQLite connection and exit cleanly.
- `pnpm --filter @pap/worker health` validates environment, migrations, SQLite connectivity, and
  runtime bootstrap.
- Healthy health checks exit code `0`; bad environment or database configuration exits non-zero.
- Health output does not expose secrets or raw environment values.

## Test Behavior

- `pnpm test:unit` runs Vitest contract/package unit coverage.
- `pnpm test:integration` runs Vitest runtime/storage integration coverage.
- `pnpm test:e2e` runs Playwright against the visible echo flow.
- `pnpm test:qa` runs `qa/features/runtime-echo.feature` through `@qutecoder/qa-intel`.
- Runtime integration tests use temporary SQLite databases and prove:
  - successful echo execution,
  - invalid echo input,
  - unknown capability behavior,
  - trace persistence,
  - trace step ordering,
  - safe unhandled error serialization.
- Playwright and QA tests verify the UI shows the echo result, `completed` status, and trace steps
  including `validate input` and `finalize execution`.

## Dependencies And Scripts

- Add root dev dependencies:
  - `vitest`
  - `@playwright/test`
  - `tsx`
  - `@qutecoder/qa-intel`
- Add root scripts:
  - `dev:worker`
  - `test:unit`
  - `test:integration`
  - `test:e2e`
  - `test:qa`
- Keep package production dependencies narrow and put test/browser tooling in dev dependencies.
- Keep `verify` focused on stable local gates: format, lint, typecheck, unit tests, and integration
  tests. Browser and QA commands remain explicit.

## Verification Commands

Run:

```sh
pnpm install
pnpm --filter @pap/worker health
pnpm --filter @pap/worker build
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:qa
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## Out Of Scope

- No Docker, Compose, or CI changes.
- No real scheduler, cron, queue, or recurring jobs.
- No standalone API service.
- No new database tables or migrations beyond existing execution trace storage.
- No persistent capability registry implementation.
- No runtime capabilities beyond `capability.echo`.
- No tool registry, skill loader, approval flow, memory service, research, email, document, vector, or
  source-profile implementation.
- No external service credentials or network-backed runtime behavior.
