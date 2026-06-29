# Personal Agent Platform

Personal Agent Platform is a private, local-first personal agent system for one user.
The repository is being bootstrapped as a modular TypeScript monorepo with pnpm,
Turborepo, strict TypeScript, and Biome.

## Current Scope

This repository currently implements only PAP-001, PAP-002, and PAP-003 from
`docs/17-phase-0-1-backlog.md`.

Included now:

- Root package metadata and workspace configuration.
- Turborepo task configuration.
- Strict TypeScript base configuration.
- Biome formatting and linting configuration.
- Project documentation and generic coding-agent rules.

Not included yet:

- Application code.
- Workspace packages.
- Database code or migrations.
- Docker configuration.
- Runtime capabilities.

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
pnpm verify
```

## Root Scripts

- `pnpm format` formats tracked project files with Biome.
- `pnpm format:check` checks formatting without writing.
- `pnpm lint` runs Biome linting, then package lint tasks when packages exist.
- `pnpm typecheck` checks the root TypeScript config, then package typecheck tasks when packages exist.
- `pnpm test` runs the empty root Node test baseline, then package tests when packages exist.
- `pnpm build` runs configured Turbo build tasks when packages exist.
- `pnpm verify` runs the baseline local quality gate.
- `pnpm run ci` is an alias for `pnpm verify`; use `pnpm run ci` because `pnpm ci`
  is a pnpm install command.

## Repository Layout

- `docs/` contains product, architecture, backlog, and implementation planning docs.
- `docs/plans/` records accepted implementation plans before execution.
- `agents/` contains generic coding-agent rules and reusable agent skills for working on this repository.
- `apps/` and `packages/` are reserved for later backlog tickets and are not created in this slice.

## Planning Trace

Every accepted implementation plan must be saved under `docs/plans/` before code edits begin.
Use `YYYY-MM-DD-ticket-range-short-title.md` for plan filenames.
