# Personal Agent Platform

Personal Agent Platform is a private, local-first personal agent system for one user.
The repository is being bootstrapped as a modular TypeScript monorepo with pnpm,
Turborepo, strict TypeScript, and Biome.

## Current Scope

This repository currently implements the bootstrap slice through PAP-031 plus the active Phase 2
memory service/API slice for PAP-037, PAP-040, and PAP-044.

Included now:

- Root package metadata and workspace configuration.
- Turborepo task configuration.
- Strict TypeScript base configuration.
- Biome formatting and linting configuration.
- Shared workspace package foundations:
  - `@pap/contracts`
  - `@pap/shared`
  - `@pap/storage`
  - `@pap/storage-sqlite`
  - `@pap/testing`
  - `@pap/memory`
- Runtime package foundation:
  - `@pap/runtime`
- Core capability package:
  - `@pap/capability-echo`
- Web app package:
  - `@pap/web`
- Worker app package:
  - `@pap/worker`
- SQLite trace storage with Drizzle migrations for execution traces and trace steps.
- SQLite semantic and episodic memory storage with service-owned write policy.
- Dependency-injected runtime execution of the echo capability with persisted traces.
- Runtime memory injection through `MemoryService`; capability code receives only
  service-backed `context.memory` methods.
- TanStack Start UI for running echo and viewing persisted execution traces.
- TanStack Start server functions for bounded memory list/get/create/update/expire/delete and
  proposal approve/reject workflows.
- Worker startup and health checks using the same echo runtime graph.
- Vitest unit and integration test baseline.
- Playwright echo smoke test.
- QA-Intel echo feature executed through `@qutecoder/qa-intel` with a local app launcher.
- Docker images for the web app and worker.
- Local-first Compose baseline with `web`, `worker`, and a persistent `pap-data` volume.
- GitHub Actions CI for format, lint, typecheck, tests, build, and Playwright smoke.
- Project documentation and generic coding-agent rules.

Not included yet:

- Dockerized Ollama, SearXNG, reverse proxy, or deployment publishing.
- Real worker scheduling, cron, queues, or recurring jobs.
- Memory Explorer UI, context tools, vector search, Ollama, SearXNG, scraping, email, or document
  workflows.
- Tool registry, approval flow, skill loader, and persistent capability registry.

## Prerequisites

- Node.js 24.15.0, matching `.nvmrc`.
- Corepack enabled.
- pnpm 11.x, with `packageManager` pinned in `package.json`.

## Quickstart

```sh
corepack enable
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:qa
pnpm db:migrate
pnpm verify
```

## Docker Compose

The local Compose baseline builds and runs only the platform web and worker services:

```sh
pnpm docker:up
pnpm docker:logs
pnpm docker:down
```

Compose binds the web app to `127.0.0.1:${PAP_PORT:-3000}` and stores SQLite data in the named
`pap-data` volume mounted at `/app/data`. `pnpm docker:down` does not remove that named volume.

To smoke test an already-running Compose app:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
```

## Root Scripts

- `pnpm format` formats tracked project files with Biome.
- `pnpm format:check` checks formatting without writing.
- `pnpm lint` runs Biome linting, then package lint tasks when packages exist.
- `pnpm typecheck` checks the root TypeScript config, then package typecheck tasks when packages exist.
- `pnpm test` runs Vitest unit and integration suites.
- `pnpm test:unit` runs the Vitest unit project.
- `pnpm test:integration` runs the Vitest integration project.
- `pnpm test:e2e` runs the Playwright echo smoke test.
- `pnpm test:qa` starts the web app with an isolated test database and runs the QA-Intel echo feature.
- `pnpm build` runs configured Turbo build tasks when packages exist.
- `pnpm dev:web` starts the TanStack Start web app.
- `pnpm --filter @pap/web start` serves the built TanStack Start app through `srvx`.
- `pnpm dev:worker` starts the standalone worker process.
- `pnpm --filter @pap/worker health` checks worker/runtime/database health.
- `pnpm db:generate` generates Drizzle SQL migrations for `@pap/storage-sqlite`.
- `pnpm db:migrate` applies committed SQLite migrations.
- `pnpm docker:up` builds and starts the Compose web and worker services.
- `pnpm docker:down` stops the Compose services without removing the named data volume.
- `pnpm docker:logs` follows Compose service logs.
- `pnpm verify` runs the baseline local quality gate.
- `pnpm run ci` is an alias for `pnpm verify`; use `pnpm run ci` because `pnpm ci`
  is a pnpm install command.

## Repository Layout

- `docs/` contains product, architecture, backlog, and implementation planning docs.
- `docs/plans/` records accepted implementation plans before execution.
- `agents/` contains generic coding-agent rules and reusable agent skills for working on this repository.
- `apps/web/` contains the TanStack Start web application.
- `apps/worker/` contains the standalone worker process and health command.
- `docker/` contains production Dockerfiles for the web and worker services.
- `compose.yml` runs the local-first web/worker self-hosting baseline.
- `.github/workflows/ci.yml` defines the ordered GitHub Actions quality pipeline.
- `e2e/` contains Playwright browser smoke tests.
- `qa/` contains QA-Intel feature files and the local app-launching QA runner.
- `.qa-results/` is generated by QA-Intel for browser artifacts and SQLite run history.
- `packages/` contains shared contracts/utilities/storage/testing packages, the runtime and memory
  packages, SQLite trace and memory storage, and core capability packages.
- `packages/capabilities/echo/skills/echo/` contains the echo capability's runtime skill files.

## Planning Trace

Every accepted implementation plan must be saved under `docs/plans/` before code edits begin.
Use `YYYY-MM-DD-ticket-range-short-title.md` for plan filenames.
