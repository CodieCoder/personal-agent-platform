# Personal Agent Platform

Personal Agent Platform is a private, local-first personal agent system for one user.
The repository is being bootstrapped as a modular TypeScript monorepo with pnpm,
Turborepo, strict TypeScript, and Biome.

## Current Scope

This repository currently implements PAP-001 through PAP-021 from
`docs/17-phase-0-1-backlog.md`.

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
- Runtime package foundation:
  - `@pap/runtime`
- Core capability package:
  - `@pap/capability-echo`
- Web app package:
  - `@pap/web`
- SQLite trace storage with Drizzle migrations for execution traces and trace steps.
- Dependency-injected runtime execution of the echo capability with persisted traces.
- TanStack Start UI for running echo and viewing persisted execution traces.
- Project documentation and generic coding-agent rules.

Not included yet:

- Docker configuration.
- Worker application.
- Tool registry, approval flow, memory services, skill loader, and persistent capability registry.

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
pnpm db:migrate
pnpm verify
```

## Root Scripts

- `pnpm format` formats tracked project files with Biome.
- `pnpm format:check` checks formatting without writing.
- `pnpm lint` runs Biome linting, then package lint tasks when packages exist.
- `pnpm typecheck` checks the root TypeScript config, then package typecheck tasks when packages exist.
- `pnpm test` runs package tests through Turbo.
- `pnpm build` runs configured Turbo build tasks when packages exist.
- `pnpm dev:web` starts the TanStack Start web app.
- `pnpm db:generate` generates Drizzle SQL migrations for `@pap/storage-sqlite`.
- `pnpm db:migrate` applies committed SQLite migrations.
- `pnpm verify` runs the baseline local quality gate.
- `pnpm run ci` is an alias for `pnpm verify`; use `pnpm run ci` because `pnpm ci`
  is a pnpm install command.

## Repository Layout

- `docs/` contains product, architecture, backlog, and implementation planning docs.
- `docs/plans/` records accepted implementation plans before execution.
- `agents/` contains generic coding-agent rules and reusable agent skills for working on this repository.
- `apps/web/` contains the TanStack Start web application.
- `packages/` contains shared contracts/utilities/storage/testing packages, the runtime package, SQLite trace storage, and core capability packages.
- `packages/capabilities/echo/skills/echo/` contains the echo capability's runtime skill files.

## Planning Trace

Every accepted implementation plan must be saved under `docs/plans/` before code edits begin.
Use `YYYY-MM-DD-ticket-range-short-title.md` for plan filenames.
